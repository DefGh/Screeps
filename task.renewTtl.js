const constants = require("./constants");
const movement = require("./movement");
const taskHelpers = require("./task.helpers");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");

function run(creep, task) {
    if (
        !validate(task) ||
        !creep ||
        typeof creep.moveTo !== "function" ||
        creep.name !== task.data.creepName
    ) {
        return true;
    }

    if (typeof creep.ticksToLive !== "number" || creep.ticksToLive >= task.data.targetTtl) {
        return true;
    }

    const spawn = resolveOwnedSpawn(creep, task.data.roomName);

    if (!spawn) {
        return true;
    }

    if (!creep.pos.isNearTo(spawn)) {
        movement.moveTo(creep, spawn);
    }

    return false;
}

function canExecute(executor, task) {
    return Boolean(
        validate(task) &&
        executor &&
        executor.name === task.data.creepName &&
        taskHelpers.canExecuteTaskInRoom(executor, task.data.roomName, ["moveTo"])
    );
}

function ensureRenewTtlTask(executor) {
    if (!canRequestRenew(executor)) {
        return false;
    }

    return Boolean(findRenewTaskForCreep(executor.name) || taskHelpers.addTask({
        id: taskHelpers.nextTaskId(constants.taskTypes.RENEW_TTL),
        type: constants.taskTypes.RENEW_TTL,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: {
            roomName: executor.memory.originRoomName,
            creepName: executor.name,
            targetTtl: constants.renew.UNIVERSAL_TARGET_TTL,
        },
    }));
}

function runSpawnRenew(spawn) {
    if (!spawn || typeof spawn.renewCreep !== "function" || spawn.spawning) {
        return false;
    }

    const candidate = findAdjacentRenewCandidate(spawn);

    if (!candidate) {
        return false;
    }

    spawn.renewCreep(candidate);

    if (typeof spawn.say === "function") {
        spawn.say(constants.taskIcons[constants.taskTypes.RENEW_TTL] || constants.taskIcons.default);
    }

    return true;
}

function shouldPrioritizeRenew(executor) {
    return Boolean(findRenewTaskForCreep(executor && executor.name) || canRequestRenew(executor));
}

function canRequestRenew(executor) {
    return Boolean(
        executor &&
        executor.memory &&
        executor.memory.role === constants.roles.UNIVERSAL &&
        typeof executor.name === "string" &&
        typeof executor.memory.originRoomName === "string" &&
        typeof executor.ticksToLive === "number" &&
        executor.ticksToLive <= constants.renew.UNIVERSAL_START_TTL &&
        hasOwnedSpawnInRoom(executor.memory.originRoomName)
    );
}

function findAdjacentRenewCandidate(spawn) {
    if (!spawn.pos || typeof spawn.pos.findInRange !== "function") {
        return null;
    }

    let bestCandidate = null;

    for (const creep of spawn.pos.findInRange(FIND_MY_CREEPS, 1)) {
        const taskId = creep.memory && creep.memory.taskId;
        const task = taskStore.getTask(taskId);

        if (
            !validate(task) ||
            task.data.roomName !== spawn.room.name ||
            task.data.creepName !== creep.name ||
            typeof creep.ticksToLive !== "number" ||
            creep.ticksToLive >= task.data.targetTtl
        ) {
            continue;
        }

        if (!bestCandidate || creep.ticksToLive < bestCandidate.ticksToLive) {
            bestCandidate = creep;
        }
    }

    return bestCandidate;
}

function findRenewTaskForCreep(creepName) {
    if (typeof creepName !== "string") {
        return null;
    }

    let matchedTask = null;
    const removedTaskIds = [];

    for (const task of taskIndex.getTasksByType(constants.taskTypes.RENEW_TTL)) {
        if (
            task.data.creepName !== creepName ||
            (
                task.status !== constants.taskStatuses.PENDING &&
                task.status !== constants.taskStatuses.IN_PROGRESS
            )
        ) {
            continue;
        }

        if (!matchedTask) {
            matchedTask = task;
            continue;
        }

        removedTaskIds.push(task.id);
    }

    if (removedTaskIds.length > 0) {
        taskStore.removeTasks(removedTaskIds, {
            clearAssignments: true,
        });
    }

    return matchedTask;
}

function hasOwnedSpawnInRoom(roomName) {
    return getOwnedSpawnsInRoom(roomName).length > 0;
}

function resolveOwnedSpawn(creep, roomName) {
    const spawns = getOwnedSpawnsInRoom(roomName);

    if (spawns.length === 0) {
        return null;
    }

    if (creep && creep.pos && typeof creep.pos.findClosestByRange === "function") {
        return creep.pos.findClosestByRange(spawns) || spawns[0];
    }

    return spawns[0];
}

function getOwnedSpawnsInRoom(roomName) {
    const spawns = [];

    if (typeof roomName !== "string") {
        return spawns;
    }

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn.my && spawn.room && spawn.room.name === roomName) {
            spawns.push(spawn);
        }
    }

    return spawns;
}

function validate(task) {
    return taskHelpers.hasTaskDataFields(task, constants.taskTypes.RENEW_TTL, {
        roomName: "string",
        creepName: "string",
        targetTtl: "number",
    });
}

function getOwnerRoom(task) {
    return taskHelpers.getTaskOwnerRoom(task, validate, "roomName");
}

module.exports = {
    canExecute,
    ensureRenewTtlTask,
    getOwnerRoom,
    run,
    runSpawnRenew,
    shouldPrioritizeRenew,
    validate,
};
