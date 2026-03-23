const constants = require("./constants");
const roomScope = require("./room.scope");
const resourceManager = require("./resource.manager");

function refreshColonyTargets() {
    if (!Memory.colony || !Memory.colony.universalTargeting) {
        return;
    }

    Memory.colony.targetUniversals = normalizeTargetUniversals(Memory.colony.targetUniversals);

    const targetingMemory = Memory.colony.universalTargeting;

    if (
        typeof targetingMemory.lastResourceAmount !== "number" ||
        typeof targetingMemory.lastSampleTick !== "number"
    ) {
        targetingMemory.lastResourceAmount = getColonyResourceAmount();
        targetingMemory.lastSampleTick = Game.time;
        return;
    }

    if (Game.time - targetingMemory.lastSampleTick < constants.colony.TARGET_UNIVERSALS_RECALC_INTERVAL) {
        return;
    }

    const currentResourceAmount = getColonyResourceAmount();

    if (currentResourceAmount < constants.colony.LOW_RESOURCE_THRESHOLD)
    {
        const previousTargetUniversals = Memory.colony.targetUniversals;
        Memory.colony.targetUniversals = normalizeTargetUniversals(
            Memory.colony.targetUniversals - 1
        );
        if (Memory.colony.targetUniversals < previousTargetUniversals) {
            console.log(
                `target universals decreased to ${Memory.colony.targetUniversals} ` +
                `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
            );
        }
    }
    else if (currentResourceAmount > targetingMemory.lastResourceAmount) {
        Memory.colony.targetUniversals = normalizeTargetUniversals(
            Memory.colony.targetUniversals + 1
        );
        console.log(
            `target universals increased to ${Memory.colony.targetUniversals} ` +
            `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
        );
    }
    else if (
        currentResourceAmount < targetingMemory.lastResourceAmount &&
        currentResourceAmount < constants.colony.LOW_RESOURCE_THRESHOLD
    ) {
        const previousTargetUniversals = Memory.colony.targetUniversals;
        Memory.colony.targetUniversals = normalizeTargetUniversals(
            Memory.colony.targetUniversals - 1
        );
        if (Memory.colony.targetUniversals < previousTargetUniversals) {
            console.log(
                `target universals decreased to ${Memory.colony.targetUniversals} ` +
                `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
            );
        }
    }

    targetingMemory.lastResourceAmount = currentResourceAmount;
    targetingMemory.lastSampleTick = Game.time;
}

function getColonyResourceAmount() {
    let amount = 0;
    const seenRooms = {};

    for (const roomName of roomScope.getOperationalRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room || seenRooms[roomName]) {
            continue;
        }

        seenRooms[roomName] = true;
        amount += getRoomResourceAmount(room);
    }

    return amount;
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
    refreshColonyTargets,
};
