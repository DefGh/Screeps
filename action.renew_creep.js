const constants = require("./constants");
const debug = require("./debug");
const tasks = require("./tasks");
const renewUniversal = require("./renew.universal");

function execute(spawn, action) {
    const task = tasks.getTask(action.taskId);

    if (!task || !isValidRenewSpawn(task, spawn, action)) {
        return true;
    }

    const creep = Game.creeps[action.data.targetCreepName];

    if (!isValidRenewTarget(task, creep)) {
        return true;
    }

    if (isRenewComplete(creep, action.data.renewUntil)) {
        return true;
    }

    const result = spawn.renewCreep(creep);

    if (
        result !== OK &&
        result !== ERR_BUSY &&
        result !== ERR_NOT_ENOUGH_ENERGY &&
        result !== ERR_NOT_IN_RANGE &&
        result !== ERR_INVALID_TARGET &&
        (
            typeof ERR_FULL === "undefined" ||
            result !== ERR_FULL
        )
    ) {
        debug.log(`[runner] spawn ${spawn.name} failed ${action.type} with ${result}`);
    }

    return true;
}

function onCompleted(action) {
    const task = tasks.getTask(action.taskId);

    if (
        !task ||
        (
            task.type !== constants.taskTypes.RENEW_UNIVERSAL &&
            task.type !== constants.taskTypes.RENEW_HAULER
        )
    ) {
        return;
    }

    const creep = Game.creeps[action.data.targetCreepName];

    if (renewUniversal.isComplete(creep, action.data.renewUntil)) {
        task.donePercent = 100;
        task.assignedPercent = 100;
        return;
    }

    task.donePercent = renewUniversal.getProgressPercent(creep, action.data.renewUntil);
    task.assignedPercent = task.donePercent;
}

function isValidRenewTarget(task, creep) {
    if (!creep) {
        return false;
    }

    if (task.type === constants.taskTypes.RENEW_UNIVERSAL) {
        return (
            renewUniversal.isUniversalOfRoom(creep, task.room) &&
            renewUniversal.isGenerationCurrent(creep, task.room)
        );
    }

    if (task.type === constants.taskTypes.MINING_OPERATION) {
        return !!(
            task.data &&
            task.data.isRemote &&
            creep.memory.role === constants.roles.HAULER &&
            creep.memory.originRoomName === task.room &&
            creep.memory.sourceId === task.data.sourceId &&
            creep.memory.restoreTtl
        );
    }

    if (task.type === constants.taskTypes.RENEW_HAULER) {
        return !!(
            task.data &&
            creep.memory.role === constants.roles.HAULER &&
            creep.memory.originRoomName === task.room &&
            creep.memory.sourceId === task.data.sourceId &&
            creep.memory.restoreTtl
        );
    }

    return false;
}

function isValidRenewSpawn(task, spawn, action) {
    return !!(
        spawn &&
        action.data &&
        spawn.name === action.data.spawnName &&
        spawn.room.name === task.room
    );
}

function isRenewComplete(creep, renewUntil) {
    return !!(
        creep &&
        Number.isFinite(creep.ticksToLive) &&
        creep.ticksToLive >= renewUniversal.getRenewUntil(renewUntil)
    );
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
