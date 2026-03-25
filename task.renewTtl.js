const colonyManager = require("./colony.manager");
const constants = require("./constants");
const movement = require("./movement");
const taskHelpers = require("./task.helpers");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");

let retainedUniversalsCacheTick = null;
let retainedUniversalsByRoom = {};

function run(creep, task) {
    if (
        !validate(task) ||
        !creep ||
        typeof creep.moveTo !== "function" ||
        creep.name !== task.data.creepName
    ) {
        return true;
    }

    if (!shouldRenewUniversal(creep)) {
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

    const existingTask = findManagedRenewTask(executor.name);

    if (existingTask) {
        return existingTask.data.creepName === executor.name;
    }

    return Boolean(taskHelpers.addTask({
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
        shouldRenewUniversal(executor) &&
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
            !shouldRenewUniversal(creep) ||
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

    const managedTask = findManagedRenewTask(creepName);

    return managedTask && managedTask.data.creepName === creepName
        ? managedTask
        : null;
}

function findManagedRenewTask(preferredCreepName) {
    const renewTasks = [];

    for (const task of taskIndex.getTasksByType(constants.taskTypes.RENEW_TTL)) {
        if (
            task.status !== constants.taskStatuses.PENDING &&
            task.status !== constants.taskStatuses.IN_PROGRESS
        ) {
            continue;
        }

        renewTasks.push(task);
    }

    if (renewTasks.length === 0) {
        return null;
    }

    const matchedTask =
        findRenewTaskByStatusAndCreepName(
            renewTasks,
            constants.taskStatuses.IN_PROGRESS,
            preferredCreepName
        ) ||
        findRenewTaskByStatus(renewTasks, constants.taskStatuses.IN_PROGRESS) ||
        findRenewTaskByCreepName(renewTasks, preferredCreepName) ||
        renewTasks[0];

    const removedTaskIds = [];

    for (const task of renewTasks) {
        if (task.id === matchedTask.id) {
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

function shouldRenewUniversal(creep) {
    if (
        !creep ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL ||
        typeof creep.name !== "string" ||
        typeof creep.memory.originRoomName !== "string"
    ) {
        return false;
    }

    if (!isCurrentUniversalGeneration(creep)) {
        return false;
    }

    const retainedNames = getRetainedUniversalNames(creep.memory.originRoomName);
    return Boolean(retainedNames[creep.name]);
}

function isCurrentUniversalGeneration(creep) {
    if (
        !creep ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL ||
        typeof creep.memory.originRoomName !== "string"
    ) {
        return false;
    }

    return (
        taskHelpers.getUniversalGenerationForCreep(creep) ===
        taskHelpers.getUniversalGenerationForRoom(creep.memory.originRoomName)
    );
}

function getRetainedUniversalNames(roomName) {
    if (retainedUniversalsCacheTick !== Game.time) {
        retainedUniversalsCacheTick = Game.time;
        retainedUniversalsByRoom = {};
    }

    if (!retainedUniversalsByRoom[roomName]) {
        retainedUniversalsByRoom[roomName] = buildRetainedUniversalNames(roomName);
    }

    return retainedUniversalsByRoom[roomName];
}

function buildRetainedUniversalNames(roomName) {
    const retainedNames = {};
    const universals = [];

    if (typeof roomName !== "string") {
        return retainedNames;
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (
            !creep ||
            !creep.memory ||
            creep.memory.role !== constants.roles.UNIVERSAL ||
            creep.memory.originRoomName !== roomName ||
            typeof creep.name !== "string"
        ) {
            continue;
        }

        universals.push(creep);
    }

    if (universals.length === 0) {
        return retainedNames;
    }

    const targetUniversals = colonyManager.getTargetUniversalsForRoom(roomName);

    universals.sort(compareUniversalsForRetention);

    for (let index = 0; index < Math.min(targetUniversals, universals.length); index += 1) {
        retainedNames[universals[index].name] = true;
    }

    return retainedNames;
}

function compareUniversalsForRetention(left, right) {
    const leftTtl = typeof left.ticksToLive === "number" ? left.ticksToLive : -1;
    const rightTtl = typeof right.ticksToLive === "number" ? right.ticksToLive : -1;

    if (leftTtl !== rightTtl) {
        return rightTtl - leftTtl;
    }

    return left.name.localeCompare(right.name);
}

function findRenewTaskByStatus(tasks, status) {
    for (const task of tasks) {
        if (task.status === status) {
            return task;
        }
    }

    return null;
}

function findRenewTaskByCreepName(tasks, creepName) {
    if (typeof creepName !== "string") {
        return null;
    }

    for (const task of tasks) {
        if (task.data.creepName === creepName) {
            return task;
        }
    }

    return null;
}

function findRenewTaskByStatusAndCreepName(tasks, status, creepName) {
    if (typeof creepName !== "string") {
        return null;
    }

    for (const task of tasks) {
        if (task.status === status && task.data.creepName === creepName) {
            return task;
        }
    }

    return null;
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
