
require('room.prototype');
require('creep.prototype');
require('spawn.prototype');
 

module.exports.loop = function () {
    Memory.wasReplaced = false;

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName]
        room.run();
    }

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];
        creep.run();
    }

    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
}
