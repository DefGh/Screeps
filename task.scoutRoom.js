const constants = require("./constants");
const expansionManager = require("./expansion.manager");
const movement = require("./movement");

function run(creep, task) {
    if (!isValidScoutTask(task) || !creep || typeof creep.moveTo !== "function") {
        return true;
    }

    if (creep.room && creep.room.name === task.data.targetRoomName) {
        expansionManager.recordRoomIntel(creep.room);
        return true;
    }

    movement.moveTo(creep, new RoomPosition(25, 25, task.data.targetRoomName));
    return false;
}

function canExecute(executor, task) {
    return Boolean(
        validate(task) &&
        executor &&
        executor.memory &&
        typeof executor.moveTo === "function" &&
        executor.memory.originRoomName === task.data.originRoomName
    );
}

function isValidScoutTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.SCOUT_ROOM &&
        task.data &&
        typeof task.data.targetRoomName === "string" &&
        typeof task.data.originRoomName === "string" &&
        typeof task.data.rootRoomName === "string" &&
        typeof task.data.depth === "number"
    );
}

function validate(task) {
    return isValidScoutTask(task);
}

function getOwnerRoom(task) {
    return validate(task) ? task.data.originRoomName : null;
}

module.exports = {
    canExecute,
    getOwnerRoom,
    run,
    validate,
};
