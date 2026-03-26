const constants = require("./constants");
const taskHandlers = require("./task.handlers");
const taskIndex = require("./task.index");
const taskProviders = require("./task.providers");
const taskStore = require("./task.store");

function getTask(role, executor, options) {
    let task = findPendingTask(role, executor);

    if (!task && (!options || options.allowProviders !== false)) {
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
        return findPendingSpawnTaskForRoles([
            constants.roles.ATTACKER,
            constants.roles.UNIVERSAL,
            constants.roles.MINER,
            constants.roles.CLAIMER,
            constants.roles.SCOUT,
        ], executor);
    }

    if (role === constants.roles.UNIVERSAL) {
        const prioritizedTask = findPendingTaskByTypes(
            [
                constants.taskTypes.RENEW_TTL,
                constants.taskTypes.TAXI,
                constants.taskTypes.BOOTSTRAP_SPAWN,
            ],
            executor
        );

        if (prioritizedTask) {
            return prioritizedTask;
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

function findPendingSpawnTaskForRoles(targetRoles, executor) {
    for (const targetRole of targetRoles) {
        const spawnTask = findPendingSpawnTaskByRole(targetRole, executor);

        if (spawnTask) {
            return spawnTask;
        }
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

function findPendingTaskByTypes(taskTypes, executor) {
    for (const taskType of taskTypes) {
        const task = findPendingTaskByType(taskType, executor);

        if (task) {
            return task;
        }
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
