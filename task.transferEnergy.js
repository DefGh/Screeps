const constants = require("./constants");
const resourceManager = require("./resource.manager");

function run(creep, task) {
    if (!isValidTransferEnergyTask(task) || typeof creep.moveTo !== "function") {
        return true;
    }

    recordTransferRoadVisit(creep, task);

    if (task.data.remainingAmount <= 0) {
        return true;
    }

    if (task.data.stage === constants.transferEnergyTaskStages.COLLECT) {
        return runCollectStage(creep, task);
    }

    if (task.data.stage === constants.transferEnergyTaskStages.DELIVER) {
        return runDeliverStage(creep, task);
    }

    return true;
}

function ensureTransferEnergyTask(creep) {
    if (!creep.room || !creep.memory) {
        return false;
    }

    const taskData = resourceManager.buildTransferEnergyTaskData(creep);

    if (!taskData) {
        return false;
    }

    const taskId = nextTaskId(constants.taskTypes.TRANSFER_ENERGY);
    addTask({
        id: taskId,
        type: constants.taskTypes.TRANSFER_ENERGY,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: taskData,
    });

    return true;
}

function runCollectStage(creep, task) {
    const currentEnergy = resourceManager.getUsedEnergy(creep);

    if (
        task.data.collectRemainingAmount <= 0 ||
        currentEnergy >= task.data.remainingAmount ||
        resourceManager.getFreeEnergyCapacity(creep) === 0
    ) {
        switchToDeliverStage(task);
        return false;
    }

    let source = resolveObject(task.data.sourceId);

    source = retargetSourceIfNeeded(creep, task, source);

    if (!source) {
        if (currentEnergy > 0) {
            switchToDeliverStage(task, Math.min(task.data.remainingAmount, currentEnergy));
            return false;
        }

        return true;
    }

    const availableEnergy = resourceManager.getAvailableSourceEnergy(
        task.data.sourceType,
        source,
        task.id
    );

    if (availableEnergy <= 0) {
        if (currentEnergy > 0) {
            switchToDeliverStage(task, Math.min(task.data.remainingAmount, currentEnergy));
            return false;
        }

        return shouldWaitForSource(task.data.sourceType);
    }

    const energyBefore = currentEnergy;
    const result = collectFromSource(creep, task, source);
    const collectedAmount = Math.max(0, resourceManager.getUsedEnergy(creep) - energyBefore);
    let didChangePlanState = false;

    if (collectedAmount > 0) {
        task.data.collectRemainingAmount = Math.max(0, task.data.collectRemainingAmount - collectedAmount);
        didChangePlanState = true;
    }

    if (result === OK) {
        if (
            task.data.collectRemainingAmount <= 0 ||
            resourceManager.getFreeEnergyCapacity(creep) === 0 ||
            resourceManager.getUsedEnergy(creep) >= task.data.remainingAmount
        ) {
            switchToDeliverStage(task);
            return false;
        }

        if (didChangePlanState) {
            resourceManager.invalidateResourcePlanCache();
        }

        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(source);
        return false;
    }

    if (result === ERR_FULL) {
        switchToDeliverStage(task);
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        if (resourceManager.getUsedEnergy(creep) > 0) {
            switchToDeliverStage(
                task,
                Math.min(task.data.remainingAmount, resourceManager.getUsedEnergy(creep))
            );
            return false;
        }

        return shouldWaitForSource(task.data.sourceType);
    }

    if (result === ERR_BUSY) {
        if (didChangePlanState) {
            resourceManager.invalidateResourcePlanCache();
        }
        return false;
    }

    if (didChangePlanState) {
        resourceManager.invalidateResourcePlanCache();
    }

    return true;
}

