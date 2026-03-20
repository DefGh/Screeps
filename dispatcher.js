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
    if (role === constants.roles.SPAWNER) {
        const universalSpawnTask = findPendingUniversalSpawnTask();

        if (universalSpawnTask) {
            return universalSpawnTask;
        }
    }

    if (role === constants.roles.UNIVERSAL) {
        const taxiTask = findPendingTaskByType(role, constants.taskTypes.TAXI);

        if (taxiTask) {
            return taxiTask;
        }
    }

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

function findPendingUniversalSpawnTask() {
    return findPendingSpawnTaskByRole(constants.roles.UNIVERSAL);
}

function findPendingSpawnTaskByRole(targetRole) {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task || task.status !== constants.taskStatuses.PENDING) {
            continue;
        }

        if (task.type !== constants.taskTypes.SPAWN_CREEP || !task.data) {
            continue;
        }

        if (!Array.isArray(task.canExecute) || !task.canExecute.includes(constants.roles.SPAWNER)) {
            continue;
        }

        if (task.data.role === targetRole) {
            return task;
        }
    }

    return null;
}

function findPendingTaskByType(role, taskType) {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task || task.status !== constants.taskStatuses.PENDING) {
            continue;
        }

        if (task.type !== taskType) {
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
