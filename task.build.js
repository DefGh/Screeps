const constants = require("./constants");
const resourceManager = require("./resource.manager");

function run(creep, task) {
    if (!isValidBuildTask(task) || typeof creep.moveTo !== "function" || typeof creep.build !== "function") {
        return true;
    }

    if (task.data.remainingAmount <= 0) {
        return true;
    }

    if (task.data.stage === constants.buildTaskStages.COLLECT) {
        return runCollectStage(creep, task);
    }

    if (task.data.stage === constants.buildTaskStages.BUILD) {
        return runBuildStage(creep, task);
    }

    return true;
}

function ensureBuildTask(creep) {
    if (!creep || !creep.room || !creep.memory) {
        return false;
    }

    if (resourceManager.getActiveWorkParts(creep) <= 0) {
        return false;
    }

    if (hasUrgentEnergyRequest(creep)) {
        return false;
    }

    const target = findBestBuildTarget(creep);

    if (!target || target.remainingAmount <= 0) {
        return false;
    }

    const currentEnergy = resourceManager.getUsedEnergy(creep);
    const startsWithEnergy = currentEnergy > 0;
    const transportAmount = startsWithEnergy ? currentEnergy : resourceManager.getFreeEnergyCapacity(creep);

    if (transportAmount <= 0) {
        return false;
    }

    let amount = Math.min(transportAmount, target.remainingAmount);

    if (amount <= 0) {
        return false;
    }

    if (startsWithEnergy) {
        addTask({
            id: nextTaskId(constants.taskTypes.BUILD),
            type: constants.taskTypes.BUILD,
            status: constants.taskStatuses.PENDING,
            canExecute: [constants.roles.UNIVERSAL],
            data: {
                resourceType: RESOURCE_ENERGY,
                sourceId: null,
                sourceType: null,
                targetId: target.object.id,
                amount: amount,
                remainingAmount: amount,
                collectRemainingAmount: 0,
                stage: constants.buildTaskStages.BUILD,
            },
        });
        return true;
    }

    const source = resourceManager.findBestEnergySource(creep, amount);

    if (!source || source.remainingAmount <= 0) {
        return false;
    }

    if (!source.canFullyReserve) {
        amount = Math.min(amount, source.remainingAmount);
    }

    if (amount <= 0) {
        return false;
    }

    addTask({
        id: nextTaskId(constants.taskTypes.BUILD),
        type: constants.taskTypes.BUILD,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: {
            resourceType: RESOURCE_ENERGY,
            sourceId: source.object.id,
            sourceType: source.type,
            targetId: target.object.id,
            amount: amount,
            remainingAmount: amount,
            collectRemainingAmount: amount,
            stage: constants.buildTaskStages.COLLECT,
        },
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
        switchToBuildStage(task);
        return false;
    }

    let source = resolveObject(task.data.sourceId);

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
            switchToBuildStage(task);
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

function runBuildStage(creep, task) {
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
        creep.moveTo(target);
        return false;
    }

    if (result === ERR_BUSY) {
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        return true;
    }

    if (result === ERR_INVALID_TARGET) {
        return true;
    }

    return true;
}

function hasUrgentEnergyRequest(creep) {
    const targetTypes = constants.transferEnergyTargetTypes;
    const plan = resourceManager.getRoomResourcePlan(creep.room, RESOURCE_ENERGY);

    for (const entry of plan) {
        if (!entry || !entry.object) {
            continue;
        }

        if (
            entry.objectType !== targetTypes.SPAWN &&
            entry.objectType !== targetTypes.EXTENSION
        ) {
            continue;
        }

        if (getPlanEntryDemand(entry) > 0) {
            return true;
        }
    }

    return false;
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

function getPlanEntryDemand(entry) {
    if (!entry) {
        return 0;
    }

    if (entry.demandMode === "openEnded") {
        return Infinity;
    }

    return Math.max(0, entry.effectiveDemand);
}

function getRemainingBuildTargetDemand(target, currentTaskId) {
    const baseDemand = getBaseBuildTargetDemand(target);
    let reservedDemand = 0;

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!isBuildTask(task) || taskId === currentTaskId) {
            continue;
        }

        if (task.data.targetId !== target.id || getTaskResourceType(task) !== RESOURCE_ENERGY) {
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

function resolveObject(objectId) {
    if (!objectId) {
        return null;
    }

    return Game.getObjectById(objectId);
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

function getBuildPower() {
    return typeof BUILD_POWER === "number" ? BUILD_POWER : 1;
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
}

function switchToBuildStage(task, nextRemainingAmount) {
    task.data.stage = constants.buildTaskStages.BUILD;
    task.data.collectRemainingAmount = 0;

    if (typeof nextRemainingAmount === "number") {
        task.data.remainingAmount = nextRemainingAmount;
    }

    resourceManager.invalidateResourcePlanCache();
}

function getBuildReservationAmount(task) {
    return typeof task.data.remainingAmount === "number" ? task.data.remainingAmount : 0;
}

function getTaskResourceType(task) {
    if (task && task.data && typeof task.data.resourceType === "string") {
        return task.data.resourceType;
    }

    return RESOURCE_ENERGY;
}

function isBuildTask(task) {
    return Boolean(task && task.type === constants.taskTypes.BUILD && task.data);
}

function isValidBuildTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.BUILD &&
        task.data &&
        typeof task.data.targetId === "string" &&
        typeof task.data.amount === "number" &&
        typeof task.data.remainingAmount === "number" &&
        typeof task.data.collectRemainingAmount === "number" &&
        typeof task.data.stage === "string"
    );
}

function canExecute(executor, task) {
    return (
        isValidBuildTask(task) &&
        typeof executor.moveTo === "function" &&
        typeof executor.build === "function"
    );
}

module.exports = {
    canExecute,
    ensureBuildTask,
    run,
};
