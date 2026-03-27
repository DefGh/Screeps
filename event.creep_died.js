const actions = require("./actions");
const constants = require("./constants");
const tasks = require("./tasks");

function handle(event, ctx) {
    const actionIds = event.data.actionIds || [];

    ctx.log(`[events] handled ${event.type} for ${event.data.name}`);

    for (const actionId of actionIds) {
        cleanupAction(event, actionId, ctx);
    }
}

function cleanupAction(event, actionId, ctx) {
    const action = Memory.Dispatcher.actionsById[actionId];

    if (!action) {
        return;
    }

    const handler = actions.get(action.type);

    if (handler) {
        handler.onCreepDeath(event, action);
    }

    unlinkActionFromTask(action);
    delete Memory.Dispatcher.actionsById[actionId];

    ctx.log(`[events] cleaned ${action.type} for ${event.data.name}`);
}

function unlinkActionFromTask(action) {
    const task = tasks.getTask(action.taskId);

    if (!task) {
        return;
    }

    task.actionIds = task.actionIds.filter(function (taskActionId) {
        return taskActionId !== action.id;
    });

    rollbackAssignment(task, action);

    if (!hasActiveExecutorActions(task, action.executorName)) {
        task.executorNames = task.executorNames.filter(function (executorName) {
            return executorName !== action.executorName;
        });
    }
}

function rollbackAssignment(task, action) {
    if (
        (
            action.type !== constants.actionTypes.UPGRADE_CONTROLLER &&
            action.type !== constants.actionTypes.TRANSFER_ENERGY
        ) ||
        !task.data.total ||
        !action.data.amount
    ) {
        return;
    }

    const percent = (action.data.amount / task.data.total) * 100;

    task.assignedPercent = Math.max(0, task.assignedPercent - percent);
}

function hasActiveExecutorActions(task, executorName) {
    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.executorName === executorName &&
            action.status !== "done"
        ) {
            return true;
        }
    }

    return false;
}

module.exports = {
    handle,
};
