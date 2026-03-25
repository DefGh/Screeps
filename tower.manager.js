const constants = require("./constants");
const constructionManager = require("./construction.manager");
const resourceManager = require("./resource.manager");
const roomScope = require("./room.scope");

const PEACE_REPAIR_MIN_ENERGY_RATIO =
    constants.towers &&
    typeof constants.towers.PEACE_REPAIR_MIN_ENERGY_RATIO === "number"
        ? constants.towers.PEACE_REPAIR_MIN_ENERGY_RATIO
        : 0.75;

function runTowers() {
    for (const roomName of roomScope.getOwnedRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room || !room.controller || !room.controller.my) {
            continue;
        }

        for (const tower of getRoomTowers(room)) {
            runTower(tower);
        }
    }
}

function runTower(tower) {
    if (!tower || typeof tower.attack !== "function") {
        return;
    }

    if (resourceManager.getUsedEnergy(tower) <= 0) {
        return;
    }

    const hostile = findClosestHostile(tower);

    if (hostile) {
        tower.attack(hostile);
        return;
    }

    const injuredFriendly = findBestHealTarget(tower);

    if (injuredFriendly) {
        tower.heal(injuredFriendly);
        return;
    }

    if (!canTowerPeaceRepair(tower)) {
        return;
    }

    const repairTarget = findBestRepairTarget(tower);

    if (repairTarget) {
        tower.repair(repairTarget);
    }
}

function getRoomTowers(room) {
    return room.find(FIND_MY_STRUCTURES, {
        filter: function (structure) {
            return structure.structureType === STRUCTURE_TOWER;
        },
    });
}

function findClosestHostile(tower) {
    const hostiles = tower.room.find(FIND_HOSTILE_CREEPS);

    if (hostiles.length === 0) {
        return null;
    }

    if (tower.pos && typeof tower.pos.findClosestByRange === "function") {
        return tower.pos.findClosestByRange(hostiles);
    }

    hostiles.sort(function (left, right) {
        const rangeOrder = getRangeToTarget(tower, left) - getRangeToTarget(tower, right);

        if (rangeOrder !== 0) {
            return rangeOrder;
        }

        return compareIds(left.id, right.id);
    });

    return hostiles[0];
}

function findBestHealTarget(tower) {
    const injured = [];

    for (const creep of tower.room.find(FIND_MY_CREEPS)) {
        if (
            typeof creep.hits !== "number" ||
            typeof creep.hitsMax !== "number" ||
            creep.hits >= creep.hitsMax
        ) {
            continue;
        }

        injured.push(creep);
    }

    if (injured.length === 0) {
        return null;
    }

    injured.sort(function (left, right) {
        const missingHitsOrder = getMissingHits(right) - getMissingHits(left);

        if (missingHitsOrder !== 0) {
            return missingHitsOrder;
        }

        const rangeOrder = getRangeToTarget(tower, left) - getRangeToTarget(tower, right);

        if (rangeOrder !== 0) {
            return rangeOrder;
        }

        return compareIds(left.id, right.id);
    });

    return injured[0];
}

function canTowerPeaceRepair(tower) {
    const energyCapacity = resourceManager.getEnergyCapacity(tower);

    if (energyCapacity <= 0) {
        return false;
    }

    return resourceManager.getUsedEnergy(tower) / energyCapacity > PEACE_REPAIR_MIN_ENERGY_RATIO;
}

function findBestRepairTarget(tower) {
    const candidates = [];

    for (const structure of tower.room.find(FIND_STRUCTURES)) {
        if (!isTowerRepairCandidate(structure)) {
            continue;
        }

        const repairGoal = constructionManager.getRepairGoalForStructure(structure);

        if (
            typeof repairGoal !== "number" ||
            repairGoal <= 0 ||
            typeof structure.hits !== "number" ||
            structure.hits >= repairGoal
        ) {
            continue;
        }

        candidates.push({
            structure: structure,
            repairGoal: repairGoal,
        });
    }

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort(function (left, right) {
        const deficitOrder =
            getRepairDeficitRatio(right.structure, right.repairGoal) -
            getRepairDeficitRatio(left.structure, left.repairGoal);

        if (deficitOrder !== 0) {
            return deficitOrder;
        }

        const rangeOrder =
            getRangeToTarget(tower, left.structure) - getRangeToTarget(tower, right.structure);

        if (rangeOrder !== 0) {
            return rangeOrder;
        }

        return compareIds(left.structure.id, right.structure.id);
    });

    return candidates[0].structure;
}

function isTowerRepairCandidate(structure) {
    if (
        !structure ||
        typeof structure.hits !== "number" ||
        typeof structure.hitsMax !== "number" ||
        structure.hitsMax <= 0
    ) {
        return false;
    }

    return !(structure.owner && !structure.my);
}

function getRepairDeficitRatio(structure, repairGoal) {
    if (
        !structure ||
        typeof structure.hits !== "number" ||
        typeof repairGoal !== "number" ||
        repairGoal <= 0
    ) {
        return -Infinity;
    }

    return 1 - Math.max(0, Math.min(1, structure.hits / repairGoal));
}

function getMissingHits(target) {
    if (
        !target ||
        typeof target.hits !== "number" ||
        typeof target.hitsMax !== "number"
    ) {
        return 0;
    }

    return Math.max(0, target.hitsMax - target.hits);
}

function getRangeToTarget(origin, target) {
    if (
        !origin ||
        !origin.pos ||
        !target ||
        !target.pos ||
        typeof origin.pos.getRangeTo !== "function"
    ) {
        return Infinity;
    }

    return origin.pos.getRangeTo(target);
}

function compareIds(leftId, rightId) {
    if (leftId === rightId) {
        return 0;
    }

    if (typeof leftId !== "string") {
        return 1;
    }

    if (typeof rightId !== "string") {
        return -1;
    }

    return leftId < rightId ? -1 : 1;
}

module.exports = {
    runTowers,
};
