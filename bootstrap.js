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

    if (!Memory.construction || typeof Memory.construction !== "object") {
        Memory.construction = {};
    }

    if (!Memory.construction.rooms || typeof Memory.construction.rooms !== "object") {
        Memory.construction.rooms = {};
    }

    if (typeof Memory.colony.targetUniversals !== "number") {
        Memory.colony.targetUniversals = constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    if (!Memory.colony.universalTargeting || typeof Memory.colony.universalTargeting !== "object") {
        Memory.colony.universalTargeting = {};
    }

    if (typeof Memory.taskSequence !== "number") {
        Memory.taskSequence = 0;
    }
}

module.exports = {
    bootstrapMemory,
};
