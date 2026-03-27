const constants = require("./constants");
const checkerTask = require("./task.checker");
const miningOperationTask = require("./task.mining_operation");
const spawnCreepTask = require("./task.spawn_creep");
const fillSpawnTask = require("./task.fill_spawn");
const fillExtensionTask = require("./task.fill_extension");
const fillTowerTask = require("./task.fill_tower");
const buildTask = require("./task.build");
const repairTask = require("./task.repair");
const upgradeControllerTask = require("./task.upgrade_controller");

const handlers = {
    [constants.taskTypes.SPAWN_CREEP]: spawnCreepTask,
    [constants.taskTypes.CHECKER]: checkerTask,
    [constants.taskTypes.MINING_OPERATION]: miningOperationTask,
    [constants.taskTypes.FILL_SPAWN]: fillSpawnTask,
    [constants.taskTypes.FILL_EXTENSION]: fillExtensionTask,
    [constants.taskTypes.FILL_TOWER]: fillTowerTask,
    [constants.taskTypes.BUILD]: buildTask,
    [constants.taskTypes.REPAIR]: repairTask,
    [constants.taskTypes.UPGRADE_CONTROLLER]: upgradeControllerTask,
};

function createTask(type, room, data) {
    return {
        id: nextTaskId(),
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

    if (task.room && Memory.Tasks.rooms[task.room]) {
        Memory.Tasks.rooms[task.room] = Memory.Tasks.rooms[task.room].filter(function (roomTaskId) {
            return roomTaskId !== taskId;
        });
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

function nextTaskId() {
    const store = Memory.Tasks;

    store.sequence += 1;
    return `task:${store.sequence}`;
}

module.exports = {
    addTask,
    getHandler,
    getTask,
    listTasks,
    onCompleted,
    removeTask,
};
