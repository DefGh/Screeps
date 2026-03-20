module.exports = {
    roles: {
        SPAWNER: "spawner",
        UNIVERSAL: "universal",
    },

    taskTypes: {
        SPAWN_CREEP: "spawnCreep",
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
