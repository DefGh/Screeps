module.exports = {
    roles: {
        SPAWNER: "spawner",
        MINER: "miner",
        UNIVERSAL: "universal",
    },

    taskTypes: {
        MINE: "mine",
        SPAWN_CREEP: "spawnCreep",
        TAXI: "taxi",
        TRANSFER_ENERGY: "transferEnergy",
    },

    taskStatuses: {
        PENDING: "pending",
        IN_PROGRESS: "inProgress",
    },

    dispatcher: {
        WAIT_TICKS_ON_EMPTY_QUEUE: 50,
    },

    colony: {
        DEFAULT_TARGET_UNIVERSALS: 3,
        LOW_RESOURCE_THRESHOLD: 3000,
        MIN_TARGET_UNIVERSALS: 1,
        TARGET_UNIVERSALS_RECALC_INTERVAL: 1500,
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
