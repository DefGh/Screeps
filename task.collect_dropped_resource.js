const constants = require("./constants");
const longRangeMining = require("./long_range_mining");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task, creep) {
    if (
        task.type !== constants.taskTypes.COLLECT_DROPPED_RESOURCE ||
        !creep.memory ||
        creep.memory.role !== constants.roles.UNIVERSAL ||
        creep.memory.originRoomName !== task.room
    ) {
        return [];
    }

    const room = Game.rooms[task.room];
    const resourceType = task.data.resourceType;
    const storage = longRangeMining.getOwnedStorage(room);

    if (!room || !storage || !resourceType) {
        return [];
    }

    const storageFreeCapacity = storage.store.getFreeCapacity(resourceType);

    if (storageFreeCapacity <= 0) {
        return [];
    }

    const carriedAmount = creep.store.getUsedCapacity(resourceType);

    if (carriedAmount > 0) {
        return [
            {
                type: constants.actionTypes.TRANSFER_RESOURCE,
                data: {
                    targetId: storage.id,
                    resourceType: resourceType,
                    amount: Math.min(carriedAmount, storageFreeCapacity),
                    done: 0,
                },
            },
        ];
    }

    if (creep.store.getUsedCapacity() > 0 || task.assignedPercent >= 100) {
        return [];
    }

    const pile = Game.getObjectById(task.data.pileId);

    if (
        !pile ||
        pile.resourceType !== resourceType ||
        pile.amount <= 0
    ) {
        return [];
    }

    const remainingAmount = getRemainingAmount(task);
    const assignedAmount = Math.min(
        creep.store.getFreeCapacity(),
        storageFreeCapacity,
        pile.amount,
        remainingAmount
    );

    if (assignedAmount <= 0) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.PICKUP_RESOURCE,
            data: {
                pileId: pile.id,
                resourceType: resourceType,
                amount: assignedAmount,
            },
        },
        {
            type: constants.actionTypes.TRANSFER_RESOURCE,
            data: {
                targetId: storage.id,
                resourceType: resourceType,
                amount: assignedAmount,
                done: 0,
            },
        },
    ];
}

function getRemainingAmount(task) {
    const total = task.data.total || 0;
    const assignedAmount = (task.assignedPercent / 100) * total;

    return Math.max(0, total - assignedAmount);
}

module.exports = {
    onCompleted,
    tryDispatch,
};
