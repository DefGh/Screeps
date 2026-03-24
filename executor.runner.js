const constants = require("./constants");
const dispatcher = require("./dispatcher");
const taskHandlers = require("./task.handlers");

function runExecutor(executor) {
    if (!executor || !executor.memory || !executor.memory.role) {
        return;
    }

    const role = executor.memory.role;
    const currentTask = getCurrentTask(executor, role);

    if (currentTask) {
        say(executor, currentTask);
        taskHandlers.executeTask(executor, currentTask);
        return;
    }

    if (executor.memory.waitUntil && executor.memory.waitUntil > Game.time) {
        return;
    }

    if (isBusySpawn(executor)) {
        return;
    }

    const task = dispatcher.getTask(role, executor);

    if (!task) {
        // log new task assigment 
        executor.memory.waitUntil = Game.time + constants.dispatcher.WAIT_TICKS_ON_EMPTY_QUEUE;
        return;
    }

    say(executor, task);
    //console.log(`${executor.name} assigned new task ${task.id}`);
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

    const task = Memory.tasks[taskId];

    if (!task) {
        delete executor.memory.taskId;
        return null;
    }

    if (!Array.isArray(task.canExecute) || !task.canExecute.includes(role)) {
        delete executor.memory.taskId;
        return null;
    }

    if (task.status !== constants.taskStatuses.IN_PROGRESS) {
        task.status = constants.taskStatuses.IN_PROGRESS;
    }

    return task;
}

function isBusySpawn(executor) {
    return typeof executor.spawnCreep === "function" && Boolean(executor.spawning);
}

module.exports = {
    runExecutor,
};
