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
    const containerSites = sites.filter(function (site) {
        return site.structureType === STRUCTURE_CONTAINER;
    });
    const targets = containerSites.length > 0 ? containerSites : sites;

    return creep.pos.findClosestByRange(targets) || targets[0];
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
