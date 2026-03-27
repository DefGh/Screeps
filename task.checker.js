const checker = require("./checker");
const constants = require("./constants");

function onCompleted(task, action, ctx) {
    ctx.addTask(constants.taskTypes.CHECKER, task.room, {
        nextCheckIndex: ((task.data.nextCheckIndex || 0) + 1) % checker.getCycleLength(),
        nextRunTick: Game.time + checker.CHECK_INTERVAL,
    });
    ctx.removeTask(task.id);
}

function tryDispatch(task, room, ctx) {
    if (
        task.type !== constants.taskTypes.CHECKER ||
        ctx.executorType !== "room" ||
        room.name !== task.room ||
        Game.time < (task.data.nextRunTick || 0)
    ) {
        return [];
    }

    return [
        {
            type: checker.getCycleActionType(task.data.nextCheckIndex || 0),
            data: {},
        },
    ];
}

module.exports = {
    onCompleted,
    tryDispatch,
};
