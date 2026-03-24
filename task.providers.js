const constants = require("./constants");
const buildTask = require("./task.build");
const defendRoomTask = require("./task.defendRoom");
const renewTtlTask = require("./task.renewTtl");
const spawnCreepTask = require("./task.spawnCreep");
const transferEnergyTask = require("./task.transferEnergy");

function ensureUniversalTask(executor) {
    if (
        !executor ||
        !executor.room ||
        !executor.memory ||
        executor.memory.originRoomName !== executor.room.name
    ) {
        return false;
    }

    if (buildTask.ensureBuildTask(executor)) {
        return true;
    }

    return transferEnergyTask.ensureTransferEnergyTask(executor);
}

const providersByRole = {
    [constants.roles.SPAWNER]: [
        spawnCreepTask.ensureAttackerSpawnTask,
        spawnCreepTask.ensureUniversalSpawnTask,
        spawnCreepTask.ensureMinerSpawnTask,
        spawnCreepTask.ensureClaimerSpawnTask,
        spawnCreepTask.ensureScoutSpawnTask,
    ],
    [constants.roles.ATTACKER]: [
        defendRoomTask.ensureDefendRoomTask,
    ],
    [constants.roles.UNIVERSAL]: [
        renewTtlTask.ensureRenewTtlTask,
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
