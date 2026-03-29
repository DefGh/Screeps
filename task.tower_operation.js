const constants = require("./constants");
const repairTargets = require("./repair.targets");

function onCompleted() {
}

function tryDispatch(task, tower, ctx) {
    if (
        task.type !== constants.taskTypes.TOWER_OPERATION ||
        ctx.executorType !== "tower" ||
        tower.room.name !== task.room ||
        task.data.towerId !== tower.id
    ) {
        return [];
    }

    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) {
        return [];
    }

    const hostileCreep = selectNearestTarget(
        tower,
        tower.room.find(FIND_HOSTILE_CREEPS)
    );

    if (hostileCreep) {
        return [createAction(constants.actionTypes.TOWER_ATTACK, hostileCreep.id)];
    }

    const hostileStructure = selectNearestTarget(
        tower,
        tower.room.find(FIND_HOSTILE_STRUCTURES)
    );

    if (hostileStructure) {
        return [createAction(constants.actionTypes.TOWER_ATTACK, hostileStructure.id)];
    }

    const repairTarget = selectRepairTarget(
        tower,
        tower.room.find(FIND_STRUCTURES)
    );

    if (repairTarget) {
        return [createAction(constants.actionTypes.TOWER_REPAIR, repairTarget.id)];
    }

    const healTarget = selectNearestTarget(
        tower,
        tower.room.find(FIND_MY_CREEPS).filter(function (creep) {
            return creep.hits < creep.hitsMax;
        })
    );

    if (healTarget) {
        return [createAction(constants.actionTypes.TOWER_HEAL, healTarget.id)];
    }

    return [];
}

function createAction(type, targetId) {
    return {
        type: type,
        data: {
            targetId: targetId,
        },
    };
}

function selectNearestTarget(tower, targets) {
    if (!targets || targets.length === 0) {
        return null;
    }

    targets.sort(function (left, right) {
        return compareByRangeAndPosition(tower, left, right);
    });

    return targets[0];
}

function selectRepairTarget(tower, structures) {
    return repairTargets.selectTowerRepairTarget(tower, structures);
}

function compareByRangeAndPosition(tower, left, right) {
    const rangeDelta =
        tower.pos.getRangeTo(left) - tower.pos.getRangeTo(right);

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
    onCompleted,
    tryDispatch,
};
