const constants = require("./constants");
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

    if (countActiveBuildActions(task) >= 2) {
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

function countActiveBuildActions(task) {
    let count = 0;

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.BUILD &&
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
    const sites = room.find(FIND_CONSTRUCTION_SITES);

    if (sites.length === 0) {
        return null;
    }

    let bestPriority = Infinity;
    const targets = [];

    for (const site of sites) {
        if (!isConstructionSite(site)) {
            continue;
        }

        const priority = getBuildPriority(site.structureType);

        if (priority < bestPriority) {
            bestPriority = priority;
            targets.length = 0;
            targets.push(site);
            continue;
        }

        if (priority === bestPriority) {
            targets.push(site);
        }
    }

    const primarySpawn = getPrimarySpawn(room);

    targets.sort(function (left, right) {
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

    return targets[0];
}

function getBuildPriority(structureType) {
    switch (structureType) {
    case STRUCTURE_CONTAINER:
        return 0;
    case STRUCTURE_TOWER:
        return 1;
    case STRUCTURE_EXTENSION:
        return 2;
    case STRUCTURE_RAMPART:
        return 3;
    case STRUCTURE_WALL:
        return 4;
    default:
        return 5;
    }
}

function getRemainingEnergyNeed(target) {
    return Math.ceil((target.progressTotal - target.progress) / BUILD_POWER);
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

module.exports = {
    onCompleted,
    tryDispatch,
};
