const constants = require("./constants");
const mineTask = require("./task.mine");
const spawnCreepTask = require("./task.spawnCreep");
const taxiTask = require("./task.taxi");
const transferEnergyTask = require("./task.transferEnergy");

const handlersByType = {
    [constants.taskTypes.MINE]: mineTask.run,
    [constants.taskTypes.SPAWN_CREEP]: spawnCreepTask.run,
    [constants.taskTypes.TAXI]: taxiTask.run,
    [constants.taskTypes.TRANSFER_ENERGY]: transferEnergyTask.run,
};

function executeTask(executor, task) {
    const handler = handlersByType[task && task.type];

    if (!handler) {
        discardTask(executor, task && task.id);
        return;
    }

    const isCompleted = handler(executor, task) === true;

    if (isCompleted) {
        discardTask(executor, task && task.id);
    }
}

function discardTask(executor, taskId) {
    if (taskId && Memory.tasks[taskId]) {
        delete Memory.tasks[taskId];
    }

    delete executor.memory.taskId;
}

module.exports = {
    executeTask,
};
