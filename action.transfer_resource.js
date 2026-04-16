const tasks = require("./tasks");

function execute(creep, action) {
    const task = tasks.getTask(action.taskId);

    if (!task) {
        return true;
    }

    const resourceType = action.data.resourceType || RESOURCE_ENERGY;
    const targetAmount = action.data.amount || 0;
    const doneAmount = action.data.done || 0;
    const target = Game.getObjectById(action.data.targetId);

    if (targetAmount <= 0 || doneAmount >= targetAmount) {
        return true;
    }

    if (!target) {
        return true;
    }

    const freeCapacity = target.store.getFreeCapacity(resourceType);

    if (freeCapacity <= 0) {
        return true;
    }

    const currentAmount = creep.store.getUsedCapacity(resourceType);

    if (currentAmount <= 0) {
        return true;
    }

    const result = creep.transfer(target, resourceType);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    if (result === ERR_FULL) {
        return true;
    }

    if (result !== OK) {
        return false;
    }

    const transferredAmount = Math.min(
        targetAmount - doneAmount,
        currentAmount,
        freeCapacity
    );

    action.data.done = Math.min(targetAmount, doneAmount + transferredAmount);

    return (
        action.data.done >= targetAmount ||
        target.store.getFreeCapacity(resourceType) <= 0
    );
}

function onCompleted(action) {
    const task = tasks.getTask(action.taskId);

    if (!task) {
        return;
    }

    addTaskDone(task, action.data.done || 0);
}

function onCancel() {
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
    onCancel,
    onCompleted,
    onCreepDeath,
};
