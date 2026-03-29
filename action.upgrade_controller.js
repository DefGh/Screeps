const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const controller = getController(action.room, creep.room);
    const targetAmount = action.data.amount || 0;
    const doneAmount = action.data.done || 0;

    if (!controller || targetAmount <= 0 || doneAmount >= targetAmount) {
        return true;
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy <= 0) {
        return true;
    }

    const result = creep.upgradeController(controller);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller);
        return false;
    }

    if (result !== OK) {
        return false;
    }

    const remainingAmount = targetAmount - doneAmount;
    const spentAmount = Math.min(
        remainingAmount,
        currentEnergy,
        getUpgradePower(creep)
    );

    action.data.done = doneAmount + spentAmount;
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

function getController(roomName, fallbackRoom) {
    if (roomName && Game.rooms[roomName] && Game.rooms[roomName].controller) {
        return Game.rooms[roomName].controller;
    }

    if (fallbackRoom && fallbackRoom.controller) {
        return fallbackRoom.controller;
    }

    return null;
}

function addTaskDone(task, amount) {
    const total = task.data.total || 0;

    if (total <= 0 || amount <= 0) {
        return;
    }

    task.donePercent = Math.min(100, task.donePercent + ((amount / total) * 100));
}

function getUpgradePower(creep) {
    return Math.max(1, creep.getActiveBodyparts(WORK));
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
