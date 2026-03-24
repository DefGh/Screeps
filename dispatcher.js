const constants = require("./constants");
const taskHandlers = require("./task.handlers");
const taskIndex = require("./task.index");
const taskProviders = require("./task.providers");
const taskStore = require("./task.store");

function getTask(role, executor) {
    let task = findPendingTask(role, executor);

    if (!task) {
        taskProviders.runProviders(role, executor);
        task = findPendingTask(role, executor);
    }

    if (!task) {
        return null;
    }

    return taskStore.assignTask(executor, task);
}

function findPendingTask(role, executor) {
    if (role === constants.roles.SPAWNER) {
        for (const targetRole of [
            constants.roles.ATTACKER,
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
        const taxiTask = findPendingTaskByType(constants.taskTypes.TAXI, executor);

        if (taxiTask) {
            return taxiTask;
        }

        const bootstrapSpawnTask = findPendingTaskByType(
            constants.taskTypes.BOOTSTRAP_SPAWN,
            executor
        );

        if (bootstrapSpawnTask) {
            return bootstrapSpawnTask;
        }
    }

    for (const task of taskIndex.getPendingTasksByRole(role)) {
        if (!taskHandlers.canExecuteTask(executor, task)) {
            continue;
        }

        return task;
    }

    return null;
}

function findPendingSpawnTaskByRole(targetRole, executor) {
    const roomName = executor && executor.room ? executor.room.name : null;

    for (const task of taskIndex.getPendingSpawnTasksByRoleAndRoom(targetRole, roomName)) {
        if (!taskHandlers.canExecuteTask(executor, task)) {
            continue;
        }

        return task;
    }

    return null;
}

function findPendingTaskByType(taskType, executor) {
    for (const task of taskIndex.getPendingTasksByType(taskType)) {
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
