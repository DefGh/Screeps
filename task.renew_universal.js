const constants = require("./constants");
const renewUniversal = require("./renew.universal");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task, executor, ctx) {
    if (task.type !== constants.taskTypes.RENEW_UNIVERSAL) {
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
        creep.name !== task.data.targetCreepName ||
        !renewUniversal.isUniversalOfRoom(creep, task.room) ||
        !renewUniversal.isGenerationCurrent(creep, task.room) ||
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
        !creep ||
        !renewUniversal.isUniversalOfRoom(creep, task.room) ||
        !renewUniversal.isGenerationCurrent(creep, task.room) ||
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
                targetCreepName: creep.name,
            },
        },
    ];
}

module.exports = {
    onCompleted,
    tryDispatch,
};
