const constants = require("./constants");
const renewUniversal = require("./renew.universal");

function onCompleted(task, action, ctx) {
    const creep = Game.creeps[task.data.targetCreepName];

    if (creep) {
        delete creep.memory.restoreTtl;
        delete creep.memory.tripPhase;
    }

    ctx.removeTask(task.id);
}

function tryDispatch(task, executor, ctx) {
    if (task.type !== constants.taskTypes.RENEW_HAULER) {
        return [];
    }

    if (ctx.executorType === "creep") {
        return tryDispatchCreep(task, executor);
    }

    if (ctx.executorType === "spawn") {
        return tryDispatchSpawn(task, executor);
    }

    return [];
}

function tryDispatchCreep(task, creep) {
    if (
        !isTargetHauler(task, creep) ||
        renewUniversal.isComplete(creep, task.data.renewUntil)
    ) {
        return [];
    }

    const spawn = Game.spawns[task.data.spawnName];

    if (!spawn || spawn.room.name !== task.room) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.MOVE_TO_RENEW,
            data: {
                renewUntil: task.data.renewUntil,
                spawnName: spawn.name,
                targetCreepName: creep.name,
            },
        },
    ];
}

function tryDispatchSpawn(task, spawn) {
    if (
        spawn.room.name !== task.room ||
        spawn.name !== task.data.spawnName ||
        spawn.spawning
    ) {
        return [];
    }

    const creep = Game.creeps[task.data.targetCreepName];

    if (
        !isTargetHauler(task, creep) ||
        renewUniversal.isComplete(creep, task.data.renewUntil) ||
        !spawn.pos.isNearTo(creep)
    ) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.RENEW_CREEP,
            data: {
                renewUntil: task.data.renewUntil,
                spawnName: spawn.name,
                targetCreepName: creep.name,
            },
        },
    ];
}

function isTargetHauler(task, creep) {
    return !!(
        creep &&
        task.data &&
        creep.name === task.data.targetCreepName &&
        creep.memory.role === constants.roles.HAULER &&
        creep.memory.originRoomName === task.room &&
        creep.memory.sourceId === task.data.sourceId &&
        creep.memory.restoreTtl
    );
}

module.exports = {
    onCompleted,
    tryDispatch,
};
