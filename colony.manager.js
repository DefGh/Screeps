const constants = require("./constants");
const resourceManager = require("./resource.manager");

function refreshColonyTargets() {
    if (!Memory.colony || !Memory.colony.universalTargeting) {
        return;
    }

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
        Memory.colony.targetUniversals -= 1;   
            console.log(
            `target universals decreased to ${Memory.colony.targetUniversals} ` +
            `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
        );
    }
    else if (currentResourceAmount > targetingMemory.lastResourceAmount) {
        Memory.colony.targetUniversals += 1;
        console.log(
            `target universals increased to ${Memory.colony.targetUniversals} ` +
            `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
        );
    }
    else if (
        currentResourceAmount < targetingMemory.lastResourceAmount &&
        currentResourceAmount < constants.colony.LOW_RESOURCE_THRESHOLD
    ) {
        Memory.colony.targetUniversals = Math.max(
            constants.colony.MIN_TARGET_UNIVERSALS,
            Memory.colony.targetUniversals - 1
        );
        console.log(
            `target universals decreased to ${Memory.colony.targetUniversals} ` +
            `(resources ${targetingMemory.lastResourceAmount} -> ${currentResourceAmount})`
        );
    }

    targetingMemory.lastResourceAmount = currentResourceAmount;
    targetingMemory.lastSampleTick = Game.time;
}

function getColonyResourceAmount() {
    let amount = 0;
    const seenRooms = {};

    for (const roomName of getManagedRoomNames()) {
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

function getManagedRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.room) {
            roomNames[spawn.room.name] = true;
        }
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.my) {
            roomNames[roomName] = true;
        }
    }

    return Object.keys(roomNames);
}

module.exports = {
    refreshColonyTargets,
};
