const constants = require("./constants");

function handle(event, ctx) {
    const roomNames = Array.isArray(event.data.rooms) ? event.data.rooms : [];

    ctx.log(`[events] handled ${event.type} at tick ${event.tick}`);

    for (const roomName of roomNames) {
        const room = Game.rooms[roomName];

        if (room && room.controller && room.controller.my) {
            ctx.log(`[events] room ready: ${roomName}`);

            ctx.createTask(constants.taskTypes.SPAWN_CREEP, roomName, {
                role: constants.roles.UNIVERSAL,
            });
            ctx.createTask(constants.taskTypes.SPAWN_CREEP, roomName, {
                role: constants.roles.UNIVERSAL,
            });
            ctx.createTask(constants.taskTypes.SPAWN_CREEP, roomName, {
                role: constants.roles.UNIVERSAL,
            });

            ctx.createTask(constants.taskTypes.UPGRADE_CONTROLLER, roomName, {
                total: room.controller.progressTotal,
            });
            ctx.createTask(constants.taskTypes.CHECKER, roomName, {
                nextCheckIndex: 0,
                nextRunTick: Game.time,
            });
            ctx.createTask(constants.taskTypes.BUILD, roomName, {});
        }
    }
}

module.exports = {
    handle,
};
