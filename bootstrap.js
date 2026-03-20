const constants = require("./constants");

function bootstrapMemory() {
    if (!Memory.creeps) {
        Memory.creeps = {};
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

    if (typeof Memory.colony.targetUniversals !== "number") {
        Memory.colony.targetUniversals = constants.colony.DEFAULT_TARGET_UNIVERSALS;
    }

    if (typeof Memory.taskSequence !== "number") {
        Memory.taskSequence = 0;
    }
}

module.exports = {
    bootstrapMemory,
};
