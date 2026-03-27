const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const source = Game.getObjectById(action.data.sourceId);
    const targetAmount = action.data.amount || 0;

    if (targetAmount > 0) {
        const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

        if (
            currentEnergy >= targetAmount ||
            creep.store.getFreeCapacity(RESOURCE_ENERGY) <= 0
        ) {
            return true;
        }
    }

    if (!source) {
        return false;
    }

    const result = creep.harvest(source);

    if (result === OK) {
        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(source);
        return false;
    }

    return false;
}

function onCompleted() {
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
