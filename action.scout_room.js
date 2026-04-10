const tasks = require("./tasks");
const expansion = require("./expansion");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    if (creep.pos.roomName === action.data.roomName) {
        expansion.rememberScoutRoomSnapshot(creep, action);
        return true;
    }

    creep.moveTo(new RoomPosition(25, 25, action.data.roomName));
    return false;
}

function onCompleted(action) {
    expansion.recordScoutedRoom(action.data.roomName, action.data);
}

function onCreepDeath(event, action) {
    expansion.recordScoutDeath(event, action);
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
