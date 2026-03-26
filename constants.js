module.exports = {
    roles: {
        SPAWNER: "spawner",
        ATTACKER: "attacker",
        MINER: "miner",
        SCOUT: "scout",
        CLAIMER: "claimer",
        UNIVERSAL: "universal",
    },

    taskTypes: {
        BOOTSTRAP_SPAWN: "bootstrapSpawn",
        BUILD: "build",
        CLAIM_ROOM: "claimRoom",
        DEFEND_ROOM: "defendRoom",
        MINE: "mine",
        SCOUT_ROOM: "scoutRoom",
        SPAWN_CREEP: "spawnCreep",
        TRANSFER_ENERGY: "transferEnergy",
    },

    taskIcons: {
        bootstrapSpawn: "B",
        build: "W",
        claimRoom: "C",
        defendRoom: "D",
        mine: "M",
        scoutRoom: "S",
        spawnCreep: "P",
        transferEnergy: "E",
        default: ".",
    },

    taskStatuses: {
        PENDING: "pending",
        ASSIGNED: "assigned",
        IN_PROGRESS: "inProgress",
    },

    intentStatuses: {
        ACTIVE: "active",
        BLOCKED: "blocked",
        COMPLETED: "completed",
    },

    priorities: {
        DEFENSE: 100,
        SPAWN: 90,
        BOOTSTRAP: 85,
        MINE: 80,
        TRANSFER_URGENT: 75,
        BUILD: 70,
        CLAIM: 65,
        SCOUT: 55,
        UPGRADE: 40,
    },

    colony: {
        DEFAULT_TARGET_UNIVERSALS: 3,
        LOW_RESOURCE_THRESHOLD: 3000,
        MAX_TARGET_UNIVERSALS: 6,
        MIN_TARGET_UNIVERSALS: 1,
        RESOURCE_GROWTH_STEP: 500,
    },

    attackers: {
        MAX_PER_ROOM: 1,
    },

    reservations: {
        DEFAULT_TTL: 75,
    },

    sources: {
        HOSTILE_DANGER_RANGE: 10,
        MINER_POS_REFRESH_INTERVAL: 1500,
    },

    sweepIntervals: {
        EXPANSION: 300,
        HOSTILE_PROBE: 25,
        ROOM: 150,
        STATIC_REFRESH: 1500,
        UNIVERSAL_ADJUST: 300,
    },

    bootstrap: {
        ANCHOR_MAX_COORD: 45,
        ANCHOR_MIN_COORD: 4,
        MIN_OPEN_NEIGHBORS: 6,
    },

    expansion: {
        INTEL_TTL: 3000,
        SEARCH_DEPTH: 6,
    },

    alarms: {
        HOSTILE_TTL: 25,
    },

    transferStages: {
        COLLECT: "collect",
        DELIVER: "deliver",
    },

    buildStages: {
        BUILD: "build",
        COLLECT: "collect",
    },
};
