const constants = require("./constants");

function handle(event, ctx) {
    const room = Game.rooms[event.room];
    const syncTaskTypes = [
        constants.taskTypes.SYNC_EXTENSIONS,
        constants.taskTypes.SYNC_TOWERS,
        constants.taskTypes.SYNC_FORTIFICATIONS,
    ];

    if (!room || !room.controller || !room.controller.my) {
        return;
    }

    for (const taskType of syncTaskTypes) {
        const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
            return task.type === taskType;
        });

        if (matchedTasks.length === 0) {
            ctx.createTask(taskType, room.name, {});
            ctx.log(
                `[events] ${room.name} RCL ${event.data.previousLevel || "?"} -> ${event.data.currentLevel}, add ${taskType}`
            );
            continue;
        }

        for (let index = 1; index < matchedTasks.length; index += 1) {
            ctx.removeTask(matchedTasks[index].id);
        }
    }
}

module.exports = {
    handle,
};
