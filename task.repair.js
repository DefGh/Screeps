const buildTask = require("./task.build");
const constants = require("./constants");
const movement = require("./movement");
const resourceManager = require("./resource.manager");
const taskIndex = require("./task.index");

function run(creep, task) {
    if (!isValidRepairTask(task) || typeof creep.moveTo !== "function" || typeof creep.repair !== "function") {
        return true;
    }

    if (task.data.stage === constants.repairTaskStages.PLAN) {
        return runPlanStage(creep, task);
    }

    if (task.data.remainingAmount <= 0) {
        return true;
    }

    if (task.data.stage === constants.repairTaskStages.COLLECT) {
        return runCollectStage(creep, task);
    }

    if (task.data.stage === constants.repairTaskStages.REPAIR) {
        return runRepairStage(creep, task);
    }

    return true;
}

function runPlanStage(creep, task) {
    const taskData = buildRepairExecutionPlan(creep, task, task.id);

    if (!taskData) {
        return true;
    }

    task.data.resourceType = taskData.resourceType;
    task.data.sourceId = taskData.sourceId;
    task.data.sourceType = taskData.sourceType;
    task.data.amount = taskData.amount;
    task.data.remainingAmount = taskData.remainingAmount;
    task.data.collectRemainingAmount = taskData.collectRemainingAmount;
    task.data.stage = taskData.stage;
    resourceManager.invalidateResourcePlanCache();

    return run(creep, task);
}

