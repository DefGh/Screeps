const constants = require("./constants");
const resourceManager = require("./resource.manager");

function onCompleted() {
}

function tryDispatch(task, creep) {
    if (
        task.type !== constants.taskTypes.BUILD ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL
    ) {
        return [];
    }

    if (countActiveBuildActions(task) >= 2) {
        return [];
    }

    const room = Game.rooms[task.room];

    if (!room) {
        return [];
    }

    const sites = room.find(FIND_CONSTRUCTION_SITES);

    if (sites.length === 0) {
        return [];
    }

    const target = pickTargetSite(creep, sites);

    if (!target) {
        return [];
    }

    const remainingAmount = getRemainingEnergyNeed(target);

    if (remainingAmount <= 0) {
        return [];
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy > 0) {
        return [
            createBuildTemplate(target.id, Math.min(currentEnergy, remainingAmount)),
        ];
    }

    const assignedAmount = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        remainingAmount
    );
    const energyAction = resourceManager.reserve(creep, assignedAmount);

    if (!energyAction) {
        return [];
    }

    return [
        energyAction,
        createBuildTemplate(target.id, assignedAmount),
    ];
}

function countActiveBuildActions(task) {
    let count = 0;

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.BUILD &&
            action.status !== "done"
        ) {
            count += 1;
        }
    }

    return count;
}

function pickTargetSite(creep, sites) {
    let bestPriority = Infinity;
    const targets = [];

    for (const site of sites) {
        const priority = getBuildPriority(site.structureType);

        if (priority < bestPriority) {
            bestPriority = priority;
            targets.length = 0;
            targets.push(site);
            continue;
        }

        if (priority === bestPriority) {
            targets.push(site);
        }
    }

    return creep.pos.findClosestByRange(targets) || targets[0];
}

function getBuildPriority(structureType) {
    switch (structureType) {
    case STRUCTURE_CONTAINER:
        return 0;
    case STRUCTURE_TOWER:
        return 1;
    case STRUCTURE_EXTENSION:
        return 2;
    case STRUCTURE_RAMPART:
        return 3;
    case STRUCTURE_WALL:
        return 4;
    default:
        return 5;
    }
}

function getRemainingEnergyNeed(target) {
    return Math.ceil((target.progressTotal - target.progress) / BUILD_POWER);
}

function createBuildTemplate(targetId, amount) {
    return {
        type: constants.actionTypes.BUILD,
        data: {
            amount: amount,
            done: 0,
            targetId: targetId,
        },
    };
}

module.exports = {
    onCompleted,
    tryDispatch,
};
