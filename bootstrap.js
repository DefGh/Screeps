const constants = require("./constants");
const roomScope = require("./room.scope");

const SCHEMA_VERSION = 2;

function bootstrapMemory() {
    if (!Memory.creeps) {
        Memory.creeps = {};
    }

    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    if (!Memory.spawns) {
        Memory.spawns = {};
    }

    if (!Memory.taskSequence) {
        Memory.taskSequence = 0;
    }

    const shouldReset = Memory.runtimeSchemaVersion !== SCHEMA_VERSION;

    if (shouldReset || !Memory.empire) {
        Memory.empire = {};
    }

    if (shouldReset || !Memory.empire.expansion) {
        Memory.empire.expansion = createExpansionState();
    }

    for (const roomName of buildManagedRoomNames()) {
        if (!Memory.rooms[roomName]) {
            Memory.rooms[roomName] = {};
        }

        if (shouldReset || !Memory.rooms[roomName].planner) {
            Memory.rooms[roomName].planner = createPlannerState();
        }
    }

    Memory.runtimeSchemaVersion = SCHEMA_VERSION;
}

function buildManagedRoomNames() {
    const roomNames = {};

    for (const roomName of roomScope.getOperationalRoomNames()) {
        roomNames[roomName] = true;
    }

    for (const roomName in Memory.rooms) {
        roomNames[roomName] = true;
    }

    for (const name in Memory.creeps) {
        const creepMemory = Memory.creeps[name];

        if (creepMemory.originRoomName) {
            roomNames[creepMemory.originRoomName] = true;
        }

        if (creepMemory.taskRoomName) {
            roomNames[creepMemory.taskRoomName] = true;
        }
    }

    return Object.keys(roomNames).sort();
}

function createPlannerState() {
    return {
        dirty: {},
        intents: {},
        lastReconcileTick: 0,
        needsReconcile: true,
        queueDirty: true,
        queues: {},
        reservations: {
            entriesByTaskId: {},
            incoming: {},
            outgoing: {},
        },
        snapshot: {
            constructionSiteCount: 0,
            controllerLevel: null,
            hostileAlarmUntil: 0,
            hostileCount: 0,
            lastDirtyTick: 0,
            lastEventTick: 0,
            lastHostileProbeTick: 0,
            lastSweepTick: 0,
            spawnCount: 0,
            visible: false,
        },
        static: {
            controllerId: null,
            exits: [],
            lastRefreshTick: 0,
            sources: [],
        },
        stats: {
            lastReservationFailureTick: 0,
            lastResourceAmount: 0,
            lastUniversalAdjustTick: 0,
            targetUniversals: constants.colony.DEFAULT_TARGET_UNIVERSALS,
        },
        taskSequence: 0,
        tasks: {},
    };
}

function createExpansionState() {
    return {
        activeCandidate: null,
        activeScout: null,
        bootstrapRequests: {},
        dirty: true,
        globalIntents: {},
        lastGclLevel: Game.gcl.level,
        nextSweepTick: Game.time + constants.sweepIntervals.EXPANSION,
        roomIntel: {},
    };
}

module.exports = {
    bootstrapMemory,
};
