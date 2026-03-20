const constants = require("./constants");
const spawnCreepTask = require("./task.spawnCreep");
const transferEnergyTask = require("./task.transferEnergy");

const providersByRole = {
    [constants.roles.SPAWNER]: [spawnCreepTask.ensureUniversalSpawnTask],
    [constants.roles.UNIVERSAL]: [transferEnergyTask.ensureTransferEnergyTask],
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
