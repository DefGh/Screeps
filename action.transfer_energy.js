const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const targetAmount = action.data.amount || 0;
    const doneAmount = action.data.done || 0;
    const target = Game.getObjectById(action.data.targetId);

    if (targetAmount <= 0 || doneAmount >= targetAmount) {
        return true;
    }

    if (!target) {
        action.data.done = targetAmount;
        return true;
    }

    const freeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);

    if (freeCapacity <= 0) {
        action.data.done = targetAmount;
        return true;
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy <= 0) {
        return true;
    }

    const result = creep.transfer(target, RESOURCE_ENERGY);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    if (result === ERR_FULL) {
        action.data.done = targetAmount;
        return true;
    }

    if (result !== OK) {
        return false;
    }

    const transferredAmount = Math.min(
        targetAmount - doneAmount,
        currentEnergy,
        freeCapacity
    );

    action.data.done = doneAmount + transferredAmount;

    if (target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
        action.data.done = targetAmount;
    }

    return action.data.done >= targetAmount;
}

function onCompleted(action) {
    const task = tasks.getTask(action.taskId);

    if (!task) {
        return;
    }

    addTaskDone(task, action.data.done || 0);
}

function onCreepDeath() {
}

function addTaskDone(task, amount) {
    const total = task.data.total || 0;

    if (total <= 0 || amount <= 0) {
        return;
    }

    task.donePercent = Math.min(100, task.donePercent + ((amount / total) * 100));
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
