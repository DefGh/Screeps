const constants = require("./constants");
const roomScope = require("./room.scope");
const sourceManager = require("./source.manager");

function bootstrapMemory() {
    if (!Memory.creeps) {
        Memory.creeps = {};
    }

    if (!Memory.sources) {
        Memory.sources = {};
    }

    if (!Memory.spawns) {
        Memory.spawns = {};
    }

    if (!Memory.tasks) {
        Memory.tasks = {};
    }

    if (!Memory.colony) {
        Memory.colony = {};
    }

    if (!Memory.expansion || typeof Memory.expansion !== "object") {
        Memory.expansion = {};
    }

    if (!Memory.construction || typeof Memory.construction !== "object") {
        Memory.construction = {};
    }

    if (!Memory.construction.rooms || typeof Memory.construction.rooms !== "object") {
        Memory.construction.rooms = {};
    }

    if (typeof Memory.colony.targetUniversals !== "number") {
        Memory.colony.targetUniversals = constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    Memory.colony.targetUniversals = normalizeTargetUniversals(Memory.colony.targetUniversals);

    if (!Memory.colony.universalTargeting || typeof Memory.colony.universalTargeting !== "object") {
        Memory.colony.universalTargeting = {};
    }

    if (!Memory.colony.targetUniversalsByRoom || typeof Memory.colony.targetUniversalsByRoom !== "object") {
        Memory.colony.targetUniversalsByRoom = {};
    }

    if (
        !Memory.colony.universalTargetingByRoom ||
        typeof Memory.colony.universalTargetingByRoom !== "object"
    ) {
        Memory.colony.universalTargetingByRoom = {};
    }

    if (!Memory.expansion.roomIntel || typeof Memory.expansion.roomIntel !== "object") {
        Memory.expansion.roomIntel = {};
    }

    if (!Memory.expansion.branchIntel || typeof Memory.expansion.branchIntel !== "object") {
        Memory.expansion.branchIntel = {};
    }

    if (!Memory.expansion.activeBranch || typeof Memory.expansion.activeBranch !== "object") {
        Memory.expansion.activeBranch = null;
    }

    if (!Memory.expansion.activeCandidate || typeof Memory.expansion.activeCandidate !== "object") {
        Memory.expansion.activeCandidate = null;
    }

    if (typeof Memory.taskSequence !== "number") {
        Memory.taskSequence = 0;
    }

    initializePerRoomUniversalMemory();
    backfillLegacyLocalTaskRooms();
    backfillUniversalOriginRooms();
    backfillMinerOriginRooms();
    cleanupUnderspecifiedPendingLocalTasks();
}

function initializePerRoomUniversalMemory() {
    const legacyTargetUniversals = normalizeTargetUniversals(Memory.colony.targetUniversals);

    for (const roomName of roomScope.getOperationalRoomNames()) {
        if (typeof Memory.colony.targetUniversalsByRoom[roomName] !== "number") {
            Memory.colony.targetUniversalsByRoom[roomName] = legacyTargetUniversals;
        } else {
            Memory.colony.targetUniversalsByRoom[roomName] = normalizeTargetUniversals(
                Memory.colony.targetUniversalsByRoom[roomName]
            );
        }

        if (
            !Memory.colony.universalTargetingByRoom[roomName] ||
            typeof Memory.colony.universalTargetingByRoom[roomName] !== "object"
        ) {
            Memory.colony.universalTargetingByRoom[roomName] = {};
        }
    }
}

function backfillUniversalOriginRooms() {
    backfillCreepOriginRooms(constants.roles.UNIVERSAL);
}

function backfillMinerOriginRooms() {
    backfillCreepOriginRooms(constants.roles.MINER);
}

function backfillCreepOriginRooms(role) {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (
            !creep ||
            !creep.my ||
            !creep.memory ||
            creep.memory.role !== role ||
            typeof creep.memory.originRoomName === "string"
        ) {
            continue;
        }

        const originRoomName = resolveLegacyExecutorOriginRoomName(creep);

        if (typeof originRoomName === "string") {
            creep.memory.originRoomName = originRoomName;
        }
    }
}

function backfillLegacyLocalTaskRooms() {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!isLocalTask(task) || !task.data) {
            continue;
        }

        const roomName = resolveLocalTaskRoomName(task);

        if (typeof roomName === "string") {
            task.data.roomName = roomName;
            ensureLocalSpawnTaskOriginRoom(task, roomName);
        }
    }
}

function ensureLocalSpawnTaskOriginRoom(task, roomName) {
    if (!isLocalSpawnTask(task) || typeof roomName !== "string") {
        return;
    }

    if (!task.data.memory || typeof task.data.memory !== "object") {
        task.data.memory = {};
    }

    if (typeof task.data.memory.originRoomName !== "string") {
        task.data.memory.originRoomName = roomName;
    }
}