function runDeliverStage(creep, task) {
    if (task.data.remainingAmount <= 0) {
        return true;
    }

    const currentEnergy = resourceManager.getUsedEnergy(creep);

    if (currentEnergy <= 0) {
        return true;
    }

    const target = resolveObject(task.data.targetId);

    if (!target) {
        return true;
    }

    const targetDemand = resourceManager.getRemainingTargetDemand(
        task.data.targetType,
        target,
        creep,
        task.id
    );

    if (targetDemand <= 0) {
        return true;
    }

    const energyToSpend = calculateDeliveryAmount(creep, task, targetDemand);

    if (energyToSpend <= 0) {
        return true;
    }

    const result = deliverToTarget(creep, task, target, energyToSpend);

    if (result === OK) {
        task.data.remainingAmount -= energyToSpend;
        resourceManager.invalidateResourcePlanCache();

        if (task.data.remainingAmount <= 0) {
            return true;
        }

        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    if (result === ERR_BUSY) {
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        return true;
    }

    if (result === ERR_FULL || result === ERR_INVALID_TARGET) {
        return true;
    }

    return true;
}

function collectFromSource(creep, task, source) {
    if (task.data.sourceType === constants.transferEnergySourceTypes.SOURCE) {
        return creep.harvest(source);
    }

    if (task.data.sourceType === constants.transferEnergySourceTypes.PILE) {
        return creep.pickup(source);
    }

    if (task.data.sourceType === constants.transferEnergySourceTypes.CONTAINER) {
        const amount = Math.min(task.data.collectRemainingAmount, resourceManager.getFreeEnergyCapacity(creep));
        return creep.withdraw(source, RESOURCE_ENERGY, amount);
    }

    return ERR_INVALID_TARGET;
}

function deliverToTarget(creep, task, target, energyToSpend) {
    if (
        task.data.targetType === constants.transferEnergyTargetTypes.SPAWN ||
        task.data.targetType === constants.transferEnergyTargetTypes.EXTENSION
    ) {
        return creep.transfer(target, RESOURCE_ENERGY, energyToSpend);
    }

    if (task.data.targetType === constants.transferEnergyTargetTypes.CONTROLLER) {
        return creep.upgradeController(target);
    }

    return ERR_INVALID_TARGET;
}

function calculateDeliveryAmount(creep, task, targetDemand) {
    const currentEnergy = resourceManager.getUsedEnergy(creep);
    const remainingAmount = task.data.remainingAmount;

    if (
        task.data.targetType === constants.transferEnergyTargetTypes.SPAWN ||
        task.data.targetType === constants.transferEnergyTargetTypes.EXTENSION
    ) {
        return Math.min(currentEnergy, remainingAmount, targetDemand);
    }

    if (task.data.targetType === constants.transferEnergyTargetTypes.CONTROLLER) {
        const perTick = Math.min(
            resourceManager.getActiveWorkParts(creep) * getUpgradeControllerPower(),
            getControllerUpgradeLimit()
        );
        return Math.min(currentEnergy, remainingAmount, targetDemand, perTick);
    }

    return 0;
}

function retargetSourceIfNeeded(creep, task, source) {
    if (task.data.collectRemainingAmount <= 0) {
        return source;
    }

    const currentAvailable = source
        ? resourceManager.getAvailableSourceEnergy(task.data.sourceType, source, task.id)
        : 0;

    const alternativeSource = resourceManager.findBestEnergySource(
        creep,
        task.data.collectRemainingAmount,
        task.data.sourceId
    );

    if (shouldUseAlternativeSource(task, currentAvailable, alternativeSource)) {
        reassignSource(task, alternativeSource);
        return alternativeSource.object;
    }

    return source;
}

function recordTransferRoadVisit(creep, task) {
    if (!creep || !creep.memory || !creep.pos || !creep.room || !isOwnedManagedRoom(creep.room)) {
        clearTransferRoadTrack(creep);
        return;
    }

    const roomName = resolveTransferTaskRoomName(creep, task);

    if (!roomName || creep.room.name !== roomName) {
        clearTransferRoadTrack(creep);
        return;
    }

    const previousTrack = creep.memory.transferRoadTrack;

    if (!shouldCountTransferRoadVisit(previousTrack, task, creep.pos)) {
        updateTransferRoadTrack(creep, task, roomName);
        return;
    }

    incrementRoadHeat(roomName, creep.pos);
    updateTransferRoadTrack(creep, task, roomName);
}

function shouldUseAlternativeSource(task, currentAvailable, alternativeSource) {
    if (!alternativeSource || alternativeSource.remainingAmount <= 0) {
        return false;
    }

    if (currentAvailable <= 0) {
        return true;
    }

    return currentAvailable < task.data.collectRemainingAmount && alternativeSource.canFullyReserve;
}

function reassignSource(task, source) {
    task.data.sourceId = source.object.id;
    task.data.sourceType = source.type;
    resourceManager.invalidateResourcePlanCache();
}

function resolveTransferTaskRoomName(creep, task) {
    const target = resolveObject(task.data.targetId);

    if (target && target.room && typeof target.room.name === "string") {
        return target.room.name;
    }

    const source = resolveObject(task.data.sourceId);

    if (source && source.room && typeof source.room.name === "string") {
        return source.room.name;
    }

    return creep.room && typeof creep.room.name === "string" ? creep.room.name : null;
}

function shouldCountTransferRoadVisit(previousTrack, task, position) {
    if (!previousTrack) {
        return false;
    }

    if (previousTrack.taskId !== task.id || previousTrack.tick !== Game.time - 1) {
        return false;
    }

    return (
        previousTrack.roomName !== position.roomName ||
        previousTrack.x !== position.x ||
        previousTrack.y !== position.y
    );
}

function updateTransferRoadTrack(creep, task, roomName) {
    creep.memory.transferRoadTrack = {
        roomName: roomName,
        x: creep.pos.x,
        y: creep.pos.y,
        taskId: task.id,
        tick: Game.time,
    };
}

function clearTransferRoadTrack(creep) {
    if (creep && creep.memory && creep.memory.transferRoadTrack) {
        delete creep.memory.transferRoadTrack;
    }
}

function incrementRoadHeat(roomName, position) {
    const roadHeat = getRoadHeatMemory(roomName);
    const tickKey = String(Game.time);
    const positionKey = buildRoadHeatPositionKey(roomName, position.x, position.y);

    if (!roadHeat.bucketsByTick[tickKey] || typeof roadHeat.bucketsByTick[tickKey] !== "object") {
        roadHeat.bucketsByTick[tickKey] = {};
    }

    if (typeof roadHeat.bucketsByTick[tickKey][positionKey] !== "number") {
        roadHeat.bucketsByTick[tickKey][positionKey] = 0;
    }

    if (typeof roadHeat.totalsByPos[positionKey] !== "number") {
        roadHeat.totalsByPos[positionKey] = 0;
    }

    roadHeat.bucketsByTick[tickKey][positionKey] += 1;
    roadHeat.totalsByPos[positionKey] += 1;
}

function getRoadHeatMemory(roomName) {
    const roomMemory = getConstructionRoomMemory(roomName);

    if (!roomMemory.roadHeat || typeof roomMemory.roadHeat !== "object") {
        roomMemory.roadHeat = {};
    }

    if (!roomMemory.roadHeat.totalsByPos || typeof roomMemory.roadHeat.totalsByPos !== "object") {
        roomMemory.roadHeat.totalsByPos = {};
    }

    if (!roomMemory.roadHeat.bucketsByTick || typeof roomMemory.roadHeat.bucketsByTick !== "object") {
        roomMemory.roadHeat.bucketsByTick = {};
    }

    if (typeof roomMemory.roadHeat.lastPrunedTick !== "number") {
        roomMemory.roadHeat.lastPrunedTick = Game.time;
    }

    return roomMemory.roadHeat;
}

function getConstructionRoomMemory(roomName) {
    if (!Memory.construction || typeof Memory.construction !== "object") {
        Memory.construction = {};
    }

    if (!Memory.construction.rooms || typeof Memory.construction.rooms !== "object") {
        Memory.construction.rooms = {};
    }

    if (!Memory.construction.rooms[roomName] || typeof Memory.construction.rooms[roomName] !== "object") {
        Memory.construction.rooms[roomName] = {};
    }

    return Memory.construction.rooms[roomName];
}

function buildRoadHeatPositionKey(roomName, x, y) {
    return `${roomName}:${x}:${y}`;
}

function isOwnedManagedRoom(room) {
    return Boolean(room && room.controller && room.controller.my);
}

function resolveObject(objectId) {
    if (!objectId) {
        return null;
    }

    return Game.getObjectById(objectId);
}

function getUpgradeControllerPower() {
    return typeof UPGRADE_CONTROLLER_POWER === "number" ? UPGRADE_CONTROLLER_POWER : 1;
}

function getControllerUpgradeLimit() {
    return Infinity;
}

function shouldWaitForSource(sourceType) {
    return sourceType === constants.transferEnergySourceTypes.SOURCE;
}

function nextTaskId(type) {
    Memory.taskSequence += 1;
    return type + ":" + Memory.taskSequence;
}

function addTask(task) {
    Memory.tasks[task.id] = task;
    resourceManager.invalidateResourcePlanCache();
    //console.log(`task added ${task.id}`);
}

function switchToDeliverStage(task, nextRemainingAmount) {
    task.data.stage = constants.transferEnergyTaskStages.DELIVER;
    task.data.collectRemainingAmount = 0;

    if (typeof nextRemainingAmount === "number") {
        task.data.remainingAmount = nextRemainingAmount;
    }

    resourceManager.invalidateResourcePlanCache();
}

function isValidTransferEnergyTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.TRANSFER_ENERGY &&
        task.data &&
        typeof task.data.targetId === "string" &&
        typeof task.data.targetType === "string" &&
        typeof task.data.amount === "number" &&
        typeof task.data.remainingAmount === "number" &&
        typeof task.data.collectRemainingAmount === "number" &&
        typeof task.data.stage === "string"
    );
}

function canExecute(executor, task) {
    return isValidTransferEnergyTask(task) && typeof executor.moveTo === "function";
}

module.exports = {
    canExecute,
    ensureTransferEnergyTask,
    run,
};
