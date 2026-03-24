const constants = require("./constants");
const movement = require("./movement");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");

function run(creep, task) {
    if (
        !isValidDefendRoomTask(task) ||
        !creep ||
        typeof creep.moveTo !== "function" ||
        typeof creep.attack !== "function"
    ) {
        return true;
    }

    if (!creep.room || creep.room.name !== task.data.roomName) {
        movement.moveTo(creep, new RoomPosition(25, 25, task.data.roomName));
        return false;
    }

    const hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);

    if (!hostileCreeps || hostileCreeps.length === 0) {
        return true;
    }

    const target = creep.pos.findClosestByRange(hostileCreeps);

    if (!target) {
        return false;
    }

    const result = creep.attack(target);

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target);
        return false;
    }

    if (result === OK || result === ERR_BUSY || result === ERR_TIRED) {
        return false;
    }

    return false;
}

function canExecute(executor, task) {
    return (
        validate(task) &&
        executor &&
        executor.memory &&
        executor.memory.originRoomName === task.data.roomName &&
        typeof executor.moveTo === "function" &&
        typeof executor.attack === "function"
    );
}

function ensureDefendRoomTask(executor) {
    const roomName = executor && executor.memory ? executor.memory.originRoomName : null;

    if (typeof roomName !== "string") {
        return;
    }

    const room = Game.rooms[roomName];

    if (!room) {
        return;
    }

    const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);

    if (!hostileCreeps || hostileCreeps.length === 0 || hasActiveDefendRoomTask(roomName)) {
        return;
    }

    taskStore.addTask({
        id: taskStore.nextTaskId(constants.taskTypes.DEFEND_ROOM),
        type: constants.taskTypes.DEFEND_ROOM,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.ATTACKER],
        data: {
            roomName: roomName,
        },
    });
}

function hasActiveDefendRoomTask(roomName) {
    for (const task of taskIndex.getTasksByType(constants.taskTypes.DEFEND_ROOM)) {
        if (task.data.roomName === roomName) {
            return true;
        }
    }

    return false;
}

function isValidDefendRoomTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.DEFEND_ROOM &&
        task.data &&
        typeof task.data.roomName === "string"
    );
}

function validate(task) {
    return isValidDefendRoomTask(task);
}

function getOwnerRoom(task) {
    return validate(task) ? task.data.roomName : null;
}

module.exports = {
    canExecute,
    ensureDefendRoomTask,
    getOwnerRoom,
    run,
    validate,
};
