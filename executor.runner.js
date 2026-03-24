const constants = require("./constants");
const dispatcher = require("./dispatcher");
const taskHandlers = require("./task.handlers");
const renewTtlTask = require("./task.renewTtl");
const taskStore = require("./task.store");

function runExecutor(executor) {
    if (!executor || !executor.memory || !executor.memory.role) {
        return;
    }

    const memory = executor.memory;
    const role = memory.role;
    const currentTask = getCurrentTask(executor, role);

    if (currentTask) {
        say(executor, currentTask);
        taskHandlers.executeTask(executor, currentTask);
        return;
    }

    if (memory.waitUntil && memory.waitUntil > Game.time) {
        if (!renewTtlTask.shouldPrioritizeRenew(executor)) {
            return;
        }

        delete memory.waitUntil;
    }

    if (memory.waitUntil && memory.waitUntil > Game.time) {
        return;
    }

    if (isBusySpawn(executor)) {
        return;
    }

    const task = dispatcher.getTask(role, executor);

    if (!task) {
        memory.waitUntil = Game.time + constants.dispatcher.WAIT_TICKS_ON_EMPTY_QUEUE;
        return;
    }

    say(executor, task);
    taskHandlers.executeTask(executor, task);
}

function say(executor, task) {
    if (!task || typeof executor.say !== "function") {
        return;
    }

    const icon = constants.taskIcons[task.type] || constants.taskIcons.default;
    executor.say(icon);
}

function getCurrentTask(executor, role) {
    const taskId = executor.memory.taskId;

    if (!taskId) {
        return null;
    }

    const task = taskStore.getTask(taskId);

    if (!task) {
        taskStore.clearTaskAssignment(executor);
        return null;
    }

    if (!taskHandlers.validateTask(task)) {
        taskStore.removeTask(task.id, {
            clearAssignments: true,
        });
        return null;
    }

    if (!task.canExecute.includes(role)) {
        taskStore.requeueTask(task.id, {
            clearAssignments: true,
        });
        return null;
    }

    if (!taskHandlers.canExecuteTask(executor, task)) {
        taskStore.requeueTask(task.id, {
            clearAssignments: true,
        });
        return null;
    }

    if (task.status !== constants.taskStatuses.IN_PROGRESS) {
        taskStore.setTaskStatus(task.id, constants.taskStatuses.IN_PROGRESS);
    }

    return task;
}

function isBusySpawn(executor) {
    return typeof executor.spawnCreep === "function" && Boolean(executor.spawning);
}

module.exports = {
    runExecutor,
};
