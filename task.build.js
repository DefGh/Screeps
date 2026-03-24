const colonyManager = require("./colony.manager");
const constants = require("./constants");
const movement = require("./movement");
const resourceManager = require("./resource.manager");
const taskIndex = require("./task.index");
const taskHelpers = require("./task.helpers");

function run(creep, task) {
    if (!isValidBuildTask(task) || typeof creep.moveTo !== "function") {
        return true;
    }

    if (
        task.data.stage !== constants.buildTaskStages.FINISH_REPAIR &&
        typeof creep.build !== "function"
    ) {
        return true;
    }

    if (
        task.data.stage === constants.buildTaskStages.FINISH_REPAIR &&
        typeof creep.repair !== "function"
    ) {
        return true;
    }

    if (
        task.data.stage !== constants.buildTaskStages.FINISH_REPAIR &&
        task.data.remainingAmount <= 0
    ) {
        return true;
    }

    if (task.data.stage === constants.buildTaskStages.COLLECT) {
        return runCollectStage(creep, task);
    }

    if (task.data.stage === constants.buildTaskStages.BUILD) {
        return runBuildStage(creep, task);
    }

    if (task.data.stage === constants.buildTaskStages.FINISH_REPAIR) {
        return runFinishRepairStage(creep, task);
    }

    return true;
}

function ensureBuildTask(creep) {
    const taskData = buildBuildTaskData(creep);

    if (!taskData) {
        return false;
    }

    taskHelpers.addTask({
        id: taskHelpers.nextTaskId(constants.taskTypes.BUILD),
        type: constants.taskTypes.BUILD,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: taskData,
    });

    return true;
}

function hasBuildWork(creep) {
    return Boolean(buildBuildTaskData(creep));
}

function buildBuildTaskData(creep) {
    if (!creep || !creep.room || !creep.memory) {
        return null;
    }

    const roomName = typeof creep.room.name === "string" ? creep.room.name : null;

    if (!roomName || isBuildTaskCapReached(roomName)) {
        return null;
    }

    if (resourceManager.getActiveWorkParts(creep) <= 0) {
        return null;
    }

    if (resourceManager.hasUrgentEnergyRequest(creep)) {
        return null;
    }

    const target = findBestBuildTarget(creep);

    if (!target || target.remainingAmount <= 0) {
        return null;
    }

    const currentEnergy = resourceManager.getUsedEnergy(creep);
    const freeEnergyCapacity = resourceManager.getFreeEnergyCapacity(creep);
    const targetStructureType = getBuildTargetStructureType(target.object);
    const shouldMaximizeLoad = shouldMaximizeBuildTaskLoad(targetStructureType);
    const amount = getDesiredBuildTaskAmount(
        creep,
        currentEnergy,
        freeEnergyCapacity,
        target.remainingAmount,
        shouldMaximizeLoad
    );
    const collectAmount = Math.max(0, amount - currentEnergy);

    if (amount <= 0) {
        return null;
    }

    if (collectAmount <= 0) {
        return {
            roomName: roomName,
            resourceType: RESOURCE_ENERGY,
            sourceId: null,
            sourceType: null,
            targetId: target.object.id,
            targetStructureType: targetStructureType,
            targetPos: serializeTargetPosition(target.object.pos),
            amount: amount,
            remainingAmount: amount,
            collectRemainingAmount: 0,
            stage: constants.buildTaskStages.BUILD,
        };
    }

    const source = resourceManager.findBestEnergySource(creep, collectAmount);

    if (!source || source.remainingAmount <= 0) {
        if (currentEnergy <= 0) {
            return null;
        }

        return {
            roomName: roomName,
            resourceType: RESOURCE_ENERGY,
            sourceId: null,
            sourceType: null,
            targetId: target.object.id,
            targetStructureType: targetStructureType,
            targetPos: serializeTargetPosition(target.object.pos),
            amount: currentEnergy,
            remainingAmount: currentEnergy,
            collectRemainingAmount: 0,
            stage: constants.buildTaskStages.BUILD,
        };
    }

    let reservedCollectAmount = collectAmount;
    let reservedAmount = amount;

    if (!source.canFullyReserve) {
        reservedCollectAmount = Math.min(collectAmount, source.remainingAmount);
        reservedAmount = currentEnergy + reservedCollectAmount;
    }

    if (reservedAmount <= 0 || reservedCollectAmount <= 0) {
        return null;
    }

    return {
        roomName: roomName,
        resourceType: RESOURCE_ENERGY,
        sourceId: source.object.id,
        sourceType: source.type,
        targetId: target.object.id,
        targetStructureType: targetStructureType,
        targetPos: serializeTargetPosition(target.object.pos),
        amount: reservedAmount,
        remainingAmount: reservedAmount,
        collectRemainingAmount: reservedCollectAmount,
        stage: constants.buildTaskStages.COLLECT,
    };
}

