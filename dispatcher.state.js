const dispatcherCleanup = require("./dispatcher.cleanup");
const tasks = require("./tasks");

function reconcileDispatcherState() {
    const actionIds = Object.keys(Memory.Dispatcher.actionsById);

    for (const actionId of actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (!action) {
            continue;
        }

        if (!tasks.getTask(action.taskId)) {
            dispatcherCleanup.cleanupAssignedAction(action, {
                invokeCancel: true,
                reason: "missing-task",
            });
            continue;
        }

        if (!isExecutorAlive(action)) {
            dispatcherCleanup.cleanupAssignedAction(action, {
                invokeCancel: true,
                reason: "missing-executor",
            });
            continue;
        }

        if (!isActionQueuedOnExecutor(action)) {
            dispatcherCleanup.cleanupAssignedAction(action, {
                invokeCancel: true,
                reason: "missing-queue",
            });
        }
    }

    dispatcherCleanup.reconcileTaskStore();

    for (const task of tasks.listTasks()) {
        dispatcherCleanup.reconcileTaskAssignments(task);
    }
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
    cleanupAssignedAction: dispatcherCleanup.cleanupAssignedAction,
    reconcileDispatcherState,
};
