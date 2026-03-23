const constants = require("./constants");
const expansionManager = require("./expansion.manager");

function run(creep, task) {
    if (!isValidScoutTask(task) || !creep || typeof creep.moveTo !== "function") {
        return true;
    }

    if (creep.room && creep.room.name === task.data.targetRoomName) {
        expansionManager.recordRoomIntel(creep.room);
        return true;
    }

    creep.moveTo(new RoomPosition(25, 25, task.data.targetRoomName));
    return false;
}

function canExecute(executor, task) {
    return isValidScoutTask(task) && executor && typeof executor.moveTo === "function";
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

module.exports = {
    canExecute,
    run,
};
