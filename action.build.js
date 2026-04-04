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

    if (!target || !isConstructionSite(target)) {
        if (
            action.data.roomName &&
            !Game.rooms[action.data.roomName]
        ) {
            const targetX = Number.isFinite(action.data.x) ? action.data.x : 25;
            const targetY = Number.isFinite(action.data.y) ? action.data.y : 25;

            creep.moveTo(new RoomPosition(
                targetX,
                targetY,
                action.data.roomName
            ));
            return false;
        }

        action.data.done = targetAmount;
        return true;
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy <= 0) {
        return true;
    }

    const result = creep.build(target);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    if (isTerminalBuildResult(result)) {
        return true;
    }

    if (result !== OK) {
        return false;
    }

    const remainingAmount = targetAmount - doneAmount;
    const spentAmount = Math.min(
        remainingAmount,
        currentEnergy,
        creep.getActiveBodyparts(WORK)
    );

    action.data.done = doneAmount + spentAmount;

    if (!Game.getObjectById(action.data.targetId)) {
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

function isConstructionSite(target) {
    return target.progress !== undefined && target.progressTotal !== undefined;
}

function isTerminalBuildResult(result) {
    return (
        result === ERR_INVALID_TARGET ||
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_NO_BODYPART ||
        result === ERR_NOT_OWNER
    );
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
