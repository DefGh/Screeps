const constants = require("./constants");
const checkerTask = require("./task.checker");
const expansionTask = require("./task.expansion");
const longRangeMiningTask = require("./task.long_range_mining");
const miningOperationTask = require("./task.mining_operation");
const towerOperationTask = require("./task.tower_operation");
const syncExtensionsTask = require("./task.sync_extensions");
const syncTowersTask = require("./task.sync_towers");
const syncRoadsTask = require("./task.sync_roads");
const syncFortificationsTask = require("./task.sync_fortifications");
const spawnCreepTask = require("./task.spawn_creep");
const renewHaulerTask = require("./task.renew_hauler");
const renewUniversalTask = require("./task.renew_universal");
const fillEnergyTask = require("./task.fill_energy");
const collectDroppedResourceTask = require("./task.collect_dropped_resource");
const exportResourceToCapitalTask = require("./task.export_resource_to_capital");
const fillSpawnTask = require("./task.fill_spawn");
const fillExtensionTask = require("./task.fill_extension");
const fillTowerTask = require("./task.fill_tower");
const buildTask = require("./task.build");
const upgradeControllerTask = require("./task.upgrade_controller");

const handlers = {
    [constants.taskTypes.SPAWN_CREEP]: spawnCreepTask,
    [constants.taskTypes.RENEW_HAULER]: renewHaulerTask,
    [constants.taskTypes.RENEW_UNIVERSAL]: renewUniversalTask,
    [constants.taskTypes.CHECKER]: checkerTask,
    [constants.taskTypes.EXPANSION]: expansionTask,
    [constants.taskTypes.LONG_RANGE_MINING]: longRangeMiningTask,
    [constants.taskTypes.MINING_OPERATION]: miningOperationTask,
    [constants.taskTypes.TOWER_OPERATION]: towerOperationTask,
    [constants.taskTypes.SYNC_EXTENSIONS]: syncExtensionsTask,
    [constants.taskTypes.SYNC_TOWERS]: syncTowersTask,
    [constants.taskTypes.SYNC_ROADS]: syncRoadsTask,
    [constants.taskTypes.SYNC_FORTIFICATIONS]: syncFortificationsTask,
    [constants.taskTypes.FILL_ENERGY]: fillEnergyTask,
    [constants.taskTypes.COLLECT_DROPPED_RESOURCE]: collectDroppedResourceTask,
    [constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL]: exportResourceToCapitalTask,
    [constants.taskTypes.FILL_SPAWN]: fillSpawnTask,
    [constants.taskTypes.FILL_EXTENSION]: fillExtensionTask,
    [constants.taskTypes.FILL_TOWER]: fillTowerTask,
    [constants.taskTypes.BUILD]: buildTask,
    [constants.taskTypes.UPGRADE_CONTROLLER]: upgradeControllerTask,
};

function createTask(type, room, data) {
    return {
        id: nextTaskId(type),
        room: room,
        type: type,
        data: data || {},
        actionIds: [],
        assignedPercent: 0,
        donePercent: 0,
        executorNames: [],
        createdAt: Game.time,
    };
}

function addTask(type, room, data) {
    const store = Memory.Tasks;
    const task = createTask(type, room, data);

    store.byId[task.id] = task;

    if (room) {
        if (!store.rooms[room]) {
            store.rooms[room] = [];
        }

        store.rooms[room].push(task.id);
    }

    return {
        ok: true,
        task: task,
    };
}

function getTask(taskId) {
    return Memory.Tasks.byId[taskId];
}

function removeTask(taskId) {
    const task = getTask(taskId);

    if (!task) {
        return;
    }

    const dispatcherCleanup = require("./dispatcher.cleanup");

    const actionIds = task.actionIds.slice();

    for (const actionId of actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (!action) {
            continue;
        }

        dispatcherCleanup.cleanupAssignedAction(action, {
            invokeCancel: true,
            reason: `remove-task:${task.id}`,
        });
    }

    if (task.room && Memory.Tasks.rooms[task.room]) {
        Memory.Tasks.rooms[task.room] = Memory.Tasks.rooms[task.room].filter(function (roomTaskId) {
            return roomTaskId !== taskId;
        });

        if (Memory.Tasks.rooms[task.room].length === 0) {
            delete Memory.Tasks.rooms[task.room];
        }
    }

    delete Memory.Tasks.byId[taskId];
}

function listTasks(room) {
    const store = Memory.Tasks;

    if (!room) {
        return Object.values(store.byId);
    }

    const roomTaskIds = store.rooms[room] || [];

    return roomTaskIds.map(function (taskId) {
        return store.byId[taskId];
    }).filter(Boolean);
}

function onCompleted(task, action) {
    const handler = getHandler(task.type);

    if (!handler) {
        return;
    }

    handler.onCompleted(task, action, {
        addTask: addTask,
        listTasks: listTasks,
        removeTask: removeTask,
    });
}

function getHandler(taskType) {
    return handlers[taskType] || null;
}

function nextTaskId(type) {
    const store = Memory.Tasks;

    store.sequence += 1;
    return `task:${type}:${store.sequence}`;
}

module.exports = {
    addTask,
    getHandler,
    getTask,
    listTasks,
    onCompleted,
    removeTask,
};
