const constants = require("./constants");

function bootstrapMemory() {
    if (!Memory.creeps) {
        Memory.creeps = {};
    }

    if (!Memory.sources) {
        Memory.sources = {};
    }

    if (!Memory.spawns) {
        Memory.spawns = {};
    }

    if (!Memory.tasks) {
        Memory.tasks = {};
    }

    if (!Memory.colony) {
        Memory.colony = {};
    }

    if (!Memory.expansion || typeof Memory.expansion !== "object") {
        Memory.expansion = {};
    }

    if (!Memory.construction || typeof Memory.construction !== "object") {
        Memory.construction = {};
    }

    if (!Memory.construction.rooms || typeof Memory.construction.rooms !== "object") {
        Memory.construction.rooms = {};
    }

    if (typeof Memory.colony.targetUniversals !== "number") {
        Memory.colony.targetUniversals = constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    Memory.colony.targetUniversals = Math.max(
        constants.colony.MIN_TARGET_UNIVERSALS,
        Memory.colony.targetUniversals
    );

    if (!Memory.colony.universalTargeting || typeof Memory.colony.universalTargeting !== "object") {
        Memory.colony.universalTargeting = {};
    }

    if (!Memory.expansion.roomIntel || typeof Memory.expansion.roomIntel !== "object") {
        Memory.expansion.roomIntel = {};
    }

    if (!Memory.expansion.branchIntel || typeof Memory.expansion.branchIntel !== "object") {
        Memory.expansion.branchIntel = {};
    }

    if (!Memory.expansion.activeBranch || typeof Memory.expansion.activeBranch !== "object") {
        Memory.expansion.activeBranch = null;
    }

    if (!Memory.expansion.activeCandidate || typeof Memory.expansion.activeCandidate !== "object") {
        Memory.expansion.activeCandidate = null;
    }

    if (typeof Memory.taskSequence !== "number") {
        Memory.taskSequence = 0;
    }
}

module.exports = {
    bootstrapMemory,
};
