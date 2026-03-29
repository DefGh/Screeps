const fillEnergy = require("./fill.energy");
const tasks = require("./tasks");

function execute(creep, action) {
    const task = tasks.getTask(action.taskId);

    if (!task) {
        return true;
    }

    const isFillEnergyAction = fillEnergy.isFillEnergyTask(task);
    const targetAmount = action.data.amount || 0;
    const doneAmount = action.data.done || 0;
    const target = Game.getObjectById(action.data.targetId);

    if (targetAmount <= 0 || doneAmount >= targetAmount) {
        return true;
    }

    if (!target) {
        if (!isFillEnergyAction) {
            action.data.done = targetAmount;
        }

        return true;
    }

    const freeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);

    if (freeCapacity <= 0) {
        if (!isFillEnergyAction) {
            action.data.done = targetAmount;
        }

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
        if (!isFillEnergyAction) {
            action.data.done = targetAmount;
        }

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

    action.data.done = Math.min(targetAmount, doneAmount + transferredAmount);

    if (!isFillEnergyAction && target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0) {
        action.data.done = targetAmount;
    }

    return (
        action.data.done >= targetAmount ||
        target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0
    );
}

function onCompleted(action) {
    const task = tasks.getTask(action.taskId);

    if (!task) {
        return;
    }

    if (fillEnergy.isFillEnergyTask(task)) {
        fillEnergy.settleTransferAction(task, action);
        return;
    }

    addTaskDone(task, action.data.done || 0);
}

function onCancel(action) {
    const task = tasks.getTask(action.taskId);

    if (!fillEnergy.isFillEnergyTask(task)) {
        return;
    }

    fillEnergy.settleTransferAction(task, action);
}

function onCreepDeath(event, action) {
    const task = tasks.getTask(action.taskId);

    if (!fillEnergy.isFillEnergyTask(task)) {
        return;
    }

    fillEnergy.settleTransferAction(task, action);
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
