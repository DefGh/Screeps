module.exports = {
    roles: {
        SPAWNER: "spawner",
        MINER: "miner",
        SCOUT: "scout",
        CLAIMER: "claimer",
        UNIVERSAL: "universal",
    },

    taskTypes: {
        MINE: "mine",
        SPAWN_CREEP: "spawnCreep",
        BOOTSTRAP_SPAWN: "bootstrapSpawn",
        TAXI: "taxi",
        BUILD: "build",
        REPAIR: "repair",
        SCOUT_ROOM: "scoutRoom",
        CLAIM_ROOM: "claimRoom",
        TRANSFER_ENERGY: "transferEnergy",
    },

    taskStatuses: {
        PENDING: "pending",
        IN_PROGRESS: "inProgress",
    },

    dispatcher: {
        WAIT_TICKS_ON_EMPTY_QUEUE: 15,
    },

    colony: {
        DEFAULT_TARGET_UNIVERSALS: 3,
        LOW_RESOURCE_THRESHOLD: 3000,
        MIN_TARGET_UNIVERSALS: 1,
        TARGET_UNIVERSALS_RECALC_INTERVAL: 500,
    },

    expansion: {
        SEARCH_DEPTH: 6,
        INTEL_TTL: 3000,
    },

    construction: {
        DEFENSE_BORDER_OFFSET: 3,
    },

    miners: {
        MAX_WORK_PARTS: 5,
    },

    sources: {
        HOSTILE_DANGER_RANGE: 15,
        MINER_POS_REFRESH_INTERVAL: 1000,
    },

    spawnTaskStages: {
        WAITING: "waiting",
    },

    bootstrapSpawnTaskStages: {
        MOVE: "move",
        COLLECT: "collect",
        BUILD: "build",
    },

    buildTaskStages: {
        COLLECT: "collect",
        BUILD: "build",
        FINISH_REPAIR: "finishRepair",
    },

    repairTaskStages: {
        PLAN: "plan",
        COLLECT: "collect",
        REPAIR: "repair",
    },

    repairs: {
        MAX_ROOM_TASKS: 3,
        REFRESH_INTERVAL: 300,
        STRUCTURE_THRESHOLD: 0.8,
        WALL_HITS_CAP: 50000,
    },

    transferEnergyTaskStages: {
        COLLECT: "collect",
        DELIVER: "deliver",
    },

    transferEnergySourceTypes: {
        SOURCE: "source",
        PILE: "pile",
        CONTAINER: "container",
    },

    transferEnergyTargetTypes: {
        CONTAINER: "container",
        SPAWN: "spawn",
        EXTENSION: "extension",
        CONTROLLER: "controller",
        CONSTRUCTION_SITE: "constructionSite",
    },
};
