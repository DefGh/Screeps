const actions = require("./actions");
const constants = require("./constants");
const debug = require("./debug");
const fillEnergy = require("./fill.energy");

function cleanupAssignedAction(action, options) {
    if (!action || !Memory.Dispatcher.actionsById[action.id]) {
        return false;
    }

    const cleanupOptions = options || {};

    invokeLifecycleCleanup(action, cleanupOptions);
    unlinkActionFromTask(action);
    removeActionFromExecutorQueue(action);
    delete Memory.Dispatcher.actionsById[action.id];

    const log = cleanupOptions.log === undefined
        ? debug.log
        : cleanupOptions.log;

    if (log) {
        log(`[dispatcher] cleaned ${action.type} for ${action.executorName} (${cleanupOptions.reason || "cleanup"})`);
    }

    return true;
}

function reconcileTaskAssignments(task) {
    normalizeTaskAssignments(task);
}

function reconcileTaskStore() {
    if (!Memory.Tasks || !Memory.Tasks.rooms) {
        return;
    }

    for (const roomName in Memory.Tasks.rooms) {
        const roomTaskIds = Memory.Tasks.rooms[roomName];
        const filteredTaskIds = [];
        const seen = {};

        for (const taskId of roomTaskIds) {
            const task = Memory.Tasks.byId[taskId];

            if (!task || task.room !== roomName || seen[taskId]) {
                continue;
            }

            seen[taskId] = true;
            filteredTaskIds.push(taskId);
        }

        if (filteredTaskIds.length > 0) {
            Memory.Tasks.rooms[roomName] = filteredTaskIds;
        }
        else {
            delete Memory.Tasks.rooms[roomName];
        }
    }
}

function unlinkActionFromTask(action) {
    const task = Memory.Tasks.byId[action.taskId];

    if (!task) {
        return;
    }

    task.actionIds = task.actionIds.filter(function (taskActionId) {
        return taskActionId !== action.id;
    });

    normalizeTaskAssignments(task);
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

function normalizeTaskAssignments(task) {
    if (!task) {
        return false;
    }

    const previousAssignedPercent = getPercentValue(task.assignedPercent);
    const previousDonePercent = getPercentValue(task.donePercent);

    task.actionIds = collectActiveTaskActionIds(task);
    rebuildTaskExecutorNames(task);

    if (fillEnergy.isFillEnergyTask(task)) {
        const changed = fillEnergy.normalizeTask(task);

        if (shouldLogNormalization(task, previousAssignedPercent, previousDonePercent)) {
            debug.log(
                `[dispatcher] normalized ${task.type} ${task.id} assigned=${formatPercent(previousAssignedPercent)}->${formatPercent(task.assignedPercent)} done=${formatPercent(previousDonePercent)}->${formatPercent(task.donePercent)} active=${task.actionIds.length}`
            );
        }

        return changed;
    }

    if (!hasProgressTotal(task)) {
        return false;
    }

    const nextDonePercent = clampPercent(task.donePercent);
    const nextAssignedPercent = clampPercent(
        nextDonePercent + getInFlightAssignedPercent(task)
    );
    const changed = (
        previousAssignedPercent !== nextAssignedPercent ||
        previousDonePercent !== nextDonePercent
    );

    task.donePercent = nextDonePercent;
    task.assignedPercent = Math.max(nextDonePercent, nextAssignedPercent);

    if (shouldLogNormalization(task, previousAssignedPercent, previousDonePercent)) {
        debug.log(
            `[dispatcher] normalized ${task.type} ${task.id} assigned=${formatPercent(previousAssignedPercent)}->${formatPercent(task.assignedPercent)} done=${formatPercent(previousDonePercent)}->${formatPercent(task.donePercent)} active=${task.actionIds.length}`
        );
    }

    return changed;
}

function collectActiveTaskActionIds(task) {
    const filteredActionIds = [];
    const seen = {};

    for (const actionId of task.actionIds || []) {
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

    return filteredActionIds;
}

function hasProgressTotal(task) {
    return !!(
        task &&
        task.data &&
        Number.isFinite(task.data.total) &&
        task.data.total > 0
    );
}

function getInFlightAssignedPercent(task) {
    const total = task.data.total;
    let percent = 0;

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            !action ||
            action.taskId !== task.id ||
            action.status === "done" ||
            !countsTowardAssignedPercent(action) ||
            !action.data ||
            !action.data.amount
        ) {
            continue;
        }

        percent += (action.data.amount / total) * 100;
    }

    return percent;
}

function countsTowardAssignedPercent(action) {
    return (
        action.type === constants.actionTypes.TRANSFER_ENERGY ||
        action.type === constants.actionTypes.UPGRADE_CONTROLLER
    );
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, getPercentValue(value)));
}

function getPercentValue(value) {
    return Number.isFinite(value) ? value : 0;
}

function shouldLogNormalization(task, previousAssignedPercent, previousDonePercent) {
    return (
        previousDonePercent !== task.donePercent ||
        (
            previousAssignedPercent !== task.assignedPercent &&
            task.actionIds.length === 0
        )
    );
}

function formatPercent(value) {
    return Math.round(value * 100) / 100;
}

function invokeLifecycleCleanup(action, options) {
    const handler = actions.get(action.type);

    if (!handler) {
        return;
    }

    if (options.invokeCreepDeath && handler.onCreepDeath) {
        handler.onCreepDeath(
            options.event || createSyntheticCreepDeathEvent(action, options.reason),
            action
        );
        return;
    }

    if (options.invokeCancel && handler.onCancel) {
        handler.onCancel(action, {
            reason: options.reason || "cleanup",
        });
    }
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
    normalizeTaskAssignments,
    reconcileTaskAssignments,
    reconcileTaskStore,
};
