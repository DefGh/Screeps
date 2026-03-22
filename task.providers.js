const constants = require("./constants");
const buildTask = require("./task.build");
const spawnCreepTask = require("./task.spawnCreep");
const transferEnergyTask = require("./task.transferEnergy");

function ensureUniversalTask(executor) {
    if (buildTask.ensureBuildTask(executor)) {
        return true;
    }

    return transferEnergyTask.ensureTransferEnergyTask(executor);
}

const providersByRole = {
    [constants.roles.SPAWNER]: [
        spawnCreepTask.ensureUniversalSpawnTask,
        spawnCreepTask.ensureMinerSpawnTask,
    ],
    [constants.roles.UNIVERSAL]: [
        ensureUniversalTask,
    ],
};

function runProviders(role, executor) {
    const providers = providersByRole[role];

    if (!providers) {
        return;
    }

    for (const provider of providers) {
        provider(executor);
    }
}

module.exports = {
    runProviders,
};
