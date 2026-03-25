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

function buildStandardUniversalBody(room) {
    return buildUniversalBody(room, false);
}

function buildAvailableUniversalBody(room) {
    return buildUniversalBody(room, true);
}

function getUniversalGenerationForRoom(roomName) {
    return getUniversalGenerationForBody(
        buildStandardUniversalBody(resolveOwnedRoom(roomName))
    );
}

function getUniversalGenerationForBody(body) {
    return Array.isArray(body) ? body.length : 0;
}

function getUniversalGenerationForCreep(creep) {
    if (!creep) {
        return 0;
    }

    if (
        creep.memory &&
        typeof creep.memory.universalGeneration === "number"
    ) {
        return creep.memory.universalGeneration;
    }

    return Array.isArray(creep.body) ? creep.body.length : 0;
}

function resolveOwnedRoom(roomName) {
    if (typeof roomName !== "string") {
        return null;
    }

    if (Game.rooms && Game.rooms[roomName]) {
        return Game.rooms[roomName];
    }

    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];

        if (spawn && spawn.room && spawn.room.name === roomName) {
            return spawn.room;
        }
    }

    return null;
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

function buildUniversalBody(room, useAvailableEnergy) {
    const partSet = getUniversalPartSet();
    const minimumCost = getBodyCost(partSet);
    const capacity = getRoomEnergyBudget(room, useAvailableEnergy);

    if (capacity < minimumCost) {
        return partSet.slice();
    }

    const body = [];
    let remainingEnergy = capacity;

    while (body.length < getMaxCreepSize()) {
        const nextPart = partSet[body.length % partSet.length];
        const nextPartCost = getBodyPartCost(nextPart);

        if (remainingEnergy < nextPartCost) {
            break;
        }

        body.push(nextPart);
        remainingEnergy -= nextPartCost;
    }

    return body.length > 0 ? body : partSet.slice();
}

function getUniversalPartSet() {
    return [
        typeof MOVE === "string" ? MOVE : "move",
        typeof WORK === "string" ? WORK : "work",
        typeof CARRY === "string" ? CARRY : "carry",
    ];
}

function getRoomEnergyBudget(room, useAvailableEnergy) {
    if (!room) {
        return 0;
    }

    if (useAvailableEnergy && typeof room.energyAvailable === "number") {
        return room.energyAvailable;
    }

    if (typeof room.energyCapacityAvailable === "number") {
        return room.energyCapacityAvailable;
    }

    return 0;
}

function getBodyCost(body) {
    let cost = 0;

    for (const part of body) {
        cost += getBodyPartCost(part);
    }

    return cost;
}

function getBodyPartCost(part) {
    if (
        typeof BODYPART_COST === "object" &&
        typeof BODYPART_COST[part] === "number"
    ) {
        return BODYPART_COST[part];
    }

    return 0;
}

function getMaxCreepSize() {
    return typeof MAX_CREEP_SIZE === "number" ? MAX_CREEP_SIZE : 50;
}

module.exports = {
    addTask,
    buildAvailableUniversalBody,
    buildStandardUniversalBody,
    canExecuteTaskInRoom,
    getTaskOwnerRoom,
    getTaskResourceType,
    getUniversalGenerationForBody,
    getUniversalGenerationForCreep,
    getUniversalGenerationForRoom,
    hasTaskData,
    hasTaskDataFields,
    nextSpawnTaskId,
    nextTaskId,
    resolveObject,
    shouldWaitForSource,
    switchTaskStage,
};
