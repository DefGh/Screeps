const constants = require("./constants");

function isFillEnergyTask(task) {
    return !!(task && task.type === constants.taskTypes.FILL_ENERGY);
}

function ensureTaskData(task) {
    if (!task.data) {
        task.data = {};
    }

    if (!Array.isArray(task.data.targets)) {
        task.data.targets = [];
    }

    if (!Number.isFinite(task.data.total)) {
        task.data.total = 0;
    }

    return task.data.targets;
}

function getRoomTargets(room) {
    const spawns = [];
    const extensions = [];

    for (const structure of room.find(FIND_MY_STRUCTURES)) {
        if (structure.structureType === STRUCTURE_SPAWN) {
            spawns.push(structure);
        }
        else if (structure.structureType === STRUCTURE_EXTENSION) {
            extensions.push(structure);
        }
    }

    return spawns.concat(extensions);
}

function createTargetEntry(target) {
    return {
        targetId: target.id,
        kind: getTargetKind(target),
        total: getTargetFreeCapacity(target),
        doneAmount: 0,
        assignedAmount: 0,
    };
}

function syncTask(task, room) {
    if (!isFillEnergyTask(task)) {
        return false;
    }

    ensureTaskData(task);
    normalizeTask(task);

    const previousTargets = task.data.targets.slice();
    const existingById = {};

    for (const target of previousTargets) {
        existingById[target.targetId] = target;
    }

    const nextTargets = [];
    const seen = {};

    for (const structure of getRoomTargets(room)) {
        const targetId = structure.id;
        const currentFreeCapacity = getTargetFreeCapacity(structure);
        const target = existingById[targetId] || createTargetEntry(structure);

        seen[targetId] = true;
        normalizeTarget(target);
        target.kind = getTargetKind(structure);

        if (target.assignedAmount <= 0) {
            target.total = target.doneAmount + currentFreeCapacity;
        }
        else {
            target.total = Math.max(
                getAmount(target.total),
                target.doneAmount + target.assignedAmount
            );
        }

        if (shouldKeepTarget(target, currentFreeCapacity)) {
            nextTargets.push(target);
        }
    }

    for (const target of previousTargets) {
        if (seen[target.targetId]) {
            continue;
        }

        normalizeTarget(target);

        if (target.assignedAmount > 0 || target.doneAmount > 0) {
            target.total = Math.max(
                getAmount(target.total),
                target.doneAmount + target.assignedAmount
            );
            nextTargets.push(target);
        }
    }

    task.data.targets = nextTargets;
    return recomputeTask(task);
}

function normalizeTask(task) {
    if (!isFillEnergyTask(task)) {
        return false;
    }

    ensureTaskData(task);

    const previousAssignedPercent = getPercentValue(task.assignedPercent);
    const previousDonePercent = getPercentValue(task.donePercent);
    const previousTotal = getAmount(task.data.total);

    const targetsById = {};

    for (const target of task.data.targets) {
        normalizeTarget(target);
        target.assignedAmount = 0;
        targetsById[target.targetId] = target;
    }

    for (const actionId of task.actionIds || []) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            !action ||
            action.taskId !== task.id ||
            action.status === "done" ||
            action.type !== constants.actionTypes.TRANSFER_ENERGY
        ) {
            continue;
        }

        const targetId = action.data && action.data.targetId;

        if (!targetId) {
            continue;
        }

        const amount = getAmount(action.data.amount);

        if (amount <= 0) {
            continue;
        }

        const target = targetsById[targetId] || createDetachedTarget(targetId);

        target.assignedAmount += amount;
        targetsById[targetId] = target;
    }

    task.data.targets = Object.values(targetsById);

    for (const target of task.data.targets) {
        refreshTargetTotal(target);
    }

    recomputeTask(task);

    return (
        previousAssignedPercent !== task.assignedPercent ||
        previousDonePercent !== task.donePercent ||
        previousTotal !== getAmount(task.data.total)
    );
}

function applyDispatchedActions(task, actions) {
    if (!isFillEnergyTask(task) || !actions || actions.length === 0) {
        return false;
    }

    ensureTaskData(task);

    for (const action of actions) {
        if (
            !action ||
            action.type !== constants.actionTypes.TRANSFER_ENERGY ||
            !action.data ||
            !action.data.targetId
        ) {
            continue;
        }

        const amount = getAmount(action.data.amount);

        if (amount <= 0) {
            continue;
        }

        const target = getOrCreateTarget(task, action.data.targetId);

        target.assignedAmount += amount;
        target.total = Math.max(
            getAmount(target.total),
            target.doneAmount + target.assignedAmount
        );
    }

    return recomputeTask(task);
}

