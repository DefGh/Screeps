const constants = require("./constants");
const debug = require("./debug");
const executorRunner = require("./executor.runner");
const events = require("./events");
const init = require("./init");

module.exports.loop = function () {
    init();
    fireCreepDeathEvents();
    executorRunner.run();

    debug.visuals(); 
};

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
