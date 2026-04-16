const constants = require("./constants");
const longRangeMining = require("./long_range_mining");

function ensureMemory() {
    if (!Memory.Logistics) {
        Memory.Logistics = {
            capitalRoomName: null,
        };
    }
    else if (Memory.Logistics.capitalRoomName === undefined) {
        Memory.Logistics.capitalRoomName = null;
    }

    return Memory.Logistics;
}

function getCapitalRoomName() {
    return ensureMemory().capitalRoomName || null;
}

function isCapitalRoom(roomName) {
    return !!roomName && roomName === getCapitalRoomName();
}

function getCapitalRoom() {
    const roomName = getCapitalRoomName();

    if (!roomName) {
        return null;
    }

    return Game.rooms[roomName] || null;
}

function getCapitalStorage() {
    const room = getCapitalRoom();

    if (!room || !room.controller || !room.controller.my) {
        return null;
    }

    return longRangeMining.getOwnedStorage(room);
}

function getNonEnergyDroppedResources(room) {
    if (!room) {
        return [];
    }

    return room.find(FIND_DROPPED_RESOURCES).filter(function (resource) {
        return (
            resource.resourceType !== RESOURCE_ENERGY &&
            resource.amount > 0
        );
    });
}

function getStorageNonEnergyResources(storage) {
    if (!storage) {
        return [];
    }

    const resources = [];

    for (const resourceType in storage.store) {
        const amount = storage.store[resourceType];

        if (
            resourceType === RESOURCE_ENERGY ||
            amount <= 0
        ) {
            continue;
        }

        resources.push({
            amount: amount,
            resourceType: resourceType,
        });
    }

    resources.sort(function (left, right) {
        if (left.resourceType !== right.resourceType) {
            return left.resourceType.localeCompare(right.resourceType);
        }

        return left.amount - right.amount;
    });

    return resources;
}

function isExportHauler(creep, roomName) {
    return !!(
        creep &&
        creep.memory &&
        creep.memory.role === constants.roles.HAULER &&
        creep.memory.haulerMode === "capital_export" &&
        (!roomName || creep.memory.originRoomName === roomName)
    );
}

function getPrimaryExportHauler(roomName) {
    let best = null;

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (!isExportHauler(creep, roomName)) {
            continue;
        }

        if (!best || creep.name.localeCompare(best.name) < 0) {
            best = creep;
        }
    }

    return best;
}

module.exports = {
    ensureMemory,
    getCapitalRoom,
    getCapitalRoomName,
    getCapitalStorage,
    getNonEnergyDroppedResources,
    getPrimaryExportHauler,
    getStorageNonEnergyResources,
    isCapitalRoom,
    isExportHauler,
};
