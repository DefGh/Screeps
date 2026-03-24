const constants = require("./constants");
const taskStore = require("./task.store");

let cachedTick = null;
let cachedTaskVersion = null;
let cachedIndex = null;

function getIndex() {
    const taskVersion = taskStore.getTaskVersion();

    if (
        cachedIndex &&
        cachedTick === Game.time &&
        cachedTaskVersion === taskVersion
    ) {
        return cachedIndex;
    }

    cachedIndex = buildIndex();
    cachedTick = Game.time;
    cachedTaskVersion = taskVersion;
    return cachedIndex;
}

function getTaskHandlers() {
    return require("./task.handlers");
}

function getTaskById(taskId) {
    const index = getIndex();
    return index.byId[taskId] || null;
}

function getTasksByType(taskType) {
    const index = getIndex();
    return index.tasksByType[taskType] || [];
}

function getTasksByOwnerRoom(roomName) {
    const index = getIndex();
    return index.tasksByOwnerRoom[roomName] || [];
}

function getPendingTasksByRole(role) {
    const index = getIndex();
    return index.pendingByRole[role] || [];
}

function getPendingTasksByType(taskType) {
    const index = getIndex();
    return index.pendingByType[taskType] || [];
}

function getPendingTasksByOwnerRoom(roomName) {
    const index = getIndex();
    return index.pendingByOwnerRoom[roomName] || [];
}

function getPendingSpawnTasksByRoleAndRoom(role, roomName) {
    const index = getIndex();
    const tasksByRoom = index.pendingSpawnByRoleAndRoom[role];

    if (!tasksByRoom) {
        return [];
    }

    if (typeof roomName === "string") {
        return tasksByRoom[roomName] || [];
    }

    return flattenNestedTaskMap(tasksByRoom);
}

function getQueuedSpawnTasksByRoleAndRoom(role, roomName) {
    const index = getIndex();
    const tasksByRoom = index.queuedSpawnByRoleAndRoom[role];

    if (!tasksByRoom) {
        return [];
    }

    if (typeof roomName === "string") {
        return tasksByRoom[roomName] || [];
    }

    return flattenNestedTaskMap(tasksByRoom);
}

function getReservedOutgoing(sourceId, resourceType) {
    return getReservationAmount(getIndex().reservationsBySourceId, sourceId, resourceType);
}

function getReservedIncoming(targetId, resourceType) {
    return getReservationAmount(getIndex().reservationsByTargetId, targetId, resourceType);
}

function getActiveTask(taskId) {
    const index = getIndex();
    return index.activeByTaskId[taskId] || null;
}

function buildIndex() {
    const taskHandlers = getTaskHandlers();
    const index = {
        activeByTaskId: {},
        byId: {},
        pendingByOwnerRoom: {},
        pendingByRole: {},
        pendingByType: {},
        pendingSpawnByRoleAndRoom: {},
        queuedSpawnByRoleAndRoom: {},
        reservationsBySourceId: {},
        reservationsByTargetId: {},
        tasksByOwnerRoom: {},
        tasksByType: {},
    };
    const tasks = taskStore.getAllTasks();

    for (const taskId in tasks) {
        const task = tasks[taskId];

        if (!taskHandlers.validateTask(task)) {
            continue;
        }

        index.byId[taskId] = task;
        pushTask(index.tasksByType, task.type, task);

        const ownerRoom = taskHandlers.getTaskOwnerRoom(task);

        if (typeof ownerRoom === "string") {
            pushTask(index.tasksByOwnerRoom, ownerRoom, task);
        }

        if (task.status === constants.taskStatuses.IN_PROGRESS) {
            index.activeByTaskId[task.id] = task;
        }

        if (
            task.status === constants.taskStatuses.PENDING ||
            task.status === constants.taskStatuses.IN_PROGRESS
        ) {
            indexQueuedSpawnTask(index, task, ownerRoom);
            indexReservations(index, task);
        }

        if (task.status !== constants.taskStatuses.PENDING) {
            continue;
        }

        pushTask(index.pendingByType, task.type, task);

        if (typeof ownerRoom === "string") {
            pushTask(index.pendingByOwnerRoom, ownerRoom, task);
        }

        if (Array.isArray(task.canExecute)) {
            for (const role of task.canExecute) {
                pushTask(index.pendingByRole, role, task);
            }
        }

        indexPendingSpawnTask(index, task, ownerRoom);
    }

    return index;
}

