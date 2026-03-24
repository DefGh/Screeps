const constants = require("./constants");
const taskStore = require("./task.store");

function addTask(task) {
    return taskStore.addTask(task);
}

function nextTaskId(type) {
    return taskStore.nextTaskId(type);
}

function nextSpawnTaskId(role) {
    return taskStore.nextSpawnTaskId(role);
}

function resolveObject(objectId) {
    return objectId ? Game.getObjectById(objectId) : null;
}

function getTaskResourceType(task) {
    return typeof task.data.resourceType === "string"
        ? task.data.resourceType
        : RESOURCE_ENERGY;
}

function shouldWaitForSource(sourceType) {
    return sourceType === constants.transferEnergySourceTypes.SOURCE;
}

function switchTaskStage(task, stage, nextRemainingAmount) {
    task.data.stage = stage;
    task.data.collectRemainingAmount = 0;

    if (typeof nextRemainingAmount === "number") {
        task.data.remainingAmount = nextRemainingAmount;
    }

    require("./resource.manager").invalidateResourcePlanCache();
}

function canExecuteTaskInRoom(executor, ownerRoomName, methods) {
    if (
        !executor ||
        !executor.memory ||
        typeof ownerRoomName !== "string" ||
        executor.memory.originRoomName !== ownerRoomName
    ) {
        return false;
    }

    for (const methodName of methods) {
        if (typeof executor[methodName] !== "function") {
            return false;
        }
    }

    return true;
}

function getTaskOwnerRoom(task, validate, key) {
    return validate(task) ? task.data[key] : null;
}

function hasTaskData(task, taskType) {
    return Boolean(
        task &&
        task.type === taskType &&
        task.data &&
        typeof task.data === "object"
    );
}

function hasTaskDataFields(task, taskType, fieldTypes) {
    if (!hasTaskData(task, taskType)) {
        return false;
    }

    for (const fieldName in fieldTypes) {
        if (typeof task.data[fieldName] !== fieldTypes[fieldName]) {
            return false;
        }
    }

    return true;
}

module.exports = {
    addTask,
    canExecuteTaskInRoom,
    getTaskOwnerRoom,
    getTaskResourceType,
    hasTaskData,
    hasTaskDataFields,
    nextSpawnTaskId,
    nextTaskId,
    resolveObject,
    shouldWaitForSource,
    switchTaskStage,
};
