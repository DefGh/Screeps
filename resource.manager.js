const constants = require("./constants");

function reserve(creep, amount) {
    const room = Game.rooms[creep.memory.originRoomName];

    if (!room || amount <= 0) {
        return null;
    }

    const container = findContainerTarget(room, creep, amount);

    if (hasEstablishedMiner(room.name)) {
        if (!container) {
            return null;
        }

        return createTakeResourceAction(room.name, container.id, amount);
    }

    const pile = findPileTarget(room, creep, amount);

    if (pile) {
        return {
            type: constants.actionTypes.PICKUP_RESOURCE,
            data: {
                pileId: pile.id,
                amount: amount,
                reservationId: createReservation(room.name, pile.id, amount),
            },
        };
    }

    if (container) {
        return createTakeResourceAction(room.name, container.id, amount);
    }

    const source = findMineTarget(room, creep);

    if (!source) {
        return null;
    }

    return {
        type: constants.actionTypes.MINE,
        data: {
            sourceId: source.id,
            amount: amount,
        },
    };
}

function createTakeResourceAction(roomName, containerId, amount) {
    return {
        type: constants.actionTypes.TAKE_RESOURCE,
        data: {
            fromId: containerId,
            amount: amount,
            reservationId: createReservation(roomName, containerId, amount),
        },
    };
}

function release(reservationId) {
    const reservation = Memory.Resources.byId[reservationId];

    if (!reservation) {
        return;
    }

    const roomState = getRoomState(reservation.room);
    const currentReserved = roomState.reservedAmountByTargetId[reservation.targetId] || 0;
    const nextReserved = Math.max(0, currentReserved - reservation.amount);

    if (nextReserved > 0) {
        roomState.reservedAmountByTargetId[reservation.targetId] = nextReserved;
    }
    else {
        delete roomState.reservedAmountByTargetId[reservation.targetId];
    }

    delete Memory.Resources.byId[reservationId];
}

function findPileTarget(room, creep, amount) {
    const piles = room.find(FIND_DROPPED_RESOURCES).filter(function (resource) {
        return isReservablePile(resource, room.name, amount);
    });

    return pickClosestTarget(creep, piles);
}

function findContainerTarget(room, creep, amount) {
    const containers = room.find(FIND_STRUCTURES).filter(function (structure) {
        return isReservableContainer(structure, room.name, amount);
    });

    return pickClosestTarget(creep, containers);
}

function findMineTarget(room, creep) {
    const activeSources = room.find(FIND_SOURCES_ACTIVE);
    const activeSource = pickClosestTarget(creep, activeSources);

    if (activeSource) {
        return activeSource;
    }

    return pickClosestTarget(creep, room.find(FIND_SOURCES));
}

function hasEstablishedMiner(roomName) {
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role !== constants.roles.MINER ||
            creep.memory.originRoomName !== roomName
        ) {
            continue;
        }

        const structures = creep.room.lookForAt(
            LOOK_STRUCTURES,
            creep.pos.x,
            creep.pos.y
        );

        for (const structure of structures) {
            if (structure.structureType === STRUCTURE_CONTAINER) {
                return true;
            }
        }
    }

    return false;
}

function isReservablePile(resource, roomName, amount) {
    return resource.resourceType === RESOURCE_ENERGY
        && getPileReservableAmount(resource, roomName) >= amount;
}

function isReservableContainer(structure, roomName, amount) {
    return structure.structureType === STRUCTURE_CONTAINER
        && getContainerReservableAmount(structure, roomName) >= amount;
}

function getPileReservableAmount(resource, roomName) {
    const reserved = getReservedAmount(roomName, resource.id);
    return Math.max(0, (resource.amount - 300) - reserved);
}

function getContainerReservableAmount(structure, roomName) {
    const reserved = getReservedAmount(roomName, structure.id);
    const stored = structure.store.getUsedCapacity(RESOURCE_ENERGY);

    return Math.max(0, stored - reserved);
}

function getReservedAmount(roomName, targetId) {
    const roomState = getRoomState(roomName);

    return roomState.reservedAmountByTargetId[targetId] || 0;
}

function createReservation(roomName, targetId, amount) {
    Memory.Resources.sequence += 1;

    const reservationId = `reservation:${Memory.Resources.sequence}`;
    const roomState = getRoomState(roomName);

    Memory.Resources.byId[reservationId] = {
        room: roomName,
        targetId: targetId,
        amount: amount,
    };
    roomState.reservedAmountByTargetId[targetId] = (roomState.reservedAmountByTargetId[targetId] || 0) + amount;

    return reservationId;
}

function getRoomState(roomName) {
    if (!Memory.Resources.rooms[roomName]) {
        Memory.Resources.rooms[roomName] = {
            reservedAmountByTargetId: {},
        };
    }

    return Memory.Resources.rooms[roomName];
}

function pickClosestTarget(creep, targets) {
    if (targets.length === 0) {
        return null;
    }

    return creep.pos.findClosestByRange(targets) || targets[0];
}

module.exports = {
    reserve,
    release,
};