function indexPendingSpawnTask(index, task, ownerRoom) {
    if (
        task.type !== constants.taskTypes.SPAWN_CREEP ||
        !task.data ||
        typeof task.data.role !== "string" ||
        typeof ownerRoom !== "string"
    ) {
        return;
    }

    pushNestedTask(index.pendingSpawnByRoleAndRoom, task.data.role, ownerRoom, task);
}

function indexQueuedSpawnTask(index, task, ownerRoom) {
    if (
        task.type !== constants.taskTypes.SPAWN_CREEP ||
        !task.data ||
        typeof task.data.role !== "string" ||
        typeof ownerRoom !== "string"
    ) {
        return;
    }

    pushNestedTask(index.queuedSpawnByRoleAndRoom, task.data.role, ownerRoom, task);
}

function indexReservations(index, task) {
    if (!isResourceReservationTask(task) || !task.data) {
        return;
    }

    const resourceType = getTaskResourceType(task);

    if (task.data.sourceId) {
        addReservation(
            index.reservationsBySourceId,
            task.data.sourceId,
            resourceType,
            getOutgoingReservationAmount(task)
        );
    }

    if (
        task.type === constants.taskTypes.TRANSFER_ENERGY &&
        task.data.targetId
    ) {
        addReservation(
            index.reservationsByTargetId,
            task.data.targetId,
            resourceType,
            getIncomingReservationAmount(task)
        );
    }
}

function getTaskResourceType(task) {
    if (task && task.data && typeof task.data.resourceType === "string") {
        return task.data.resourceType;
    }

    return RESOURCE_ENERGY;
}

function getIncomingReservationAmount(task) {
    return task && task.data && typeof task.data.remainingAmount === "number"
        ? task.data.remainingAmount
        : 0;
}

function getOutgoingReservationAmount(task) {
    if (task && task.data && typeof task.data.collectRemainingAmount === "number") {
        return task.data.collectRemainingAmount;
    }

    return task && task.data && typeof task.data.remainingAmount === "number"
        ? task.data.remainingAmount
        : 0;
}

function isResourceReservationTask(task) {
    return Boolean(
        task &&
        task.data &&
        (
            task.type === constants.taskTypes.BUILD ||
            task.type === constants.taskTypes.REPAIR ||
            task.type === constants.taskTypes.TRANSFER_ENERGY
        )
    );
}

function getReservationAmount(map, objectId, resourceType) {
    if (
        !objectId ||
        !resourceType ||
        !map[objectId] ||
        typeof map[objectId][resourceType] !== "number"
    ) {
        return 0;
    }

    return map[objectId][resourceType];
}

function addReservation(map, objectId, resourceType, amount) {
    if (!objectId || !resourceType || typeof amount !== "number" || amount <= 0) {
        return;
    }

    if (!map[objectId] || typeof map[objectId] !== "object") {
        map[objectId] = {};
    }

    if (typeof map[objectId][resourceType] !== "number") {
        map[objectId][resourceType] = 0;
    }

    map[objectId][resourceType] += amount;
}

function pushTask(map, key, task) {
    if (!map[key]) {
        map[key] = [];
    }

    map[key].push(task);
}

function pushNestedTask(map, outerKey, innerKey, task) {
    if (!map[outerKey] || typeof map[outerKey] !== "object") {
        map[outerKey] = {};
    }

    if (!map[outerKey][innerKey]) {
        map[outerKey][innerKey] = [];
    }

    map[outerKey][innerKey].push(task);
}

function flattenNestedTaskMap(tasksByRoom) {
    const tasks = [];

    for (const roomName in tasksByRoom) {
        tasks.push.apply(tasks, tasksByRoom[roomName]);
    }

    return tasks;
}

module.exports = {
    getActiveTask,
    getPendingSpawnTasksByRoleAndRoom,
    getPendingTasksByOwnerRoom,
    getPendingTasksByRole,
    getPendingTasksByType,
    getQueuedSpawnTasksByRoleAndRoom,
    getReservedIncoming,
    getReservedOutgoing,
    getTaskById,
    getTasksByOwnerRoom,
    getTasksByType,
};
