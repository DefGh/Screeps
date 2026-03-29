const FORTIFICATION_REPAIR_CAP = 100000;
const FORTIFICATION_REPAIR_CAP_RATIO = 0.15;

function selectRepairTarget(executor, structures) {
    if (!executor || !executor.pos || !structures || structures.length === 0) {
        return null;
    }

    const targets = structures.filter(function (structure) {
        return isRepairCandidate(structure);
    });

    if (targets.length === 0) {
        return null;
    }

    targets.sort(function (left, right) {
        const percentDelta =
            getMissingHpPercent(right) - getMissingHpPercent(left);

        if (Math.abs(percentDelta) > 0.000001) {
            return percentDelta;
        }

        return compareByRangeAndPosition(executor, left, right);
    });

    return targets[0];
}

function isRepairCandidate(structure) {
    if (!structure) {
        return false;
    }

    if (structure.owner && !structure.my) {
        return false;
    }

    const targetMaxHits = getRepairTargetMaxHits(structure);

    return targetMaxHits > 0 && structure.hits < targetMaxHits;
}

function getRepairTargetMaxHits(structure) {
    if (!structure) {
        return 0;
    }

    if (
        structure.structureType === STRUCTURE_WALL ||
        structure.structureType === STRUCTURE_RAMPART
    ) {
        return Math.min(
            structure.hitsMax,
            FORTIFICATION_REPAIR_CAP * FORTIFICATION_REPAIR_CAP_RATIO
        );
    }

    return structure.hitsMax;
}

function getMissingHpPercent(structure) {
    const targetMaxHits = getRepairTargetMaxHits(structure);

    if (targetMaxHits <= 0) {
        return -1;
    }

    return (targetMaxHits - structure.hits) / targetMaxHits;
}

function getRemainingRepairEnergyNeed(structure) {
    const targetMaxHits = getRepairTargetMaxHits(structure);

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
    FORTIFICATION_REPAIR_CAP,
    getRemainingRepairEnergyNeed,
    getRepairTargetMaxHits,
    isRepairCandidate,
    selectRepairTarget,
};
