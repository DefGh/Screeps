const constants = require("./constants");
const roomScope = require("./room.scope");

function bootstrapMemory() {
    if (!Memory.creeps || typeof Memory.creeps !== "object") {
        Memory.creeps = {};
    }

    if (!Memory.sources || typeof Memory.sources !== "object") {
        Memory.sources = {};
    }

    if (!Memory.spawns || typeof Memory.spawns !== "object") {
        Memory.spawns = {};
    }

    if (!Memory.tasks || typeof Memory.tasks !== "object") {
        Memory.tasks = {};
    }

    if (typeof Memory.taskSequence !== "number") {
        Memory.taskSequence = 0;
    }

    if (!Memory.colony || typeof Memory.colony !== "object") {
        Memory.colony = {};
    }

    if (typeof Memory.colony.targetUniversals !== "number") {
        Memory.colony.targetUniversals = constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    Memory.colony.targetUniversals = normalizeTargetUniversals(Memory.colony.targetUniversals);

    if (!Memory.colony.targetUniversalsByRoom || typeof Memory.colony.targetUniversalsByRoom !== "object") {
        Memory.colony.targetUniversalsByRoom = {};
    }

    if (
        !Memory.colony.universalTargetingByRoom ||
        typeof Memory.colony.universalTargetingByRoom !== "object"
    ) {
        Memory.colony.universalTargetingByRoom = {};
    }

    initializePerRoomUniversalMemory();

    if (!Memory.expansion || typeof Memory.expansion !== "object") {
        Memory.expansion = {};
    }

    if (!Memory.expansion.roomIntel || typeof Memory.expansion.roomIntel !== "object") {
        Memory.expansion.roomIntel = {};
    }

    if (!Memory.expansion.branchIntel || typeof Memory.expansion.branchIntel !== "object") {
        Memory.expansion.branchIntel = {};
    }

    if (!Object.prototype.hasOwnProperty.call(Memory.expansion, "activeBranch")) {
        Memory.expansion.activeBranch = null;
    }

    if (!Object.prototype.hasOwnProperty.call(Memory.expansion, "activeCandidate")) {
        Memory.expansion.activeCandidate = null;
    }

    if (!Memory.construction || typeof Memory.construction !== "object") {
        Memory.construction = {};
    }

    if (!Memory.construction.rooms || typeof Memory.construction.rooms !== "object") {
        Memory.construction.rooms = {};
    }
}

function initializePerRoomUniversalMemory() {
    const defaultTargetUniversals = normalizeTargetUniversals(Memory.colony.targetUniversals);

    for (const roomName of roomScope.getOperationalRoomNames()) {
        if (typeof Memory.colony.targetUniversalsByRoom[roomName] !== "number") {
            Memory.colony.targetUniversalsByRoom[roomName] = defaultTargetUniversals;
        }
        else {
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

function normalizeTargetUniversals(value) {
    if (typeof value !== "number") {
        return constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    return Math.max(constants.colony.MIN_TARGET_UNIVERSALS, value);
}

module.exports = {
    bootstrapMemory,
};
