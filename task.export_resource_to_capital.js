const constants = require("./constants");
const logistics = require("./logistics");
const longRangeMining = require("./long_range_mining");

function onCompleted(task, action, ctx) {
    ctx.removeTask(task.id);
}

function tryDispatch(task, creep) {
    if (
        task.type !== constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL ||
        !creep.memory ||
        !logistics.isExportHauler(creep, task.room) ||
        creep.memory.originRoomName !== task.room
    ) {
        return [];
    }

    const primaryHauler = logistics.getPrimaryExportHauler(task.room);

    if (!primaryHauler || primaryHauler.name !== creep.name) {
        return [];
    }

    const sourceRoom = Game.rooms[task.room];
    const capitalStorage = logistics.getCapitalStorage();
    const resourceType = task.data.resourceType;

    if (
        !sourceRoom ||
        !capitalStorage ||
        !resourceType ||
        logistics.isCapitalRoom(task.room)
    ) {
        return [];
    }

    const capitalFreeCapacity = capitalStorage.store.getFreeCapacity(resourceType);

    if (capitalFreeCapacity <= 0) {
        return [];
    }

    const carriedAmount = creep.store.getUsedCapacity(resourceType);

    if (carriedAmount > 0) {
        return [
            {
                type: constants.actionTypes.TRANSFER_RESOURCE,
                data: {
                    targetId: capitalStorage.id,
                    resourceType: resourceType,
                    amount: Math.min(carriedAmount, capitalFreeCapacity),
                    done: 0,
                },
            },
        ];
    }

    const sourceStorage = longRangeMining.getOwnedStorage(sourceRoom);

    if (!sourceStorage) {
        return [];
    }

    if (task.assignedPercent >= 100) {
        return [];
    }

    const remainingAmount = getRemainingAmount(task);
    const sourceAmount = sourceStorage.store.getUsedCapacity(resourceType);
    const assignedAmount = Math.min(
        creep.store.getFreeCapacity(),
        remainingAmount,
        sourceAmount
    );

    if (assignedAmount <= 0) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.TAKE_RESOURCE,
            data: {
                amount: assignedAmount,
                fromId: sourceStorage.id,
                resourceType: resourceType,
            },
        },
        {
            type: constants.actionTypes.TRANSFER_RESOURCE,
            data: {
                targetId: capitalStorage.id,
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
