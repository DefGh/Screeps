const constants = require("./constants");
const taskProviders = require("./task.providers");

function getTask(role, executor) {
    let task = findPendingTask(role);

    if (!task) {
        taskProviders.runProviders(role, executor);
        task = findPendingTask(role);
    }

    if (!task) {
        return null;
    }

    task.status = constants.taskStatuses.IN_PROGRESS;
    executor.memory.taskId = task.id;
    delete executor.memory.waitUntil;

    return task;
}

function findPendingTask(role) {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task || task.status !== constants.taskStatuses.PENDING) {
            continue;
        }

        if (!Array.isArray(task.canExecute) || !task.canExecute.includes(role)) {
            continue;
        }

        return task;
    }

    return null;
}

module.exports = {
    getTask,
};
