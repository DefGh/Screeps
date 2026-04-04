const tasks = require("./tasks");
const constants = require("./constants");
const renewUniversal = require("./renew.universal");

function execute(creep, action) {
    const task = tasks.getTask(action.taskId);

    if (!task || !isValidRenewTarget(task, creep, action)) {
        return true;
    }

    if (isRenewComplete(creep, action.data.renewUntil)) {
        return true;
    }

    const spawn = Game.spawns[action.data.spawnName];

    if (!isValidRenewSpawn(task, spawn, action)) {
        return true;
    }

    if (!creep.pos.inRangeTo(spawn, 1)) {
        creep.moveTo(spawn, {
            range: 1,
        });
    }

    return false;
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

function isValidRenewTarget(task, creep, action) {
    if (
        !creep ||
        !action.data ||
        creep.name !== action.data.targetCreepName
    ) {
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
