const constants = require("./constants");
const resourceManager = require("./resource.manager");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task, creep) {
    const target = Game.getObjectById(task.data.targetId);
    const total = task.data.total || 0;

    if (
        task.type !== constants.taskTypes.FILL_TOWER ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL ||
        !target ||
        total <= 0 ||
        task.assignedPercent >= 100 ||
        target.store.getFreeCapacity(RESOURCE_ENERGY) <= 0
    ) {
        return [];
    }

    const remainingAmount = Math.max(0, total - getAssignedAmount(task, total));

    if (remainingAmount <= 0) {
        return [];
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
        {
            type: constants.actionTypes.TRANSFER_ENERGY,
            data: {
                targetId: task.data.targetId,
                amount: assignedAmount,
                done: 0,
            },
        },
    ];
}

function getAssignedAmount(task, total) {
    return (task.assignedPercent / 100) * total;
}

module.exports = {
    onCompleted,
    tryDispatch,
};
