const constants = require("./constants");
const repairTargets = require("./repair.targets");
const resourceManager = require("./resource.manager");

function onCompleted() {
}

function tryDispatch(task, creep) {
    if (
        task.type !== constants.taskTypes.BUILD ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL
    ) {
        return [];
    }

    const room = Game.rooms[task.room];

    if (!room) {
        return [];
    }

    const repairTarget = repairTargets.selectRepairTarget(
        creep,
        room.find(FIND_STRUCTURES)
    );

    if (repairTarget) {
        return tryDispatchRepair(task, creep, repairTarget);
    }

    if (countActiveActions(task, constants.actionTypes.BUILD) >= 2) {
        return [];
    }

    const target = getFocusTarget(task, room);

    if (!target) {
        return [];
    }

    const remainingAmount = getRemainingEnergyNeed(target);

    if (remainingAmount <= 0) {
        return [];
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy > 0) {
        return [
            createBuildTemplate(target.id, Math.min(currentEnergy, remainingAmount)),
        ];
    }

    const assignedAmount = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        remainingAmount
    );
    const energyAction = resourceManager.reserve(creep, assignedAmount);

    if (!energyAction) {
        return [];
    }

    return [
        energyAction,
        createBuildTemplate(target.id, assignedAmount),
    ];
}

function tryDispatchRepair(task, creep, target) {
    if (countActiveActions(task, constants.actionTypes.REPAIR) >= 1) {
        return [];
    }

    const remainingAmount = repairTargets.getRemainingRepairEnergyNeed(target);

    if (remainingAmount <= 0) {
        return [];
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy > 0) {
        return [
            createRepairTemplate(target.id, Math.min(currentEnergy, remainingAmount)),
        ];
    }

    const assignedAmount = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        remainingAmount
    );
    const energyAction = resourceManager.reserve(creep, assignedAmount);

    if (!energyAction) {
        return [];
    }

    return [
        energyAction,
        createRepairTemplate(target.id, assignedAmount),
    ];
}

function countActiveActions(task, actionType) {
    let count = 0;

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === actionType &&
            action.status !== "done"
        ) {
            count += 1;
        }
    }

    return count;
}

function getFocusTarget(task, room) {
    const focusTarget = getLiveFocusTarget(task);

    if (focusTarget) {
        return focusTarget;
    }

    const nextTarget = pickNextFocusTarget(room);

    if (!nextTarget) {
        delete task.data.focusTargetId;
        return null;
    }

    task.data.focusTargetId = nextTarget.id;
    return nextTarget;
}

function getLiveFocusTarget(task) {
    if (!task.data.focusTargetId) {
        return null;
    }

    const target = Game.getObjectById(task.data.focusTargetId);

    if (isConstructionSite(target)) {
        return target;
    }

    delete task.data.focusTargetId;
    return null;
}

function pickNextFocusTarget(room) {
    const sites = room.find(FIND_CONSTRUCTION_SITES).filter(function (site) {
        return isConstructionSite(site);
    });

    if (sites.length === 0) {
        return null;
    }

    const primarySpawn = getPrimarySpawn(room);

    sites.sort(function (left, right) {
        if (primarySpawn) {
            const leftRange = getChebyshevRange(primarySpawn.pos, left.pos);
            const rightRange = getChebyshevRange(primarySpawn.pos, right.pos);

            if (leftRange !== rightRange) {
                return leftRange - rightRange;
            }
        }

        if (left.pos.x !== right.pos.x) {
            return left.pos.x - right.pos.x;
        }

        if (left.pos.y !== right.pos.y) {
            return left.pos.y - right.pos.y;
        }

        return String(left.id).localeCompare(String(right.id));
    });

    return sites[0];
}

function getRemainingEnergyNeed(target) {
    return target.progressTotal - target.progress;
}

function getPrimarySpawn(room) {
    const spawns = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    });

    if (spawns.length === 0) {
        return null;
    }

    spawns.sort(function (left, right) {
        return left.name.localeCompare(right.name);
    });

    return spawns[0];
}

function getChebyshevRange(left, right) {
    return Math.max(
        Math.abs(left.x - right.x),
        Math.abs(left.y - right.y)
    );
}

function isConstructionSite(target) {
    return !!target && target.progress !== undefined && target.progressTotal !== undefined;
}

function createBuildTemplate(targetId, amount) {
    return {
        type: constants.actionTypes.BUILD,
        data: {
            amount: amount,
            done: 0,
            targetId: targetId,
        },
    };
}

function createRepairTemplate(targetId, amount) {
    return {
        type: constants.actionTypes.REPAIR,
        data: {
            amount: amount,
            done: 0,
            targetId: targetId,
        },
    };
}

module.exports = {
    onCompleted,
    tryDispatch,
};
