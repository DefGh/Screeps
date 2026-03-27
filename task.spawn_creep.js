const constants = require("./constants");
const creepRoles = require("./creep.roles");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task) {
    if (
        task.type !== constants.taskTypes.SPAWN_CREEP ||
        task.assignedPercent >= 100 ||
        !task.data.role ||
        !creepRoles.get(task.data.role)
    ) {
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
