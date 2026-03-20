const bootstrap = require("./bootstrap");
const cleanup = require("./cleanup");
const constants = require("./constants");
const executorRunner = require("./executor.runner");
const sourceManager = require("./source.manager");

function runSpawns() {
    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (!spawn.memory.role) {
            spawn.memory.role = constants.roles.SPAWNER;
        }

        executorRunner.runExecutor(spawn);
    }
}

function runCreeps() {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (!creep.memory.role) {
            continue;
        }

        executorRunner.runExecutor(creep);
    }
}

module.exports.loop = function () {
    bootstrap.bootstrapMemory();
    cleanup.cleanupDeadCreeps();
    sourceManager.refreshManagedSources();
    runSpawns();
    runCreeps();
};
