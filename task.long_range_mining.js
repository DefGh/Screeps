const constants = require("./constants");
const longRangeMining = require("./long_range_mining");
const repairTargets = require("./repair.targets");
const resourceManager = require("./resource.manager");

function onCompleted() {
}

function tryDispatch(task, executor, ctx) {
    if (task.type !== constants.taskTypes.LONG_RANGE_MINING) {
        return [];
    }

    if (ctx.executorType === "room") {
        return tryDispatchRoom(task, executor);
    }

    if (
        ctx.executorType === "creep" &&
        executor.memory
    ) {
        if (executor.memory.role === constants.roles.OUTPOST_SCOUT) {
            return tryDispatchScout(task, executor);
        }

        if (executor.memory.role === constants.roles.UNIVERSAL) {
            return tryDispatchRemoteRepair(task, executor, ctx);
        }
    }

    return [];
}

function tryDispatchRoom(task, room) {
    if (
        room.name !== task.room ||
        !room.controller ||
        !room.controller.my
    ) {
        return [];
    }

    const storage = longRangeMining.getOwnedStorage(room);
    const plan = task.data.storagePlan;

    if (
        storage ||
        !plan ||
        !longRangeMining.hasStorageCapability(room) ||
        longRangeMining.getStorageSite(room, plan) ||
        hasPendingStoragePlacement(task, plan)
    ) {
        return [];
    }

    if (Object.keys(Game.constructionSites || {}).length >= MAX_CONSTRUCTION_SITES) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: room.name,
                structureType: STRUCTURE_STORAGE,
                x: plan.x,
                y: plan.y,
            },
        },
    ];
}

function tryDispatchScout(task, creep) {
    if (creep.memory.originRoomName !== task.room) {
        return [];
    }

    const target = longRangeMining.pickNextScoutRoom(task);

    if (!target || !target.roomName) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.SCOUT_OUTPOST_ROOM,
            data: {
                roomName: target.roomName,
            },
        },
    ];
}

function tryDispatchRemoteRepair(task, creep, ctx) {
    if (creep.memory.originRoomName !== task.room) {
        return [];
    }

    if (hasActiveRemoteRepairWork(task)) {
        return [];
    }

    const target = getRepairFocusTarget(task, creep, ctx);

    if (!target) {
        return [];
    }

    const remainingAmount = repairTargets.getCreepRemainingRepairEnergyNeed(target);

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

function hasActiveRemoteRepairWork(task) {
    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.status !== "done" &&
            (
                action.type === constants.actionTypes.REPAIR ||
                action.type === constants.actionTypes.TAKE_RESOURCE ||
                action.type === constants.actionTypes.PICKUP_RESOURCE ||
                action.type === constants.actionTypes.MINE
            )
        ) {
            return true;
        }
    }

    return false;
}

function getRepairFocusTarget(task, creep, ctx) {
    const focusTarget = getLiveRepairFocusTarget(task);

    if (focusTarget) {
        return focusTarget;
    }

    const nextTarget = pickNextRepairTarget(task.room, ctx);

    if (!nextTarget) {
        delete task.data.repairFocusTargetId;
        return null;
    }

    task.data.repairFocusTargetId = nextTarget.id;
    return nextTarget;
}

function getLiveRepairFocusTarget(task) {
    if (!task.data || !task.data.repairFocusTargetId) {
        return null;
    }

    const target = Game.getObjectById(task.data.repairFocusTargetId);

    if (isRemoteRepairCandidate(target)) {
        return target;
    }

    delete task.data.repairFocusTargetId;
    return null;
}

function pickNextRepairTarget(roomName, ctx) {
    const targets = getRemoteRepairTargets(roomName, ctx);

    if (targets.length === 0) {
        return null;
    }

    targets.sort(function (left, right) {
        const remainingDelta =
            repairTargets.getCreepRemainingRepairEnergyNeed(right) -
            repairTargets.getCreepRemainingRepairEnergyNeed(left);

        if (remainingDelta !== 0) {
            return remainingDelta;
        }

        if (left.pos.roomName !== right.pos.roomName) {
            return left.pos.roomName.localeCompare(right.pos.roomName);
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

function getRemoteRepairTargets(roomName, ctx) {
    const targets = [];

    for (const task of ctx.listTasks(roomName)) {
        if (
            !longRangeMining.isRemoteMiningTask(task) ||
            !task.data ||
            !task.data.anchor
        ) {
            continue;
        }

        const container = longRangeMining.getRemoteContainer(task.data.anchor);

        if (isRemoteRepairCandidate(container)) {
            targets.push(container);
        }
    }

    return targets;
}

function isRemoteRepairCandidate(structure) {
    return !!(
        structure &&
        structure.structureType === STRUCTURE_CONTAINER &&
        repairTargets.isCreepRepairCandidate(structure)
    );
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

function hasPendingStoragePlacement(task, plan) {
    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.PLACE_CONSTRUCTION_SITE &&
            action.status !== "done" &&
            action.data.roomName === plan.roomName &&
            action.data.structureType === STRUCTURE_STORAGE &&
            action.data.x === plan.x &&
            action.data.y === plan.y
        ) {
            return true;
        }
    }

    return false;
}

module.exports = {
    onCompleted,
    tryDispatch,
};