function runCollectStage(creep, task) {
    const currentEnergy = resourceManager.getUsedEnergy(creep);

    if (
        task.data.collectRemainingAmount <= 0 ||
        currentEnergy >= task.data.remainingAmount ||
        resourceManager.getFreeEnergyCapacity(creep) === 0
    ) {
        switchToRepairStage(task);
        return false;
    }

    let source = resolveObject(task.data.sourceId);

    source = retargetSourceIfNeeded(creep, task, source);

    if (!source) {
        if (currentEnergy > 0) {
            switchToRepairStage(task, Math.min(task.data.remainingAmount, currentEnergy));
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
            switchToRepairStage(task, Math.min(task.data.remainingAmount, currentEnergy));
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
            switchToRepairStage(task);
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
        switchToRepairStage(task);
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        if (resourceManager.getUsedEnergy(creep) > 0) {
            switchToRepairStage(
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

function runRepairStage(creep, task) {
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

    const targetDemand = getRemainingRepairTargetDemand(target, task.data.repairGoal, task.id);

    if (targetDemand <= 0) {
        return true;
    }

    const energyToSpend = calculateRepairAmount(creep, task, targetDemand);

    if (energyToSpend <= 0) {
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

    if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET) {
        return true;
    }

    return true;
}

function buildRepairExecutionPlan(creep, task, currentTaskId) {
    if (!creep || !task || !task.data) {
        return null;
    }

    if (resourceManager.getActiveWorkParts(creep) <= 0) {
        return null;
    }

    const target = resolveObject(task.data.targetId);

    if (!target) {
        return null;
    }

    const targetDemand = getRemainingRepairTargetDemand(target, task.data.repairGoal, currentTaskId);

    if (targetDemand <= 0) {
        return null;
    }

    const currentEnergy = resourceManager.getUsedEnergy(creep);
    const startsWithEnergy = currentEnergy > 0;
    const transportAmount = startsWithEnergy ? currentEnergy : resourceManager.getFreeEnergyCapacity(creep);

    if (transportAmount <= 0) {
        return null;
    }

    let amount = Math.min(transportAmount, targetDemand);

    if (amount <= 0) {
        return null;
    }

    if (startsWithEnergy) {
        return {
            resourceType: RESOURCE_ENERGY,
            sourceId: null,
            sourceType: null,
            amount: amount,
            remainingAmount: amount,
            collectRemainingAmount: 0,
            stage: constants.repairTaskStages.REPAIR,
        };
    }

    const source = resourceManager.findBestEnergySource(creep, amount);

    if (!source || source.remainingAmount <= 0) {
        return null;
    }

    if (!source.canFullyReserve) {
        amount = Math.min(amount, source.remainingAmount);
    }

    if (amount <= 0) {
        return null;
    }

    return {
        resourceType: RESOURCE_ENERGY,
        sourceId: source.object.id,
        sourceType: source.type,
        amount: amount,
        remainingAmount: amount,
        collectRemainingAmount: amount,
        stage: constants.repairTaskStages.COLLECT,
    };
}

function getRemainingRepairTargetDemand(target, repairGoal, currentTaskId) {
    const baseDemand = getBaseRepairTargetDemand(target, repairGoal);
    let reservedDemand = 0;

    for (const task of taskIndex.getTasksByType(constants.taskTypes.REPAIR)) {
        if (!isRepairTask(task) || task.id === currentTaskId) {
            continue;
        }

        if (task.data.targetId !== target.id || getTaskResourceType(task) !== RESOURCE_ENERGY) {
            continue;
        }

        reservedDemand += getRepairReservationAmount(task);
    }

    return Math.max(0, baseDemand - reservedDemand);
}

function getBaseRepairTargetDemand(target, repairGoal) {
    if (
        !target ||
        typeof target.hits !== "number" ||
        typeof repairGoal !== "number"
    ) {
        return 0;
    }

    return Math.max(0, Math.ceil((repairGoal - target.hits) / getRepairPower()));
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

function calculateRepairAmount(creep, task, targetDemand) {
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

function resolveObject(objectId) {
    if (!objectId) {
        return null;
    }

    return Game.getObjectById(objectId);
}

function shouldWaitForSource(sourceType) {
    return sourceType === constants.transferEnergySourceTypes.SOURCE;
}

function switchToRepairStage(task, nextRemainingAmount) {
    task.data.stage = constants.repairTaskStages.REPAIR;
    task.data.collectRemainingAmount = 0;

    if (typeof nextRemainingAmount === "number") {
        task.data.remainingAmount = nextRemainingAmount;
    }

    resourceManager.invalidateResourcePlanCache();
}

function getRepairReservationAmount(task) {
    return typeof task.data.remainingAmount === "number" ? task.data.remainingAmount : 0;
}

function getTaskResourceType(task) {
    if (task && task.data && typeof task.data.resourceType === "string") {
        return task.data.resourceType;
    }

    return RESOURCE_ENERGY;
}

function getRepairPower() {
    return typeof REPAIR_POWER === "number" ? REPAIR_POWER : 1;
}

function isRepairTask(task) {
    return Boolean(task && task.type === constants.taskTypes.REPAIR && task.data);
}

function isValidRepairTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.REPAIR &&
        task.data &&
        typeof task.data.roomName === "string" &&
        typeof task.data.targetId === "string" &&
        typeof task.data.targetStructureType === "string" &&
        typeof task.data.repairGoal === "number" &&
        typeof task.data.amount === "number" &&
        typeof task.data.remainingAmount === "number" &&
        typeof task.data.collectRemainingAmount === "number" &&
        typeof task.data.stage === "string"
    );
}

function canPlanRepairTask(executor, task) {
    if (resourceManager.hasUrgentEnergyRequest(executor)) {
        return false;
    }

    if (buildTask.hasBuildWork(executor)) {
        return false;
    }

    if (hasHigherPriorityPendingRepairTask(executor, task)) {
        return false;
    }

    return Boolean(buildRepairExecutionPlan(executor, task, null));
}

function hasHigherPriorityPendingRepairTask(executor, task) {
    if (!task || !task.data || typeof task.data.roomName !== "string") {
        return false;
    }

    const currentPriority = getRepairStructurePriority(task.data.targetStructureType);

    if (currentPriority <= 0) {
        return false;
    }

    for (const otherTask of taskIndex.getPendingTasksByType(constants.taskTypes.REPAIR)) {
        if (
            !isValidRepairTask(otherTask) ||
            otherTask.id === task.id ||
            otherTask.data.roomName !== task.data.roomName
        ) {
            continue;
        }

        if (getRepairStructurePriority(otherTask.data.targetStructureType) >= currentPriority) {
            continue;
        }

        if (buildRepairExecutionPlan(executor, otherTask, null)) {
            return true;
        }
    }

    return false;
}

function getRepairStructurePriority(structureType) {
    if (structureType === STRUCTURE_RAMPART) {
        return 0;
    }

    if (structureType === STRUCTURE_WALL) {
        return 1;
    }

    return 2;
}

function canExecute(executor, task) {
    if (
        !validate(task) ||
        !executor ||
        !executor.memory ||
        !executor.room ||
        executor.room.name !== task.data.roomName ||
        executor.memory.originRoomName !== task.data.roomName ||
        typeof executor.moveTo !== "function" ||
        typeof executor.repair !== "function" ||
        resourceManager.getActiveWorkParts(executor) <= 0
    ) {
        return false;
    }

    if (task.data.stage !== constants.repairTaskStages.PLAN) {
        return true;
    }

    return canPlanRepairTask(executor, task);
}

function validate(task) {
    return isValidRepairTask(task);
}

function getOwnerRoom(task) {
    return validate(task) ? task.data.roomName : null;
}

module.exports = {
    canExecute,
    getOwnerRoom,
    run,
    validate,
};
