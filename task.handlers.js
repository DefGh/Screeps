const constants = require("./constants");
const spawnCreepTask = require("./task.spawnCreep");

const handlersByType = {
    [constants.taskTypes.SPAWN_CREEP]: spawnCreepTask.run,
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