function runCollectStage(creep, task) {
    const currentEnergy = resourceManager.getUsedEnergy(creep);

    if (
        task.data.collectRemainingAmount <= 0 ||
        currentEnergy >= task.data.remainingAmount ||
        resourceManager.getFreeEnergyCapacity(creep) === 0
    ) {
        switchToBuildStage(task);
        return false;
    }

    let source = taskHelpers.resolveObject(task.data.sourceId);

    source = retargetSourceIfNeeded(creep, task, source);

    if (!source) {
        if (currentEnergy > 0) {
            switchToBuildStage(task, Math.min(task.data.remainingAmount, currentEnergy));
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
            switchToBuildStage(task, Math.min(task.data.remainingAmount, currentEnergy));
            return false;
        }

        return taskHelpers.shouldWaitForSource(task.data.sourceType);
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
            switchToBuildStage(task);
            return false;
        }

        if (didChangePlanState) {
            resourceManager.invalidateResourcePlanCache();
        }

        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, source);
        return false;
    }

    if (result === ERR_FULL) {
        switchToBuildStage(task);
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        if (resourceManager.getUsedEnergy(creep) > 0) {
            switchToBuildStage(
                task,
                Math.min(task.data.remainingAmount, resourceManager.getUsedEnergy(creep))
            );
            return false;
        }

        return taskHelpers.shouldWaitForSource(task.data.sourceType);
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

function runBuildStage(creep, task) {
    if (task.data.remainingAmount <= 0) {
        return true;
    }

    const currentEnergy = resourceManager.getUsedEnergy(creep);

    if (currentEnergy <= 0) {
        return true;
    }

    const target = taskHelpers.resolveObject(task.data.targetId);

    if (!target) {
        if (switchToFinishRepairStage(task, currentEnergy)) {
            return false;
        }

        return true;
    }

    const targetDemand = getRemainingBuildTargetDemand(target, task.id);

    if (targetDemand <= 0) {
        return true;
    }

    const energyToSpend = calculateBuildAmount(creep, task, targetDemand);

    if (energyToSpend <= 0) {
        return true;
    }

    const energyBefore = currentEnergy;
    const result = creep.build(target);

    if (result === OK) {
        const currentEnergyAfterBuild = resourceManager.getUsedEnergy(creep);
        const spentEnergy = Math.max(0, energyBefore - currentEnergyAfterBuild);

        if (spentEnergy > 0) {
            task.data.remainingAmount = Math.max(0, task.data.remainingAmount - spentEnergy);
            resourceManager.invalidateResourcePlanCache();
        }

        if (!taskHelpers.resolveObject(task.data.targetId) && switchToFinishRepairStage(task, currentEnergyAfterBuild)) {
            return false;
        }

        if (task.data.remainingAmount <= 0) {
            return true;
        }

        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target);
        return false;
    }

    if (result === ERR_BUSY) {
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        return true;
    }

    if (result === ERR_INVALID_TARGET) {
        if (switchToFinishRepairStage(task, currentEnergy)) {
            return false;
        }

        return true;
    }

    return true;
}

