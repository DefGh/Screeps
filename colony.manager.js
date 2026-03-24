const constants = require("./constants");
const roomScope = require("./room.scope");
const resourceManager = require("./resource.manager");

function refreshColonyTargets() {
    if (
        !Memory.colony ||
        !Memory.colony.targetUniversalsByRoom ||
        !Memory.colony.universalTargetingByRoom
    ) {
        return;
    }

    for (const roomName of roomScope.getOperationalRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room) {
            continue;
        }

        refreshRoomTargetUniversals(roomName, room);
    }
}

function refreshRoomTargetUniversals(roomName, room) {
    const targetingMemory = getUniversalTargetingMemoryForRoom(roomName);
    const previousTargetUniversals = getTargetUniversalsForRoom(roomName);

    if (
        typeof targetingMemory.lastResourceAmount !== "number" ||
        typeof targetingMemory.lastSampleTick !== "number"
    ) {
        targetingMemory.lastResourceAmount = getRoomResourceAmount(room);
        targetingMemory.lastSampleTick = Game.time;
        Memory.colony.targetUniversalsByRoom[roomName] = previousTargetUniversals;
        return;
    }

    if (Game.time - targetingMemory.lastSampleTick < constants.colony.TARGET_UNIVERSALS_RECALC_INTERVAL) {
        return;
    }

    const currentResourceAmount = getRoomResourceAmount(room);
    let nextTargetUniversals = previousTargetUniversals;

    if (currentResourceAmount < constants.colony.LOW_RESOURCE_THRESHOLD) {
        nextTargetUniversals = normalizeTargetUniversals(previousTargetUniversals - 1);
    }
    else if (currentResourceAmount > targetingMemory.lastResourceAmount) {
        nextTargetUniversals = normalizeTargetUniversals(previousTargetUniversals + 1);
    }
    else if (
        currentResourceAmount < targetingMemory.lastResourceAmount &&
        currentResourceAmount < constants.colony.LOW_RESOURCE_THRESHOLD
    ) {
        nextTargetUniversals = normalizeTargetUniversals(previousTargetUniversals - 1);
    }

    Memory.colony.targetUniversalsByRoom[roomName] = nextTargetUniversals;

    if (nextTargetUniversals < previousTargetUniversals) {
        console.log(
            `[${roomName}] target universals decreased to ${nextTargetUniversals} ` +
            `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
        );
    }
    else if (nextTargetUniversals > previousTargetUniversals) {
        console.log(
            `[${roomName}] target universals increased to ${nextTargetUniversals} ` +
            `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
        );
    }

    targetingMemory.lastResourceAmount = currentResourceAmount;
    targetingMemory.lastSampleTick = Game.time;
}

function getUniversalTargetingMemoryForRoom(roomName) {
    if (!Memory.colony.universalTargetingByRoom || typeof Memory.colony.universalTargetingByRoom !== "object") {
        Memory.colony.universalTargetingByRoom = {};
    }

    if (
        !Memory.colony.universalTargetingByRoom[roomName] ||
        typeof Memory.colony.universalTargetingByRoom[roomName] !== "object"
    ) {
        Memory.colony.universalTargetingByRoom[roomName] = {};
    }

    return Memory.colony.universalTargetingByRoom[roomName];
}

function getTargetUniversalsForRoom(roomName) {
    const legacyTarget = normalizeTargetUniversals(
        Memory && Memory.colony ? Memory.colony.targetUniversals : undefined
    );

    if (
        !Memory ||
        !Memory.colony ||
        !Memory.colony.targetUniversalsByRoom ||
        typeof roomName !== "string"
    ) {
        return legacyTarget;
    }

    if (typeof Memory.colony.targetUniversalsByRoom[roomName] !== "number") {
        Memory.colony.targetUniversalsByRoom[roomName] = legacyTarget;
        return legacyTarget;
    }

    const normalizedTarget = normalizeTargetUniversals(Memory.colony.targetUniversalsByRoom[roomName]);
    Memory.colony.targetUniversalsByRoom[roomName] = normalizedTarget;
    return normalizedTarget;
}

function getRoomResourceAmount(room) {
    let amount = 0;

    for (const structure of room.find(FIND_STRUCTURES, {
        filter: function (candidate) {
            return !candidate.owner || candidate.my;
        },
    })) {
        amount += resourceManager.getUsedEnergy(structure);
    }

    for (const pile of room.find(FIND_DROPPED_RESOURCES, {
        filter: function (resource) {
            return resource.resourceType === RESOURCE_ENERGY;
        },
    })) {
        amount += pile.amount;
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (!creep.my || !creep.room || creep.room.name !== room.name) {
            continue;
        }

        amount += resourceManager.getUsedEnergy(creep);
    }

    return amount;
}

function normalizeTargetUniversals(value) {
    if (typeof value !== "number") {
        return constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    return Math.max(constants.colony.MIN_TARGET_UNIVERSALS, value);
}

module.exports = {
    getTargetUniversalsForRoom,
    refreshColonyTargets,
};
