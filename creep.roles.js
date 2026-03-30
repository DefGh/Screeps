const constants = require("./constants");

function get(roleName) {
    return roles[roleName];
}

function buildUniversalBodyForBudget(budget) {
    const body = [];
    const cycle = [MOVE, CARRY, WORK];
    let spent = 0;
    let index = 0;

    while (body.length < MAX_CREEP_SIZE) {
        const part = cycle[index % cycle.length];
        const partCost = getBodyPartCost(part);

        if (spent + partCost > budget) {
            break;
        }

        body.push(part);
        spent += partCost;
        index += 1;
    }

    return body;
}

function buildUniversalBody(spawn) {
    const roomName = spawn.room.name;
    
    var totalUniversals = 0;

    for (var creepName in Memory.creeps) {
        var creep = Memory.creeps[creepName]
        if (
            creep.role === constants.roles.UNIVERSAL &&
            creep.originRoomName === roomName
        ) {
            totalUniversals ++;
            break;
        }
    }
    
    var budget = totalUniversals > 0 ? spawn.room.energyCapacityAvailable : spawn.room.energyAvailable;

    budget = Math.max(budget, 200);

    return buildUniversalBodyForBudget(budget);
}

function getBodyPartCost(part) {
    return BODYPART_COST[part];
}

function buildMinerBody(spawn) {
    const body = [];
    const maxParts = Math.min(
        5,
        Math.floor(spawn.room.energyCapacityAvailable / getBodyPartCost(WORK))
    );

    for (let index = 0; index < maxParts && body.length < MAX_CREEP_SIZE; index += 1) {
        body.push(WORK);
    }

    return body;
}

function buildScoutBody() {
    return [MOVE];
}

function buildClaimerBody(spawn) {
    const budget = spawn.room.energyCapacityAvailable;

    if (budget < (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) {
        return [];
    }

    return [MOVE, CLAIM];
}

function buildColonizerBody(spawn) {
    return buildUniversalBody(spawn);
}

function getUniversalGenerationForRoom(room) {
    if (!room) {
        return 0;
    }

    return buildUniversalBodyForBudget(room.energyCapacityAvailable).length;
}

function getCreepGeneration(creep) {
    if (!creep) {
        return 0;
    }

    if (
        creep.memory &&
        Number.isFinite(creep.memory.generation)
    ) {
        return creep.memory.generation;
    }

    if (Array.isArray(creep.body)) {
        return creep.body.length;
    }

    return 0;
}

const roles = {
    [constants.roles.UNIVERSAL]: {
        buildBody: buildUniversalBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.MINER]: {
        buildBody: buildMinerBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.SCOUT]: {
        buildBody: buildScoutBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.CLAIMER]: {
        buildBody: buildClaimerBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.COLONIZER]: {
        buildBody: buildColonizerBody,
        buildMemory: function () {
            return {};
        },
    },
};

module.exports = {
    getCreepGeneration,
    get,
    getUniversalGenerationForRoom,
};
