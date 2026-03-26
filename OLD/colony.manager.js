const constants = require("./constants");
const reactivity = require("./reactivity.manager");
const roomCensus = require("./room.census");
const roomScope = require("./room.scope");
const resourceManager = require("./resource.manager");

function refreshColonyTargets() {
    for (const roomName of roomScope.getOperationalRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room) {
            continue;
        }

        if (!reactivity.shouldProcessRoom(roomName, reactivity.domains.ECONOMY, constants.reactivity.ROOM_SWEEP_INTERVAL)) {
            continue;
        }

        refreshRoomTargetUniversals(roomName, room);
        reactivity.markRoomProcessed(roomName, reactivity.domains.ECONOMY, constants.reactivity.ROOM_SWEEP_INTERVAL);
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

    if (nextTargetUniversals !== previousTargetUniversals) {
        reactivity.markRoomDirty(roomName, reactivity.domains.SPAWN_DEMAND);
        reactivity.markRoomDirty(roomName, reactivity.domains.ECONOMY);
    }

    targetingMemory.lastResourceAmount = currentResourceAmount;
    targetingMemory.lastSampleTick = Game.time;
}

function getUniversalTargetingMemoryForRoom(roomName) {
    if (
        !Memory.colony.universalTargetingByRoom[roomName] ||
        typeof Memory.colony.universalTargetingByRoom[roomName] !== "object"
    ) {
        Memory.colony.universalTargetingByRoom[roomName] = {};
    }

    return Memory.colony.universalTargetingByRoom[roomName];
}

function getTargetUniversalsForRoom(roomName) {
    const defaultTarget = normalizeTargetUniversals(constants.colony.DEFAULT_TARGET_UNIVERSALS);

    if (typeof roomName !== "string") {
        return defaultTarget;
    }

    if (typeof Memory.colony.targetUniversalsByRoom[roomName] !== "number") {
        Memory.colony.targetUniversalsByRoom[roomName] = defaultTarget;
        return defaultTarget;
    }

    const normalizedTarget = normalizeTargetUniversals(Memory.colony.targetUniversalsByRoom[roomName]);
    Memory.colony.targetUniversalsByRoom[roomName] = normalizedTarget;
    return normalizedTarget;
}

function getRoomResourceAmount(room) {
    return roomCensus.getRoomResourceAmount(room);
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
