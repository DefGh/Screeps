const constants = require("./constants");

function get(roleName) {
    return roles[roleName];
}

function buildUniversalBody(spawn) {
    const body = [];
    const cycle = [MOVE, CARRY, WORK];
    
    var totalUniversals = 0;

    for (var creepName in Memory.creeps) {
        var creep = Memory.creeps[creepName]
        if (creep.role === constants.roles.UNIVERSAL) {
            totalUniversals ++;
            break;
        }
    }
    
    var budget = totalUniversals > 0 ? spawn.room.energyCapacityAvailable : spawn.room.energyAvailable;

    budget = Math.max(budget, 200)

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
};

module.exports = {
    get,
};
