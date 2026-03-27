const constants = require("./constants");
const events = require("./events");
const tasks = require("./tasks");

function ensureMemory() {
    if (Memory.eventId === undefined) {
        Memory.eventId = 0;
    }

    if (Memory.creepSequence === undefined) {
        Memory.creepSequence = 0;
    }

    if (!Memory.Tasks) {
        Memory.Tasks = {
            byId: {},
            rooms: {},
            sequence: 0,
        };
    }

    if (!Memory.Dispatcher) {
        Memory.Dispatcher = {
            sequence: 0,
            actionsById: {},
        };
    }

    if (!Memory.Resources) {
        Memory.Resources = {
            sequence: 0,
            byId: {},
            rooms: {},
        };
    }

    if (!Memory.Checker) {
        Memory.Checker = {
            nextCheckIndex: 0,
            lastRunTick: null,
            rooms: {},
        };
    }
    else if (!Memory.Checker.rooms) {
        Memory.Checker.rooms = {};
    }
}

module.exports = function () {
    ensureMemory();

    if (Memory.initialized) {
        ensureRoomBootstrapTasks();
        return;
    }
    Memory.initialized = true;
    Memory.debug = true;

    const roomNames = Object.keys(Game.rooms);

    events.fireEvent(null, constants.eventTypes.GAME_START, {
        rooms: roomNames,
    });
};

function ensureRoomBootstrapTasks() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (!room.controller || !room.controller.my) {
            continue;
        }

        ensureTask(room.name, constants.taskTypes.CHECKER, {
            nextCheckIndex: 0,
            nextRunTick: Game.time,
        });
        ensureTask(room.name, constants.taskTypes.BUILD, {});
    }
}

function ensureTask(roomName, taskType, data) {
    const hasTask = tasks.listTasks(roomName).some(function (task) {
        return task.type === taskType;
    });

    if (!hasTask) {
        tasks.addTask(taskType, roomName, data);
    }
}
