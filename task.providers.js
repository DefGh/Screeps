const constants = require("./constants");
const spawnCreepTask = require("./task.spawnCreep");

const providersByRole = {
    [constants.roles.SPAWNER]: [spawnCreepTask.ensureUniversalSpawnTask],
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
