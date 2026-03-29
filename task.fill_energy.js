const constants = require("./constants");
const fillEnergy = require("./fill.energy");
const resourceManager = require("./resource.manager");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task, creep) {
    if (
        task.type !== constants.taskTypes.FILL_ENERGY ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL
    ) {
        return [];
    }

    fillEnergy.normalizeTask(task);

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    const tripBudget = currentEnergy + freeCapacity;

    if (tripBudget <= 0 || task.assignedPercent >= 100) {
        return [];
    }

    const transfers = [];
    let remainingBudget = tripBudget;

    for (const target of task.data.targets || []) {
        const remainingAmount = fillEnergy.getRemainingAmount(target);

        if (remainingAmount <= 0) {
            continue;
        }

        let amount = 0;

        if (transfers.length === 0) {
            amount = Math.min(remainingAmount, remainingBudget);
        }
        else if (remainingAmount <= remainingBudget) {
            amount = remainingAmount;
        }
        else {
            break;
        }

        if (amount <= 0) {
            continue;
        }

        transfers.push({
            type: constants.actionTypes.TRANSFER_ENERGY,
            data: {
                targetId: target.targetId,
                amount: amount,
                done: 0,
            },
        });

        remainingBudget -= amount;

        if (remainingBudget <= 0) {
            break;
        }
    }

    if (transfers.length === 0) {
        return [];
    }

    const plannedAmount = transfers.reduce(function (total, transfer) {
        return total + transfer.data.amount;
    }, 0);
    const reserveAmount = Math.max(0, plannedAmount - currentEnergy);
    const actions = [];

    if (reserveAmount > 0) {
        const energyAction = resourceManager.reserve(creep, reserveAmount);

        if (!energyAction) {
            return [];
        }

        actions.push(energyAction);
    }

    return actions.concat(transfers);
}

module.exports = {
    onCompleted,
    tryDispatch,
};
