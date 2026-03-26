const constants = require("./constants");
const expansionManager = require("./expansion.manager");
const movement = require("./movement");
const taskHelpers = require("./task.helpers");

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
        taskHelpers.canExecuteTaskInRoom(executor, task.data.originRoomName, ["moveTo"])
    );
}

function isValidScoutTask(task) {
    return taskHelpers.hasTaskDataFields(task, constants.taskTypes.SCOUT_ROOM, {
        targetRoomName: "string",
        originRoomName: "string",
        rootRoomName: "string",
        depth: "number",
    });
}

function validate(task) {
    return isValidScoutTask(task);
}

function getOwnerRoom(task) {
    return taskHelpers.getTaskOwnerRoom(task, validate, "originRoomName");
}

module.exports = {
    canExecute,
    getOwnerRoom,
    run,
    validate,
};