function resolveLegacyExecutorOriginRoomName(creep) {
    const taskId = creep && creep.memory ? creep.memory.taskId : null;
    const task = taskId ? Memory.tasks[taskId] : null;
    const taskRoomName = resolveOwnedTaskRoomName(task);

    if (typeof taskRoomName === "string") {
        return taskRoomName;
    }

    return creep && creep.room && typeof creep.room.name === "string" ? creep.room.name : null;
}

function resolveOwnedTaskRoomName(task) {
    const localTaskRoomName = resolveLocalTaskRoomName(task);

    if (typeof localTaskRoomName === "string") {
        return localTaskRoomName;
    }

    return task && task.data && typeof task.data.originRoomName === "string"
        ? task.data.originRoomName
        : null;
}

function resolveLocalTaskRoomName(task) {
    if (!task || !task.data) {
        return null;
    }

    if (typeof task.data.roomName === "string") {
        return task.data.roomName;
    }

    if (!isLocalTask(task)) {
        return null;
    }

    if (task.type === constants.taskTypes.SPAWN_CREEP) {
        return resolveLocalSpawnTaskRoomName(task);
    }

    if (task.type === constants.taskTypes.MINE) {
        return resolveSourceRoomName(task.data.sourceId);
    }

    if (task.type === constants.taskTypes.BUILD) {
        return task.data.targetPos && typeof task.data.targetPos.roomName === "string"
            ? task.data.targetPos.roomName
            : null;
    }

    if (task.type === constants.taskTypes.TAXI) {
        if (task.data.minerPos && typeof task.data.minerPos.roomName === "string") {
            return task.data.minerPos.roomName;
        }

        return resolveSourceRoomName(task.data.sourceId);
    }

    if (task.type === constants.taskTypes.REPAIR) {
        return getObjectRoomName(task.data.targetId);
    }

    if (task.type === constants.taskTypes.TRANSFER_ENERGY) {
        return getObjectRoomName(task.data.targetId) || getObjectRoomName(task.data.sourceId);
    }

    return null;
}

function resolveLocalSpawnTaskRoomName(task) {
    if (!isLocalSpawnTask(task)) {
        return null;
    }

    if (task.data.memory && typeof task.data.memory.originRoomName === "string") {
        return task.data.memory.originRoomName;
    }

    if (task.data.role === constants.roles.MINER) {
        return resolveSourceRoomName(task.data.sourceId) || resolveLinkedTaskRoomName(task.data.mineTaskId);
    }

    return null;
}

function resolveLinkedTaskRoomName(taskId) {
    if (!taskId || !Memory.tasks) {
        return null;
    }

    return resolveLocalTaskRoomName(Memory.tasks[taskId]);
}

function resolveSourceRoomName(sourceId) {
    const minerPos = sourceManager.getMinerPos(sourceId);

    if (minerPos && typeof minerPos.roomName === "string") {
        return minerPos.roomName;
    }

    return getObjectRoomName(sourceId);
}

function cleanupUnderspecifiedPendingLocalTasks() {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (
            !task ||
            task.status !== constants.taskStatuses.PENDING ||
            !isLocalTask(task)
        ) {
            continue;
        }

        if (typeof resolveLocalTaskRoomName(task) !== "string") {
            delete Memory.tasks[taskId];
        }
    }
}

function isLocalTask(task) {
    if (!task || !task.data) {
        return false;
    }

    if (task.type === constants.taskTypes.SPAWN_CREEP) {
        return isLocalSpawnTask(task);
    }

    return (
        task.type === constants.taskTypes.MINE ||
        task.type === constants.taskTypes.TAXI ||
        task.type === constants.taskTypes.BUILD ||
        task.type === constants.taskTypes.REPAIR ||
        task.type === constants.taskTypes.TRANSFER_ENERGY ||
        task.type === constants.taskTypes.DEFEND_ROOM
    );
}

function isLocalSpawnTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.SPAWN_CREEP &&
        task.data &&
        isLocalSpawnRole(task.data.role)
    );
}

function isLocalSpawnRole(role) {
    return (
        role === constants.roles.ATTACKER ||
        role === constants.roles.MINER ||
        role === constants.roles.UNIVERSAL
    );
}

function getObjectRoomName(objectId) {
    if (!objectId) {
        return null;
    }

    const object = Game.getObjectById(objectId);

    if (object && object.room && typeof object.room.name === "string") {
        return object.room.name;
    }

    return null;
}

function normalizeTargetUniversals(value) {
    if (typeof value !== "number") {
        return constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    return Math.max(constants.colony.MIN_TARGET_UNIVERSALS, value);
}

module.exports = {
    bootstrapMemory,
};
