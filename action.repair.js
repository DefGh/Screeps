const repairTargets = require("./repair.targets");
const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const targetAmount = action.data.amount || 0;
    const doneAmount = action.data.done || 0;
    const target = Game.getObjectById(action.data.targetId);

    if (targetAmount <= 0 || doneAmount >= targetAmount) {
        return true;
    }

    if (!target || !repairTargets.isRepairCandidate(target)) {
        action.data.done = targetAmount;
        return true;
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy <= 0) {
        return true;
    }

    const repairNeedBefore = repairTargets.getRemainingRepairEnergyNeed(target);

    if (repairNeedBefore <= 0) {
        action.data.done = targetAmount;
        return true;
    }

    const result = creep.repair(target);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    if (isTerminalRepairResult(result)) {
        return true;
    }

    if (result !== OK) {
        return false;
    }

    const remainingAmount = targetAmount - doneAmount;
    const spentAmount = Math.min(
        remainingAmount,
        currentEnergy,
        repairNeedBefore,
        getRepairPower(creep)
    );

    action.data.done = doneAmount + spentAmount;

    if (!repairTargets.isRepairCandidate(target)) {
        action.data.done = targetAmount;
    }

    return (
        action.data.done >= targetAmount ||
        creep.store.getUsedCapacity(RESOURCE_ENERGY) <= 0
    );
}

function onCompleted() {
}

function onCreepDeath() {
}

function isTerminalRepairResult(result) {
    return (
        result === ERR_INVALID_TARGET ||
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_NO_BODYPART ||
        result === ERR_NOT_OWNER
    );
}

function getRepairPower(creep) {
    return Math.max(1, creep.getActiveBodyparts(WORK));
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
