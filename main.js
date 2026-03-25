const bootstrap = require("./bootstrap");
const cleanup = require("./cleanup");
const colonyManager = require("./colony.manager");
const constructionManager = require("./construction.manager");
const constants = require("./constants");
const expansionManager = require("./expansion.manager");
const executorRunner = require("./executor.runner");
const sourceManager = require("./source.manager");
const resourceVisualizer = require("./resource.visualizer");
const renewTtlTask = require("./task.renewTtl");
const towerManager = require("./tower.manager");

function runSpawns() {
    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (!spawn.memory.role) {
            spawn.memory.role = constants.roles.SPAWNER;
        }

        if (renewTtlTask.runSpawnRenew(spawn)) {
            continue;
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
    colonyManager.refreshColonyTargets();
    sourceManager.refreshManagedSources();
    constructionManager.refreshManagedConstruction();
    expansionManager.refreshExpansion();
    runSpawns();
    runCreeps();
    towerManager.runTowers();
    resourceVisualizer.drawManagedRoomsResourcePlans();
};
