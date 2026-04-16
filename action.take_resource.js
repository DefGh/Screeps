const resourceManager = require("./resource.manager");
const tasks = require("./tasks");
const debug = require("./debug");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return complete(action, "task_missing");
    }

    const resourceType = action.data.resourceType || RESOURCE_ENERGY;
    const targetAmount = action.data.amount || 0;
    const currentAmount = creep.store.getUsedCapacity(resourceType);
    const freeCapacity = creep.store.getFreeCapacity();
    const target = Game.getObjectById(action.data.fromId);

    if (targetAmount <= 0) {
        return complete(
            action,
            `invalid_amount amount=${targetAmount} current=${currentAmount} free=${freeCapacity}`
        );
    }

    if (currentAmount >= targetAmount) {
        return complete(
            action,
            `target_reached amount=${targetAmount} current=${currentAmount} free=${freeCapacity}`
        );
    }

    if (freeCapacity <= 0) {
        return complete(
            action,
            `no_free_capacity amount=${targetAmount} current=${currentAmount} free=${freeCapacity}`
        );
    }

    if (!target) {
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

        return complete(action, `target_missing from=${action.data.fromId}`);
    }

    const result = creep.withdraw(target, resourceType);

    log(result)

    if (result === OK) {
        log(`[pickup_resource] progress ok ${describeAction(action)}`);
        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        log(`[pickup_resource] progress not_in_range ${describeAction(action)}`);

        creep.moveTo(target);
        return false;
    }

    if (result === ERR_FULL) {
        return complete(
            action,
            `err_full amount=${targetAmount} current=${currentAmount} free=${freeCapacity}`
        );
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        return complete(action, `err_not_enough_resources from=${action.data.fromId}`);
    }

    if (result === ERR_INVALID_TARGET) {
        return complete(action, `err_invalid_target from=${action.data.fromId}`);
    }

    if (result === ERR_NOT_OWNER) {
        return complete(action, `err_not_owner from=${action.data.fromId}`);
    }

    if (result === ERR_BUSY) {
        return complete(action, `err_busy from=${action.data.fromId}`);
    }

    log(`[pickup_resource] progress unexpected_result=${result} ${describeAction(action)}`);
    return false;
}

function log(msg) {
    //debug.log(msg)
}

function onCompleted(action) {
    log(`[pickup_resource] cleanup completed ${describeAction(action)}`);
    releaseReservation(action);
}

function onCreepDeath(event, action) {
    log(`[pickup_resource] cleanup creep_died ${describeAction(action)}`);
    releaseReservation(action);
}

function onCancel(action) {
    log(`[pickup_resource] cleanup canceled ${describeAction(action)}`);
    releaseReservation(action);
}

function releaseReservation(action) {
    if (!action.data.reservationId) {
        return;
    }

    resourceManager.release(action.data.reservationId);
    delete action.data.reservationId;
}

function complete(action, reason) {
    log(`[pickup_resource] complete ${reason} ${describeAction(action)}`);
    return true;
}

function describeAction(action) {
    return `action=${action.id} task=${action.taskId} creep=${action.executorName} from=${action.data.fromId}`;
}

module.exports = {
    execute,
    onCancel,
    onCompleted,
    onCreepDeath,
};
