const constants = require("./constants");
const creepRoles = require("./creep.roles");
const renewUniversal = require("./renew.universal");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task, spawn, ctx) {
    if (
        task.type !== constants.taskTypes.SPAWN_CREEP ||
        task.assignedPercent >= 100 ||
        !task.data.role ||
        !creepRoles.get(task.data.role) ||
        !spawn ||
        !ctx ||
        ctx.executorType !== "spawn"
    ) {
        return [];
    }

    if (renewUniversal.hasActiveRenewTaskForSpawn(task.room, spawn.name, ctx.listTasks)) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.SPAWN_CREEP,
            data: {
                memory: task.data.memory,
                role: task.data.role,
            },
        },
    ];
}

module.exports = {
    onCompleted,
    tryDispatch,
};
