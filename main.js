const constants = require("./constants");
const debug = require("./debug");
const dispatcherState = require("./dispatcher.state");
const executorRunner = require("./executor.runner");
const events = require("./events");
const init = require("./init");

module.exports.loop = function () {
    reset();
    init();
    //Game.map.visual.circle(new RoomPosition(25,25,'W7N3'));

    fireRclChangeEvents();
    fireCreepDeathEvents();
    dispatcherState.reconcileDispatcherState();
    executorRunner.run();

    debug.visuals();
    updateCpuPeak();
};

function reset() {

    if (!Memory.reset) {
        return;
    }
    Memory.reset = false;
    const tasks = require("tasks");
    const cleanup = require("dispatcher.cleanup");



    for (const taskId of Object.keys((Memory.Tasks && Memory.Tasks.byId) || {})) {
        tasks.removeTask(taskId);
    }

    for (const actionId of Object.keys((Memory.Dispatcher && Memory.Dispatcher.actionsById) || {})) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (action) {
            cleanup.cleanupAssignedAction(action, {
                invokeCancel: true,
                reason: "console-reset",
                log: console.log,
            });
        }
    }

    if (Memory.Tasks) {
        Memory.Tasks.byId = {};
        Memory.Tasks.rooms = {};
    }

    if (Memory.Dispatcher) {
        Memory.Dispatcher.actionsById = {};
    }

    if (Memory.Resources) {
        Memory.Resources.byId = {};
        Memory.Resources.rooms = {};
    }

    for (const creepName in (Memory.creeps || {})) {
        if (Memory.creeps[creepName]) {
            Memory.creeps[creepName].actionIds = [];
        }
    }

    for (const roomName in (Memory.rooms || {})) {
        if (Memory.rooms[roomName]) {
            Memory.rooms[roomName].actionIds = [];
        }
    }

    for (const spawnName in (Memory.spawns || {})) {
        if (Memory.spawns[spawnName]) {
            Memory.spawns[spawnName].actionIds = [];
        }
    }

    for (const towerId in (Memory.towers || {})) {
        if (Memory.towers[towerId]) {
            Memory.towers[towerId].actionIds = [];
        }
    }

    console.log("[reset] tasks, actions, queues and reservations cleared");
}

function updateCpuPeak() {
    const currentCpu = Game.cpu.getUsed();
    const previousCpu = Number.isFinite(Memory.cpu) ? Memory.cpu : 0;

    Memory.cpu = Math.max(currentCpu, previousCpu);
}

function fireRclChangeEvents() {
    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (!room.controller || !room.controller.my) {
            continue;
        }

        if (!Memory.rooms[roomName]) {
            Memory.rooms[roomName] = {};
        }

        const previousLevel = Memory.rooms[roomName].rcl;
        const currentLevel = room.controller.level;

        if (previousLevel === currentLevel) {
            continue;
        }

        events.fireEvent(
            room.name,
            constants.eventTypes.RCL_CHANGE,
            {
                previousLevel: previousLevel,
                currentLevel: currentLevel,
            }
        );

        Memory.rooms[roomName].rcl = currentLevel;
    }
}

function fireCreepDeathEvents() {
    if (!Memory.creeps) {
        return;
    }

    for (const creepName in Memory.creeps) {
        if (Game.creeps[creepName]) {
            continue;
        }

        const creepMemory = Memory.creeps[creepName];

        events.fireEvent(
            creepMemory.originRoomName || null,
            constants.eventTypes.CREEP_DIED,
            {
                name: creepName,
                role: creepMemory.role,
                originRoomName: creepMemory.originRoomName,
                actionIds: (creepMemory.actionIds || []).slice(),
            }
        );

        delete Memory.creeps[creepName];
    }
}
