const constants = require("./constants");

function handle(event, ctx) {
    const room = Game.rooms[event.room];

    if (!room || !room.controller || !room.controller.my) {
        return;
    }

    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.SYNC_EXTENSIONS;
    });

    if (matchedTasks.length === 0) {
        ctx.createTask(constants.taskTypes.SYNC_EXTENSIONS, room.name, {});
        ctx.log(
            `[events] ${room.name} RCL ${event.data.previousLevel || "?"} -> ${event.data.currentLevel}, add ${constants.taskTypes.SYNC_EXTENSIONS}`
        );
        return;
    }

    for (let index = 1; index < matchedTasks.length; index += 1) {
        ctx.removeTask(matchedTasks[index].id);
    }
}

module.exports = {
    handle,
};
