const bootstrap = require("./bootstrap");
const cleanup = require("./cleanup");
const executor = require("./executor");
const observer = require("./observer");
const planner = require("./planner");
const towerManager = require("./tower.manager");
const constants = require("./constants");

function runSpawns() {
    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        spawn.memory.originRoomName = spawn.room.name;
        spawn.memory.role = constants.roles.SPAWNER;
        executor.runExecutor(spawn);
    }
}

function runCreeps() {
    for (const name in Game.creeps) {
        executor.runExecutor(Game.creeps[name]);
    }
}

module.exports.loop = function () {
    bootstrap.bootstrapMemory();
    const deadCreepsByOriginRoom = cleanup.cleanupDeadCreeps();
    const roomDeltas = observer.observeOwnedRooms(deadCreepsByOriginRoom);
    const empireDelta = observer.observeEmpire();

    planner.reconcileExpansion(empireDelta);
    planner.reconcileDirtyRooms(roomDeltas);

    runSpawns();
    runCreeps();
    towerManager.runTowers();
};
