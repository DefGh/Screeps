const constants = require("./constants");
const dispatcher = require("./dispatcher");
const store = require("./store");
const taskRunners = require("./task.runners");

function runExecutor(executor) {
    if (isBusySpawn(executor)) {
        return;
    }

    const currentTask = store.getExecutorTask(executor);

    if (currentTask) {
        runAssignedTask(executor, currentTask);
        return;
    }

    const nextTask = dispatcher.dispatchTask(executor);

    if (!nextTask) {
        executor.memory.idleSince = Game.time;
        return;
    }

    delete executor.memory.idleSince;
    runAssignedTask(executor, nextTask);
}

function runAssignedTask(executor, task) {
    say(executor, task);
    store.setTaskStatus(task.roomName, task.id, constants.taskStatuses.IN_PROGRESS);

    if (taskRunners.runTask(executor, task) === true) {
        store.removeTask(task.roomName, task.id, {
            clearAssignments: true,
        });
        store.clearExecutorAssignment(executor);
    }
}

function say(executor, task) {
    const icon = constants.taskIcons[task.type] || constants.taskIcons.default;
    executor.say(icon);
}

function isBusySpawn(executor) {
    return Boolean(executor.spawning);
}

module.exports = {
    runExecutor,
};