function runFinishRepairStage(creep, task) {
    if (task.data.remainingAmount <= 0) {
        return true;
    }

    const currentEnergy = resourceManager.getUsedEnergy(creep);

    if (currentEnergy <= 0) {
        return true;
    }

    const target = resolveFinishedBuildTarget(creep, task);

    if (!target) {
        return true;
    }

    const energyBefore = currentEnergy;
    const result = creep.repair(target);

    if (result === OK) {
        const spentEnergy = Math.max(0, energyBefore - resourceManager.getUsedEnergy(creep));

        if (spentEnergy > 0) {
            task.data.remainingAmount = Math.max(0, task.data.remainingAmount - spentEnergy);
            resourceManager.invalidateResourcePlanCache();
        }

        if (task.data.remainingAmount <= 0 || resourceManager.getUsedEnergy(creep) <= 0) {
            return true;
        }

        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target);
        return false;
    }

    if (result === ERR_BUSY) {
        return false;
    }

    return true;
}

function findBestBuildTarget(creep) {
    const matchingSites = [];

    for (const site of creep.room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (getRemainingBuildTargetDemand(site, null) <= 0) {
            continue;
        }

        matchingSites.push(site);
    }

    const closestSite = chooseClosest(creep, matchingSites);

    if (!closestSite) {
        return null;
    }

    return {
        object: closestSite,
        remainingAmount: getRemainingBuildTargetDemand(closestSite, null),
    };
}

function getRemainingBuildTargetDemand(target, currentTaskId) {
    const baseDemand = getBaseBuildTargetDemand(target);
    let reservedDemand = 0;

    for (const task of taskIndex.getTasksByType(constants.taskTypes.BUILD)) {
        if (!isBuildTask(task) || task.id === currentTaskId) {
            continue;
        }

        if (task.data.targetId !== target.id || taskHelpers.getTaskResourceType(task) !== RESOURCE_ENERGY) {
            continue;
        }

        reservedDemand += getBuildReservationAmount(task);
    }

    return Math.max(0, baseDemand - reservedDemand);
}

