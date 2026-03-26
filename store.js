const constants = require("./constants");

function getRoomPlanner(roomName) {
    return Memory.rooms[roomName].planner;
}

function getExpansionMemory() {
    return Memory.empire.expansion;
}

function nextTaskId(type) {
    Memory.taskSequence += 1;
    return `${type}:${Memory.taskSequence}`;
}

function nextLocalTaskId(roomName, type) {
    const planner = getRoomPlanner(roomName);
    planner.taskSequence += 1;
    return `${roomName}:${type}:${planner.taskSequence}`;
}

function markRoomDirty(roomName, reason) {
    const planner = getRoomPlanner(roomName);
    planner.needsReconcile = true;
    planner.dirty[reason || "unknown"] = Game.time;
}

function clearRoomDirty(roomName) {
    const planner = getRoomPlanner(roomName);
    planner.needsReconcile = false;
    planner.dirty = {};
    planner.lastReconcileTick = Game.time;
}

function isRoomDirty(roomName) {
    return getRoomPlanner(roomName).needsReconcile;
}

function upsertIntent(roomName, intent) {
    const planner = getRoomPlanner(roomName);
    const nextIntent = Object.assign({}, planner.intents[intent.id] || {}, intent, {
        updatedAt: Game.time,
    });
    planner.intents[intent.id] = nextIntent;
    return nextIntent;
}

function removeIntent(roomName, intentId) {
    const planner = getRoomPlanner(roomName);
    delete planner.intents[intentId];
    return true;
}

function getIntents(roomName) {
    return getRoomPlanner(roomName).intents;
}

function addTask(task) {
    const planner = getRoomPlanner(task.roomName);
    planner.tasks[task.id] = task;
    planner.queueDirty = true;
    markRoomDirty(task.roomName, "taskAdd");
    return task;
}

function getTask(roomName, taskId) {
    return getRoomPlanner(roomName).tasks[taskId];
}

function getExecutorTask(executor) {
    if (!executor.memory.taskId) {
        return null;
    }

    return getTask(executor.memory.taskRoomName, executor.memory.taskId);
}

function getRoomTasks(roomName) {
    return getRoomPlanner(roomName).tasks;
}

function removeTask(roomName, taskId, options) {
    const planner = getRoomPlanner(roomName);
    const task = getTask(roomName, taskId);

    releaseTaskReservations(roomName, taskId);
    clearTaskAssignments(task, options);
    delete planner.tasks[taskId];
    planner.queueDirty = true;
    markRoomDirty(roomName, "taskRemove");
    return true;
}

function touchTask(roomName, taskId) {
    const task = getTask(roomName, taskId);
    task.updatedAt = Game.time;
    return task;
}

function setTaskStatus(roomName, taskId, status) {
    const task = getTask(roomName, taskId);

    if (task.status === status) {
        return task;
    }

    task.status = status;
    task.updatedAt = Game.time;
    return task;
}

function assignTask(executor, task) {
    task.assignedTo = executor.name;
    task.status = constants.taskStatuses.ASSIGNED;
    task.updatedAt = Game.time;
    executor.memory.taskId = task.id;
    executor.memory.taskRoomName = task.roomName;
    return task;
}

function clearExecutorAssignment(executor) {
    delete executor.memory.taskId;
    delete executor.memory.taskRoomName;
}

function clearTaskAssignments(task, options) {
    if (options && options.clearAssignments === false) {
        return;
    }

    if (task.assignedTo) {
        const creep = Game.creeps[task.assignedTo];

        if (creep) {
            clearExecutorAssignment(creep);
        }
        else {
            const spawn = Game.spawns[task.assignedTo];

            if (spawn) {
                clearExecutorAssignment(spawn);
            }
        }
    }

    task.assignedTo = null;
}

function rebuildRoomQueues(roomName) {
    const planner = getRoomPlanner(roomName);
    const queues = {};

    for (const taskId in planner.tasks) {
        const task = planner.tasks[taskId];

        if (task.status !== constants.taskStatuses.PENDING) {
            continue;
        }

        if (!queues[task.role]) {
            queues[task.role] = [];
        }

        queues[task.role].push(task.id);
    }

    for (const role in queues) {
        queues[role].sort(function (leftTaskId, rightTaskId) {
            const left = planner.tasks[leftTaskId];
            const right = planner.tasks[rightTaskId];

            if ((right.priority || 0) !== (left.priority || 0)) {
                return (right.priority || 0) - (left.priority || 0);
            }

            if ((left.createdAt || 0) !== (right.createdAt || 0)) {
                return (left.createdAt || 0) - (right.createdAt || 0);
            }

            return left.id.localeCompare(right.id);
        });
    }

    planner.queues = queues;
    planner.queueDirty = false;
}

function getPendingQueue(roomName, role) {
    const planner = getRoomPlanner(roomName);

    if (planner.queueDirty) {
        rebuildRoomQueues(roomName);
    }

    return planner.queues[role] || [];
}

function countRoomTasks(roomName, predicate) {
    const planner = getRoomPlanner(roomName);
    let count = 0;

    for (const taskId in planner.tasks) {
        const task = planner.tasks[taskId];

        if (!predicate || predicate(task) !== false) {
            count += 1;
        }
    }

    return count;
}

