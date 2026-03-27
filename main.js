const constants = require("./constants");
const debug = require("./debug");
const executorRunner = require("./executor.runner");
const events = require("./events");
const init = require("./init");

module.exports.loop = function () {
    init();
    fireRclChangeEvents();
    fireCreepDeathEvents();
    executorRunner.run();

    debug.visuals(); 
};

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
