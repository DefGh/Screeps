const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    if (isAtTarget(creep, action.data)) {
        return true;
    }

    creep.moveTo(new RoomPosition(
        action.data.x,
        action.data.y,
        action.data.roomName
    ));
    return false;
}

function onCompleted() {
}

function onCreepDeath() {
}

function isAtTarget(creep, data) {
    return (
        creep.pos.roomName === data.roomName &&
        creep.pos.x === data.x &&
        creep.pos.y === data.y
    );
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
