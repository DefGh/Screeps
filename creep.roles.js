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

function getCycleCost(cycle) {
    let total = 0;

    for (const part of cycle) {
        total += getBodyPartCost(part);
    }

    return total;
}

function buildRepeatingBody(spawn, cycle, minimumCost) {
    const body = [];
    const budget = Math.max(minimumCost || 0, spawn.room.energyCapacityAvailable);
    const cycleCost = getCycleCost(cycle);
    let spent = 0;

    while (body.length + cycle.length <= MAX_CREEP_SIZE) {
        if (spent + cycleCost > budget) {
            break;
        }

        for (const part of cycle) {
            body.push(part);
        }

        spent += cycleCost;
    }

    return body;
}

function buildMinerBody(spawn, action) {
    const body = [];
    const isRemoteMiner = !!(
        action &&
        action.data &&
        action.data.memory &&
        action.data.memory.anchor &&
        action.data.memory.anchor.roomName &&
        action.data.memory.anchor.roomName !== spawn.room.name
    );
    const moveParts = isRemoteMiner ? 2 : 0;
    const reservedBudget = moveParts * getBodyPartCost(MOVE);
    const workBudget = Math.max(0, spawn.room.energyCapacityAvailable - reservedBudget);
    const maxParts = Math.min(
        5,
        Math.floor(workBudget / getBodyPartCost(WORK))
    );

    for (let index = 0; index < maxParts && body.length < MAX_CREEP_SIZE; index += 1) {
        body.push(WORK);
    }

    for (let index = 0; index < moveParts && body.length < MAX_CREEP_SIZE; index += 1) {
        body.push(MOVE);
    }

    return body;
}

function buildScoutBody() {
    return [MOVE];
}

function buildHaulerBody(spawn) {
    const body = [];
    const cycle = [MOVE, CARRY];
    let spent = 0;
    let index = 0;
    const budget = Math.max(100, spawn.room.energyCapacityAvailable);

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

function buildAttackerBody(spawn) {
    return buildRepeatingBody(
        spawn,
        [MOVE, ATTACK],
        BODYPART_COST[MOVE] + BODYPART_COST[ATTACK]
    );
}

function buildHealerBody(spawn) {
    return buildRepeatingBody(
        spawn,
        [MOVE, HEAL],
        BODYPART_COST[MOVE] + BODYPART_COST[HEAL]
    );
}

function buildDismantlerBody(spawn) {
    return buildRepeatingBody(
        spawn,
        [MOVE, WORK],
        BODYPART_COST[MOVE] + BODYPART_COST[WORK]
    );
}

function buildLiberatorBody(spawn) {
    return buildRepeatingBody(
        spawn,
        [MOVE, CLAIM],
        BODYPART_COST[MOVE] + BODYPART_COST[CLAIM]
    );
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
    [constants.roles.OUTPOST_SCOUT]: {
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
    [constants.roles.HAULER]: {
        buildBody: buildHaulerBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.ATTACKER]: {
        buildBody: buildAttackerBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.HEALER]: {
        buildBody: buildHealerBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.DISMANTLER]: {
        buildBody: buildDismantlerBody,
        buildMemory: function () {
            return {};
        },
    },
    [constants.roles.LIBERATOR]: {
        buildBody: buildLiberatorBody,
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