function listRoomTasks(roomName, predicate) {
    const planner = getRoomPlanner(roomName);
    const tasks = [];

    for (const taskId in planner.tasks) {
        const task = planner.tasks[taskId];

        if (!predicate || predicate(task) !== false) {
            tasks.push(task);
        }
    }

    return tasks;
}

function replaceTaskReservations(roomName, taskId, reservations) {
    releaseTaskReservations(roomName, taskId);

    if (reservations.length === 0) {
        return;
    }

    const planner = getRoomPlanner(roomName);
    planner.reservations.entriesByTaskId[taskId] = [];

    for (const reservation of reservations) {
        addReservation(roomName, taskId, reservation);
    }
}

function addReservation(roomName, taskId, reservation) {
    const planner = getRoomPlanner(roomName);
    const bucketName = reservation.direction === "incoming"
        ? "incoming"
        : "outgoing";
    const bucket = planner.reservations[bucketName];
    const resourceType = reservation.resourceType || RESOURCE_ENERGY;
    const amount = Math.max(0, reservation.amount || 0);

    planner.reservations.entriesByTaskId[taskId].push({
        amount: amount,
        direction: bucketName,
        expiresAt: reservation.expiresAt || (Game.time + constants.reservations.DEFAULT_TTL),
        objectId: reservation.objectId,
        resourceType: resourceType,
        roomName: roomName,
        taskId: taskId,
    });

    if (!bucket[reservation.objectId]) {
        bucket[reservation.objectId] = {};
    }

    bucket[reservation.objectId][resourceType] =
        (bucket[reservation.objectId][resourceType] || 0) + amount;
}

function releaseTaskReservations(roomName, taskId) {
    const planner = getRoomPlanner(roomName);
    const entries = planner.reservations.entriesByTaskId[taskId];

    if (!entries) {
        return;
    }

    for (const entry of entries) {
        const bucket = entry.direction === "incoming"
            ? planner.reservations.incoming
            : planner.reservations.outgoing;
        const nextAmount = Math.max(0, bucket[entry.objectId][entry.resourceType] - entry.amount);

        if (nextAmount > 0) {
            bucket[entry.objectId][entry.resourceType] = nextAmount;
        }
        else {
            delete bucket[entry.objectId][entry.resourceType];

            if (Object.keys(bucket[entry.objectId]).length === 0) {
                delete bucket[entry.objectId];
            }
        }
    }

    delete planner.reservations.entriesByTaskId[taskId];
}

function getReservedAmount(roomName, direction, objectId, resourceType) {
    const planner = getRoomPlanner(roomName);
    const bucket = direction === "incoming"
        ? planner.reservations.incoming
        : planner.reservations.outgoing;

    if (!bucket[objectId]) {
        return 0;
    }

    return bucket[objectId][resourceType || RESOURCE_ENERGY] || 0;
}

function cleanupExpiredReservations(roomName) {
    const planner = getRoomPlanner(roomName);

    for (const taskId in planner.reservations.entriesByTaskId) {
        const entries = planner.reservations.entriesByTaskId[taskId];
        const hasExpired = entries.some(function (entry) {
            return entry.expiresAt <= Game.time;
        });

        if (hasExpired) {
            releaseTaskReservations(roomName, taskId);
        }
    }
}

function cleanupExpiredTasks(roomName) {
    const planner = getRoomPlanner(roomName);
    const expiredTaskIds = [];

    for (const taskId in planner.tasks) {
        const task = planner.tasks[taskId];

        if (task.expiresAt && task.expiresAt <= Game.time) {
            expiredTaskIds.push(taskId);
        }
    }

    for (const taskId of expiredTaskIds) {
        removeTask(roomName, taskId, {
            clearAssignments: true,
        });
    }
}

function upsertGlobalIntent(intent) {
    const expansion = getExpansionMemory();
    expansion.globalIntents[intent.id] = Object.assign(
        {},
        expansion.globalIntents[intent.id] || {},
        intent,
        {
            updatedAt: Game.time,
        }
    );
    expansion.dirty = true;
    return expansion.globalIntents[intent.id];
}

function removeGlobalIntent(intentId) {
    const expansion = getExpansionMemory();
    delete expansion.globalIntents[intentId];
    expansion.dirty = true;
    return true;
}

function getGlobalIntents() {
    return getExpansionMemory().globalIntents;
}

function markExpansionDirty() {
    getExpansionMemory().dirty = true;
}

module.exports = {
    addTask,
    assignTask,
    cleanupExpiredReservations,
    cleanupExpiredTasks,
    clearExecutorAssignment,
    clearRoomDirty,
    countRoomTasks,
    getExecutorTask,
    getExpansionMemory,
    getGlobalIntents,
    getIntents,
    getPendingQueue,
    getReservedAmount,
    getRoomPlanner,
    getRoomTasks,
    getTask,
    isRoomDirty,
    listRoomTasks,
    markExpansionDirty,
    markRoomDirty,
    nextLocalTaskId,
    nextTaskId,
    rebuildRoomQueues,
    releaseTaskReservations,
    removeGlobalIntent,
    removeIntent,
    removeTask,
    replaceTaskReservations,
    setTaskStatus,
    touchTask,
    upsertGlobalIntent,
    upsertIntent,
};
