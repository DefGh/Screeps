const constants = require("./constants");
const resourceManager = require("./resource.manager");

function onCompleted(task, action, ctx) {
    const room = Game.rooms[task.room];

    if (room && room.controller && room.controller.my) {
        ctx.addTask(constants.taskTypes.UPGRADE_CONTROLLER, task.room, {
            total: room.controller.progressTotal,
        });
    }

    ctx.removeTask(task.id);
}

function tryDispatch(task, creep) {
    const total = task.data.total || 0;

    if (
        task.type !== constants.taskTypes.UPGRADE_CONTROLLER ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL ||
        total <= 0 ||
        task.assignedPercent >= 100
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
            type: constants.actionTypes.UPGRADE_CONTROLLER,
            data: {
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
