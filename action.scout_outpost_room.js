const longRangeMining = require("./long_range_mining");
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
    const task = tasks.getTask(action.taskId);

    if (
        !task ||
        !task.data ||
        !task.data.outposts
    ) {
        return;
    }

    if (!task.data.outposts[action.data.roomName]) {
        task.data.outposts[action.data.roomName] = {
            roomName: action.data.roomName,
            sourceIds: [],
            status: "unknown",
        };
    }

    const outpost = task.data.outposts[action.data.roomName];

    outpost.lastSeen = Game.time;

    if (Game.rooms[action.data.roomName]) {
        const classification = longRangeMining.classifyOutpost(task.room, Game.rooms[action.data.roomName]);

        outpost.sourceIds = classification.sourceIds;
        outpost.status = classification.status;
    }
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
