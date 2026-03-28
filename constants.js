module.exports = {
    eventTypes: {
        GAME_START: "GAME_START",
        RCL_CHANGE: "RCL_CHANGE",
        GCL_CHANGE: "GCL_CHANGE",
        CREEP_DIED: "CREEP_DIED",
        HOSTILE_CREEP_APPEARED: "HOSTILE_CREEP_APPEARED",
    },

    taskTypes: {
        SPAWN_CREEP: "spawn_creep",
        CHECKER: "checker",
        MINING_OPERATION: "mining_operation",
        SYNC_EXTENSIONS: "sync_extensions",
        SYNC_TOWERS: "sync_towers",
        SYNC_FORTIFICATIONS: "sync_fortifications",
        UPGRADE_CONTROLLER: "upgrade_controller",
        FILL_SPAWN: "fill_spawn",
        FILL_EXTENSION: "fill_extension",
        FILL_TOWER: "fill_tower",
        BUILD: "build",
        REPAIR: "repair",
    },

    actionTypes: {
        SPAWN_CREEP: "spawn_creep",
        MINE: "mine",
        PICKUP_RESOURCE: "pickup_resource",
        TAKE_RESOURCE: "take_resource",
        BUILD: "build",
        TAXI: "taxi",
        PLACE_CONSTRUCTION_SITE: "place_construction_site",
        TRANSFER_ENERGY: "transfer_energy",
        UPGRADE_CONTROLLER: "upgrade_controller",
        CHECK_UNIVERSALS: "check_universals",
        CHECK_FILL_SPAWN: "check_fill_spawn",
        CHECK_FILL_EXTENSION: "check_fill_extension",
        CHECK_FILL_TOWER: "check_fill_tower",
        RECALCULATE_UNIVERSALS_COUNT: "recalculate_universals_count",
        SYNC_MINING_OPERATIONS: "sync_mining_operations",
        SYNC_ROOM_BUILDER: "sync_room_builder",
    },

    roles: {
        UNIVERSAL: "universal",
        MINER: "miner",
    },

    eventScopes: {
        GLOBAL: "global",
        ROOM: "room",
    },
};