function settleTransferAction(task, action) {
    if (!isFillEnergyTask(task) || !action || !action.data || !action.data.targetId) {
        return false;
    }

    ensureTaskData(task);

    const target = getOrCreateTarget(task, action.data.targetId);
    const amount = getAmount(action.data.amount);
    const doneAmount = Math.min(amount, getAmount(action.data.done));

    target.doneAmount += doneAmount;
    target.assignedAmount = Math.max(0, target.assignedAmount - amount);

    refreshTargetTotal(target);
    return recomputeTask(task);
}

function getRemainingAmount(target) {
    if (!target) {
        return 0;
    }

    return Math.max(
        0,
        getAmount(target.total) -
        getAmount(target.doneAmount) -
        getAmount(target.assignedAmount)
    );
}

function hasOutstandingDemand(task) {
    if (!isFillEnergyTask(task)) {
        return false;
    }

    for (const target of ensureTaskData(task)) {
        if (getRemainingAmount(target) > 0) {
            return true;
        }
    }

    return false;
}

function recomputeTask(task) {
    ensureTaskData(task);

    let total = 0;
    let done = 0;
    let assigned = 0;
    const nextTargets = [];

    for (const target of task.data.targets) {
        normalizeTarget(target);
        target.total = Math.max(
            getAmount(target.total),
            target.doneAmount + target.assignedAmount
        );

        if (target.total <= 0) {
            continue;
        }

        nextTargets.push(target);
        total += target.total;
        done += Math.min(target.doneAmount, target.total);
        assigned += target.assignedAmount;
    }

    task.data.targets = nextTargets;
    task.data.total = total;

    if (total <= 0) {
        task.donePercent = 100;
        task.assignedPercent = 100;
        return true;
    }

    task.donePercent = clampPercent((done / total) * 100);
    task.assignedPercent = clampPercent(((done + assigned) / total) * 100);
    return true;
}

function getOrCreateTarget(task, targetId) {
    for (const target of ensureTaskData(task)) {
        if (target.targetId === targetId) {
            normalizeTarget(target);
            return target;
        }
    }

    const target = createDetachedTarget(targetId);

    task.data.targets.push(target);
    return target;
}

function refreshTargetTotal(target) {
    normalizeTarget(target);

    const liveTarget = Game.getObjectById(target.targetId);
    const liveFreeCapacity = getTargetFreeCapacity(liveTarget);

    if (liveFreeCapacity !== null && target.assignedAmount <= 0) {
        target.total = target.doneAmount + liveFreeCapacity;
    }
    else {
        target.total = Math.max(
            getAmount(target.total),
            target.doneAmount + target.assignedAmount
        );
    }
}

function createDetachedTarget(targetId) {
    const liveTarget = Game.getObjectById(targetId);

    return {
        targetId: targetId,
        kind: getTargetKind(liveTarget) || "extension",
        total: 0,
        doneAmount: 0,
        assignedAmount: 0,
    };
}

function shouldKeepTarget(target, currentFreeCapacity) {
    return (
        target.assignedAmount > 0 ||
        target.doneAmount > 0 ||
        currentFreeCapacity > 0
    );
}

function normalizeTarget(target) {
    target.total = getAmount(target.total);
    target.doneAmount = getAmount(target.doneAmount);
    target.assignedAmount = getAmount(target.assignedAmount);
}

function getTargetKind(target) {
    if (!target) {
        return null;
    }

    if (target.structureType === STRUCTURE_SPAWN) {
        return "spawn";
    }

    if (target.structureType === STRUCTURE_EXTENSION) {
        return "extension";
    }

    return null;
}

function getTargetFreeCapacity(target) {
    if (
        !target ||
        !target.store ||
        typeof target.store.getFreeCapacity !== "function"
    ) {
        return null;
    }

    return Math.max(0, target.store.getFreeCapacity(RESOURCE_ENERGY));
}

function getAmount(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, getPercentValue(value)));
}

function getPercentValue(value) {
    return Number.isFinite(value) ? value : 0;
}

module.exports = {
    applyDispatchedActions,
    getRemainingAmount,
    getRoomTargets,
    hasOutstandingDemand,
    isFillEnergyTask,
    normalizeTask,
    settleTransferAction,
    syncTask,
};
