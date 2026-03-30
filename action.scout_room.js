const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    if (creep.pos.roomName === action.data.roomName) {
        return true;
    }

    creep.moveTo(new RoomPosition(25, 25, action.data.roomName));
    return false;
}

function onCompleted(action) {
    require("./expansion").recordScoutedRoom(action.data.roomName, action.data);
}

function onCreepDeath(event, action) {
    require("./expansion").blockScoutDirection(action);
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
