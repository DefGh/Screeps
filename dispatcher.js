const constants = require("./constants");
const taskHandlers = require("./task.handlers");
const taskProviders = require("./task.providers");

function getTask(role, executor) {
    let task = findPendingTask(role, executor);

    if (!task) {
        taskProviders.runProviders(role, executor);
        task = findPendingTask(role, executor);
    }

    if (!task) {
        return null;
    }

    task.status = constants.taskStatuses.IN_PROGRESS;
    executor.memory.taskId = task.id;
    delete executor.memory.waitUntil;

    return task;
}

function findPendingTask(role, executor) {
    if (role === constants.roles.SPAWNER) {
        for (const targetRole of [
            constants.roles.UNIVERSAL,
            constants.roles.MINER,
            constants.roles.CLAIMER,
            constants.roles.SCOUT,
        ]) {
            const spawnTask = findPendingSpawnTaskByRole(targetRole, executor);

            if (spawnTask) {
                return spawnTask;
            }
        }
    }

    if (role === constants.roles.UNIVERSAL) {
        const taxiTask = findPendingTaskByType(role, constants.taskTypes.TAXI, executor);

        if (taxiTask) {
            return taxiTask;
        }

        const bootstrapSpawnTask = findPendingTaskByType(
            role,
            constants.taskTypes.BOOTSTRAP_SPAWN,
            executor
        );

        if (bootstrapSpawnTask) {
            return bootstrapSpawnTask;
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

        if (!taskHandlers.canExecuteTask(executor, task)) {
            continue;
        }

        return task;
    }

    return null;
}

function findPendingSpawnTaskByRole(targetRole, executor) {
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
            if (!taskHandlers.canExecuteTask(executor, task)) {
                continue;
            }

            return task;
        }
    }

    return null;
}

function findPendingTaskByType(role, taskType, executor) {
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

        if (!taskHandlers.canExecuteTask(executor, task)) {
            continue;
        }

        return task;
    }

    return null;
}

module.exports = {
    getTask,
};