function getBaseBuildTargetDemand(target) {
    if (!target) {
        return 0;
    }

    return Math.max(0, Math.ceil((target.progressTotal - target.progress) / getBuildPower()));
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

function calculateBuildAmount(creep, task, targetDemand) {
    const currentEnergy = resourceManager.getUsedEnergy(creep);
    const remainingAmount = task.data.remainingAmount;
    const workParts = resourceManager.getActiveWorkParts(creep);

    if (workParts <= 0) {
        return 0;
    }

    return Math.min(currentEnergy, remainingAmount, targetDemand, workParts);
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

function chooseClosest(executor, objects) {
    if (!objects || objects.length === 0) {
        return null;
    }

    if (executor.pos && typeof executor.pos.findClosestByRange === "function") {
        return executor.pos.findClosestByRange(objects);
    }

    return objects[0];
}

function switchToFinishRepairStage(task, currentEnergy) {
    if (!canFinishBuildAsRepair(task, currentEnergy)) {
        return false;
    }

    task.data.stage = constants.buildTaskStages.FINISH_REPAIR;
    task.data.collectRemainingAmount = 0;
    task.data.remainingAmount = currentEnergy;
    resourceManager.invalidateResourcePlanCache();
    return true;
}

function canFinishBuildAsRepair(task, currentEnergy) {
    return (
        isRepairAfterBuildTargetType(task.data.targetStructureType) &&
        hasTargetPosition(task.data.targetPos) &&
        typeof currentEnergy === "number" &&
        currentEnergy > 0
    );
}

function resolveFinishedBuildTarget(creep, task) {
    if (!hasTargetPosition(task.data.targetPos) || !isRepairAfterBuildTargetType(task.data.targetStructureType)) {
        return null;
    }

    const room =
        creep &&
        creep.room &&
        creep.room.name === task.data.targetPos.roomName
            ? creep.room
            : Game.rooms[task.data.targetPos.roomName];

    if (!room || typeof room.lookForAt !== "function") {
        return null;
    }

    const structures = room.lookForAt(
        LOOK_STRUCTURES,
        task.data.targetPos.x,
        task.data.targetPos.y
    );

    for (const structure of structures) {
        if (structure.structureType === task.data.targetStructureType) {
            return structure;
        }
    }

    return null;
}

function getBuildTargetStructureType(target) {
    return target && typeof target.structureType === "string"
        ? target.structureType
        : null;
}

function getDesiredBuildTaskAmount(creep, currentEnergy, freeEnergyCapacity, targetRemainingAmount, shouldMaximizeLoad) {
    if (shouldMaximizeLoad) {
        return resourceManager.getEnergyCapacity(creep);
    }

    if (currentEnergy > 0) {
        return Math.min(currentEnergy, targetRemainingAmount);
    }

    return Math.min(freeEnergyCapacity, targetRemainingAmount);
}

function serializeTargetPosition(position) {
    if (
        !position ||
        typeof position.x !== "number" ||
        typeof position.y !== "number"
    ) {
        return null;
    }

    return {
        roomName: typeof position.roomName === "string" ? position.roomName : null,
        x: position.x,
        y: position.y,
    };
}

function hasTargetPosition(position) {
    return Boolean(
        position &&
        typeof position.roomName === "string" &&
        typeof position.x === "number" &&
        typeof position.y === "number"
    );
}

function isRepairAfterBuildTargetType(structureType) {
    return structureType === STRUCTURE_WALL || structureType === STRUCTURE_RAMPART;
}

function shouldMaximizeBuildTaskLoad(structureType) {
    return isRepairAfterBuildTargetType(structureType);
}

function getBuildPower() {
    return 1;
}

function switchToBuildStage(task, nextRemainingAmount) {
    taskHelpers.switchTaskStage(task, constants.buildTaskStages.BUILD, nextRemainingAmount);
}

function getBuildReservationAmount(task) {
    return typeof task.data.remainingAmount === "number" ? task.data.remainingAmount : 0;
}

function getMaxBuildTaskCount(roomName) {
    return Math.max(1, Math.floor(colonyManager.getTargetUniversalsForRoom(roomName) / 2));
}

function getCurrentBuildTaskCount(roomName) {
    let count = 0;

    for (const task of taskIndex.getTasksByType(constants.taskTypes.BUILD)) {
        if (roomName && resolveBuildTaskRoomName(task) !== roomName) {
            continue;
        }

        count += 1;
    }

    return count;
}

function isBuildTaskCapReached(roomName) {
    return getCurrentBuildTaskCount(roomName) >= getMaxBuildTaskCount(roomName);
}

function isActiveBuildTask(task) {
    return (
        isBuildTask(task) &&
        (
            task.status === constants.taskStatuses.PENDING ||
            task.status === constants.taskStatuses.IN_PROGRESS
        )
    );
}

function isBuildTask(task) {
    return Boolean(task && task.type === constants.taskTypes.BUILD && task.data);
}

function resolveBuildTaskRoomName(task) {
    return validate(task) ? task.data.roomName : null;
}

function isValidBuildTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.BUILD &&
        task.data &&
        typeof task.data.roomName === "string" &&
        typeof task.data.targetId === "string" &&
        typeof task.data.amount === "number" &&
        typeof task.data.remainingAmount === "number" &&
        typeof task.data.collectRemainingAmount === "number" &&
        typeof task.data.stage === "string" &&
        (
            task.data.stage !== constants.buildTaskStages.FINISH_REPAIR ||
            (
                typeof task.data.targetStructureType === "string" &&
                hasTargetPosition(task.data.targetPos)
            )
        )
    );
}

function canExecute(executor, task) {
    const taskRoomName = resolveBuildTaskRoomName(task);

    return (
        validate(task) &&
        taskHelpers.canExecuteTaskInRoom(executor, taskRoomName, ["moveTo", "build"])
    );
}

function validate(task) {
    return isValidBuildTask(task);
}

function getOwnerRoom(task) {
    return taskHelpers.getTaskOwnerRoom(task, validate, "roomName");
}

module.exports = {
    canExecute,
    ensureBuildTask,
    getOwnerRoom,
    hasBuildWork,
    run,
    validate,
};
