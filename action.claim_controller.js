const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const room = Game.rooms[action.data.roomName];

    if (!room || !room.controller) {
        creep.moveTo(new RoomPosition(25, 25, action.data.roomName));
        return false;
    }

    if (room.controller.my) {
        return true;
    }

    const result = creep.claimController(room.controller);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(room.controller);
        return false;
    }

    return (
        result === OK ||
        result === ERR_GCL_NOT_ENOUGH ||
        result === ERR_INVALID_TARGET ||
        result === ERR_NOT_OWNER ||
        result === ERR_BUSY
    );
}

function onCompleted() {
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
