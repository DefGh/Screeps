const constants = require("./constants");

let taskVersion = 0;

function getAllTasks() {
    return Memory.tasks;
}

function getTask(taskId) {
    if (typeof taskId !== "string") {
        return null;
    }

    const tasks = getAllTasks();
    return tasks[taskId] || null;
}

function addTask(task, options) {
    if (!validateTaskForStorage(task, "add")) {
        return null;
    }

    const tasks = getAllTasks();
    tasks[task.id] = task;
    finalizeTaskMutation(task, options);
    return task;
}

function updateTask(task, options) {
    if (!validateTaskForStorage(task, "update")) {
        return null;
    }

    const tasks = getAllTasks();
    tasks[task.id] = task;
    finalizeTaskMutation(task, options);
    return task;
}

function touchTask(task, options) {
    if (!task || typeof task.id !== "string") {
        return null;
    }

    if (options && options.validate !== false && !validateTaskForStorage(task, "touch")) {
        return null;
    }

    finalizeTaskMutation(task, options);
    return task;
}

function removeTask(taskId, options) {
    const task = getTask(taskId);

    if (!task) {
        return false;
    }

    delete Memory.tasks[taskId];

    if (options && options.clearAssignments) {
        clearTaskAssignments([taskId]);
    }

    finalizeTaskMutation(task, options);
    return true;
}

function removeTasks(taskIds, options) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return 0;
    }

    const removedTaskIds = [];
    let shouldInvalidateResourcePlans = false;

    for (const taskId of taskIds) {
        const task = getTask(taskId);

        if (!task) {
            continue;
        }

        delete Memory.tasks[taskId];
        removedTaskIds.push(taskId);

        if (shouldTaskMutationInvalidateResourcePlans(task, options)) {
            shouldInvalidateResourcePlans = true;
        }
    }

    if (removedTaskIds.length === 0) {
        return 0;
    }

    if (options && options.clearAssignments) {
        clearTaskAssignments(removedTaskIds);
    }

    if (shouldInvalidateResourcePlans) {
        invalidateResourcePlanCache();
    }
    else {
        bumpTaskVersion();
    }

    return removedTaskIds.length;
}

function assignTask(executor, task) {
    if (!executor || !executor.memory || !task || typeof task.id !== "string") {
        return null;
    }

    task.status = constants.taskStatuses.IN_PROGRESS;
    executor.memory.taskId = task.id;
    delete executor.memory.waitUntil;
    bumpTaskVersion();
    return task;
}

function requeueTask(taskId, options) {
    const task = getTask(taskId);

    if (!task) {
        return null;
    }

    task.status = constants.taskStatuses.PENDING;

    if (options && options.executor) {
        clearTaskAssignment(options.executor);
    }

    if (options && options.clearAssignments) {
        clearTaskAssignments([taskId]);
    }

    bumpTaskVersion();
    return task;
}

function setTaskStatus(taskId, status) {
    const task = getTask(taskId);

    if (!task || typeof status !== "string" || task.status === status) {
        return task;
    }

    task.status = status;
    bumpTaskVersion();
    return task;
}

function clearTaskAssignment(executor) {
    if (executor && executor.memory && executor.memory.taskId) {
        delete executor.memory.taskId;
    }
}

function clearTaskAssignments(taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return;
    }

    const removedTaskIds = {};

    for (const taskId of taskIds) {
        removedTaskIds[taskId] = true;
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (creep.memory && removedTaskIds[creep.memory.taskId]) {
            delete creep.memory.taskId;
        }
    }

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn.memory && removedTaskIds[spawn.memory.taskId]) {
            delete spawn.memory.taskId;
        }
    }
}

function nextTaskId(type) {
    Memory.taskSequence += 1;
    return `${type}:${Memory.taskSequence}`;
}

function nextSpawnTaskId(role) {
    Memory.taskSequence += 1;
    return `spawn:${role}:${Memory.taskSequence}`;
}

function getTaskVersion() {
    return taskVersion;
}

function bumpTaskVersion() {
    taskVersion += 1;
    return taskVersion;
}

function finalizeTaskMutation(task, options) {
    if (shouldTaskMutationInvalidateResourcePlans(task, options)) {
        invalidateResourcePlanCache();
    }
    else {
        bumpTaskVersion();
    }
}

function shouldTaskMutationInvalidateResourcePlans(task, options) {
    if (options && typeof options.invalidateResourcePlans === "boolean") {
        return options.invalidateResourcePlans;
    }

    return isResourceReservationTask(task);
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

function validateTaskForStorage(task, action) {
    const taskHandlers = require("./task.handlers");

    if (taskHandlers.validateTask(task)) {
        return true;
    }

    const taskId = task && typeof task.id === "string" ? task.id : "unknown";
    const taskType = task && typeof task.type === "string" ? task.type : "unknown";
    console.log(`invalid task rejected on ${action}: ${taskId} (${taskType})`);
    return false;
}

function invalidateResourcePlanCache() {
    const resourceManager = require("./resource.manager");
    resourceManager.invalidateResourcePlanCache();
}

module.exports = {
    addTask,
    assignTask,
    bumpTaskVersion,
    clearTaskAssignment,
    clearTaskAssignments,
    getAllTasks,
    getTask,
    getTaskVersion,
    nextSpawnTaskId,
    nextTaskId,
    removeTask,
    removeTasks,
    requeueTask,
    setTaskStatus,
    touchTask,
    updateTask,
};
