const FORTIFICATION_REPAIR_CAP = 100000;
const TOWER_REPAIR_CAP_RATIO = 0.15;
const CREEP_REPAIR_START_RATIO = 0.7;

function selectTowerRepairTarget(executor, structures) {
    return selectRepairTarget(
        executor,
        structures,
        isTowerRepairCandidate,
        getTowerRepairTargetMaxHits
    );
}

function selectCreepRepairTarget(executor, structures) {
    return selectRepairTarget(
        executor,
        structures,
        isCreepRepairStartCandidate,
        getCreepRepairTargetMaxHits
    );
}

function isTowerRepairCandidate(structure) {
    return isRepairCandidate(structure, getTowerRepairTargetMaxHits);
}

function isCreepRepairCandidate(structure) {
    return isRepairCandidate(structure, getCreepRepairTargetMaxHits);
}

function isCreepRepairStartCandidate(structure) {
    if (!isCreepRepairCandidate(structure)) {
        return false;
    }

    const targetMaxHits = getCreepRepairTargetMaxHits(structure);

    if (targetMaxHits <= 0) {
        return false;
    }

    return (structure.hits / targetMaxHits) < CREEP_REPAIR_START_RATIO;
}

function getTowerRepairTargetMaxHits(structure) {
    if (!structure) {
        return 0;
    }

    return Math.min(
        structure.hitsMax,
        FORTIFICATION_REPAIR_CAP * TOWER_REPAIR_CAP_RATIO
    );
}

function getCreepRepairTargetMaxHits(structure) {
    if (!structure) {
        return 0;
    }

    if (
        structure.structureType === STRUCTURE_WALL ||
        structure.structureType === STRUCTURE_RAMPART
    ) {
        return Math.min(structure.hitsMax, FORTIFICATION_REPAIR_CAP);
    }

    return structure.hitsMax;
}

function getTowerRemainingRepairEnergyNeed(structure) {
    return getRemainingRepairEnergyNeed(structure, getTowerRepairTargetMaxHits);
}

function getCreepRemainingRepairEnergyNeed(structure) {
    return getRemainingRepairEnergyNeed(structure, getCreepRepairTargetMaxHits);
}

function selectRepairTarget(executor, structures, isCandidate, getTargetMaxHits) {
    if (!executor || !executor.pos || !structures || structures.length === 0) {
        return null;
    }

    const targets = structures.filter(function (structure) {
        return isCandidate(structure);
    });

    if (targets.length === 0) {
        return null;
    }

    targets.sort(function (left, right) {
        const percentDelta =
            getMissingHpPercent(right, getTargetMaxHits) -
            getMissingHpPercent(left, getTargetMaxHits);

        if (Math.abs(percentDelta) > 0.000001) {
            return percentDelta;
        }

        return compareByRangeAndPosition(executor, left, right);
    });

    return targets[0];
}

function isRepairCandidate(structure, getTargetMaxHits) {
    if (!structure) {
        return false;
    }

    if (structure.owner && !structure.my) {
        return false;
    }

    const targetMaxHits = getTargetMaxHits(structure);

    return targetMaxHits > 0 && structure.hits < targetMaxHits;
}

function getMissingHpPercent(structure, getTargetMaxHits) {
    const targetMaxHits = getTargetMaxHits(structure);

    if (targetMaxHits <= 0) {
        return -1;
    }

    return (targetMaxHits - structure.hits) / targetMaxHits;
}

function getRemainingRepairEnergyNeed(structure, getTargetMaxHits) {
    const targetMaxHits = getTargetMaxHits(structure);

    if (!structure || targetMaxHits <= 0 || structure.hits >= targetMaxHits) {
        return 0;
    }

    return targetMaxHits - structure.hits;
}

function compareByRangeAndPosition(executor, left, right) {
    const rangeDelta =
        executor.pos.getRangeTo(left) - executor.pos.getRangeTo(right);

    if (rangeDelta !== 0) {
        return rangeDelta;
    }

    if (left.pos.x !== right.pos.x) {
        return left.pos.x - right.pos.x;
    }

    if (left.pos.y !== right.pos.y) {
        return left.pos.y - right.pos.y;
    }

    return getTargetIdentity(left).localeCompare(getTargetIdentity(right));
}

function getTargetIdentity(target) {
    return target.id || target.name || "";
}

module.exports = {
    CREEP_REPAIR_START_RATIO,
    FORTIFICATION_REPAIR_CAP,
    getCreepRemainingRepairEnergyNeed,
    getCreepRepairTargetMaxHits,
    getTowerRemainingRepairEnergyNeed,
    getTowerRepairTargetMaxHits,
    isCreepRepairCandidate,
    isCreepRepairStartCandidate,
    isTowerRepairCandidate,
    selectCreepRepairTarget,
    selectTowerRepairTarget,
};
