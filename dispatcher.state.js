const actions = require("./actions");
const constants = require("./constants");
const debug = require("./debug");
const tasks = require("./tasks");

function reconcileDispatcherState() {
    const actionIds = Object.keys(Memory.Dispatcher.actionsById);

    for (const actionId of actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (!action) {
            continue;
        }

        if (!tasks.getTask(action.taskId)) {
            cleanupAssignedAction(action, {
                reason: "missing-task",
            });
            continue;
        }

        if (!isExecutorAlive(action)) {
            cleanupAssignedAction(action, {
                invokeCreepDeath: isCreepAction(action),
                reason: "missing-executor",
            });
            continue;
        }

        if (!isActionQueuedOnExecutor(action)) {
            cleanupAssignedAction(action, {
                invokeCreepDeath: isCreepAction(action),
                reason: "missing-queue",
            });
        }
    }

    for (const task of tasks.listTasks()) {
        reconcileTaskAssignments(task);
    }
}

function cleanupAssignedAction(action, options) {
    if (!action || !Memory.Dispatcher.actionsById[action.id]) {
        return false;
    }

    const cleanupOptions = options || {};

    if (cleanupOptions.invokeCreepDeath) {
        invokeCreepDeathHandler(action, cleanupOptions.event, cleanupOptions.reason);
    }

    unlinkActionFromTask(action);
    removeActionFromExecutorQueue(action);
    delete Memory.Dispatcher.actionsById[action.id];

    const log = cleanupOptions.log || debug.log;

    if (log) {
        log(`[dispatcher] cleaned ${action.type} for ${action.executorName} (${cleanupOptions.reason || "cleanup"})`);
    }

    return true;
}

function reconcileTaskAssignments(task) {
    const filteredActionIds = [];
    const seen = {};

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            !action ||
            action.taskId !== task.id ||
            action.status === "done" ||
            seen[actionId]
        ) {
            continue;
        }

        seen[actionId] = true;
        filteredActionIds.push(actionId);
    }

    task.actionIds = filteredActionIds;
    rebuildTaskExecutorNames(task);
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
    rebuildTaskExecutorNames(task);
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

function rebuildTaskExecutorNames(task) {
    const executorNames = [];
    const seen = {};

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            !action ||
            action.taskId !== task.id ||
            action.status === "done" ||
            seen[action.executorName]
        ) {
            continue;
        }

        seen[action.executorName] = true;
        executorNames.push(action.executorName);
    }

    task.executorNames = executorNames;
}

function invokeCreepDeathHandler(action, event, reason) {
    const handler = actions.get(action.type);

    if (!handler) {
        return;
    }

    handler.onCreepDeath(
        event || createSyntheticCreepDeathEvent(action, reason),
        action
    );
}

function createSyntheticCreepDeathEvent(action, reason) {
    return {
        id: `synthetic:${action.id}`,
        room: action.room,
        type: constants.eventTypes.CREEP_DIED,
        data: {
            actionIds: [action.id],
            name: action.executorName,
            originRoomName: action.room,
            reason: reason || "cleanup",
            role: action.executorType,
        },
        tick: Game.time,
    };
}

function removeActionFromExecutorQueue(action) {
    const queue = getExecutorQueue(action);

    if (!queue) {
        return;
    }

    const filteredQueue = queue.filter(function (actionId) {
        return actionId !== action.id;
    });

    replaceExecutorQueue(action, filteredQueue);
}

function isActionQueuedOnExecutor(action) {
    const queue = getExecutorQueue(action);

    if (!queue) {
        return false;
    }

    return queue.includes(action.id);
}

function isExecutorAlive(action) {
    if (action.executorType === "room") {
        const room = Game.rooms[action.executorName];
        return !!(room && room.controller && room.controller.my);
    }

    if (action.executorType === "spawn") {
        return !!Game.spawns[action.executorName];
    }

    if (action.executorType === "tower") {
        const tower = Game.getObjectById(action.executorName);

        return !!(
            tower &&
            tower.structureType === STRUCTURE_TOWER &&
            tower.my
        );
    }

    return !!Game.creeps[action.executorName];
}

function isCreepAction(action) {
    return (
        action.executorType !== "room" &&
        action.executorType !== "spawn" &&
        action.executorType !== "tower"
    );
}

function getExecutorQueue(action) {
    if (action.executorType === "room") {
        return (
            Memory.rooms &&
            Memory.rooms[action.executorName] &&
            Memory.rooms[action.executorName].actionIds
        ) || null;
    }

    if (action.executorType === "spawn") {
        return (
            Memory.spawns &&
            Memory.spawns[action.executorName] &&
            Memory.spawns[action.executorName].actionIds
        ) || null;
    }

    if (action.executorType === "tower") {
        return (
            Memory.towers &&
            Memory.towers[action.executorName] &&
            Memory.towers[action.executorName].actionIds
        ) || null;
    }

    return (
        Memory.creeps &&
        Memory.creeps[action.executorName] &&
        Memory.creeps[action.executorName].actionIds
    ) || null;
}

function replaceExecutorQueue(action, actionIds) {
    if (action.executorType === "room") {
        if (Memory.rooms && Memory.rooms[action.executorName]) {
            Memory.rooms[action.executorName].actionIds = actionIds;
        }

        return;
    }

    if (action.executorType === "spawn") {
        if (Memory.spawns && Memory.spawns[action.executorName]) {
            Memory.spawns[action.executorName].actionIds = actionIds;
        }

        return;
    }

    if (action.executorType === "tower") {
        if (Memory.towers && Memory.towers[action.executorName]) {
            Memory.towers[action.executorName].actionIds = actionIds;
        }

        return;
    }

    if (Memory.creeps && Memory.creeps[action.executorName]) {
        Memory.creeps[action.executorName].actionIds = actionIds;
    }
}

module.exports = {
    cleanupAssignedAction,
    reconcileDispatcherState,
};
