const resourceManager = require("./resource.manager");
const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const targetAmount = action.data.amount || 0;
    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const target = Game.getObjectById(action.data.pileId);

    if (
        targetAmount <= 0 ||
        currentEnergy >= targetAmount ||
        creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0
    ) {
        return true;
    }

    if (!target) {
        return false;
    }

    const result = creep.pickup(target);

    if (result === OK) {
        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    return false;
}

function onCompleted(action) {
    if (!action.data.reservationId) {
        return;
    }

    resourceManager.release(action.data.reservationId);
}

function onCreepDeath(event, action) {
    if (!action.data.reservationId) {
        return;
    }

    resourceManager.release(action.data.reservationId);
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
