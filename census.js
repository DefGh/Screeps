let cachedTick = null;
let cachedCensus = null;

function getCensus() {
    if (cachedTick !== Game.time || !cachedCensus) {
        cachedTick = Game.time;
        cachedCensus = buildCensus();
    }

    return cachedCensus;
}

function buildCensus() {
    const census = {
        currentRolesByRoom: {},
        globalRoleCounts: {},
        originRolesByRoom: {},
        spawnCountsByRoom: {},
        visibleRooms: {},
    };

    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        census.spawnCountsByRoom[spawn.room.name] =
            (census.spawnCountsByRoom[spawn.room.name] || 0) + 1;
    }

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const role = creep.memory.role;

        census.globalRoleCounts[role] = (census.globalRoleCounts[role] || 0) + 1;
        pushRoleCreep(census.originRolesByRoom, creep.memory.originRoomName, role, creep);
        pushRoleCreep(census.currentRolesByRoom, creep.room.name, role, creep);
    }

    return census;
}

function pushRoleCreep(roleMap, roomName, role, creep) {
    if (!roleMap[roomName]) {
        roleMap[roomName] = {};
    }

    if (!roleMap[roomName][role]) {
        roleMap[roomName][role] = [];
    }

    roleMap[roomName][role].push(creep);
}

function getOriginRoleCount(roomName, role) {
    const roomRoles = getCensus().originRolesByRoom[roomName];

    if (!roomRoles || !roomRoles[role]) {
        return 0;
    }

    return roomRoles[role].length;
}

function getOriginRoleCreeps(roomName, role) {
    const roomRoles = getCensus().originRolesByRoom[roomName];

    if (!roomRoles || !roomRoles[role]) {
        return [];
    }

    return roomRoles[role].slice();
}

function getGlobalRoleCount(role) {
    return getCensus().globalRoleCounts[role] || 0;
}

function getSpawnCount(roomName) {
    return getCensus().spawnCountsByRoom[roomName] || 0;
}

function getRoomResourceAmount(roomName) {
    const room = Game.rooms[roomName];

    if (!room) {
        return 0;
    }

    return getVisibleRoomSummary(room).resourceAmount;
}

function getVisibleRoomSummary(room) {
    const census = getCensus();

    if (!census.visibleRooms[room.name]) {
        census.visibleRooms[room.name] = buildVisibleRoomSummary(room, census);
    }

    return census.visibleRooms[room.name];
}

function buildVisibleRoomSummary(room, census) {
    const summary = {
        constructionSiteCount: room.find(FIND_MY_CONSTRUCTION_SITES).length,
        hostileCount: room.find(FIND_HOSTILE_CREEPS).length,
        ownerUsername: getControllerOwnerUsername(room.controller),
        reservationUsername: getControllerReservationUsername(room.controller),
        resourceAmount: 0,
        roomName: room.name,
        sourceCount: room.find(FIND_SOURCES).length,
        structureCounts: {},
        visible: true,
    };

    for (const structure of room.find(FIND_STRUCTURES)) {
        if (!structure.owner || structure.my) {
            summary.resourceAmount += getUsedEnergy(structure);
        }

        summary.structureCounts[structure.structureType] =
            (summary.structureCounts[structure.structureType] || 0) + 1;
    }

    for (const pile of room.find(FIND_DROPPED_RESOURCES, {
        filter: function (resource) {
            return resource.resourceType === RESOURCE_ENERGY;
        },
    })) {
        summary.resourceAmount += pile.amount;
    }

    const roomRoles = census.currentRolesByRoom[room.name] || {};

    for (const role in roomRoles) {
        for (const creep of roomRoles[role]) {
            summary.resourceAmount += getUsedEnergy(creep);
        }
    }

    return summary;
}

function getUsedEnergy(object) {
    if (object.store) {
        return object.store.getUsedCapacity(RESOURCE_ENERGY) || object.store[RESOURCE_ENERGY] || 0;
    }

    if (object.carry) {
        return object.carry[RESOURCE_ENERGY] || 0;
    }

    return object.energy || 0;
}

function getControllerOwnerUsername(controller) {
    return controller && controller.owner
        ? controller.owner.username
        : null;
}

function getControllerReservationUsername(controller) {
    return controller && controller.reservation
        ? controller.reservation.username
        : null;
}

module.exports = {
    getGlobalRoleCount,
    getOriginRoleCount,
    getOriginRoleCreeps,
    getRoomResourceAmount,
    getSpawnCount,
    getUsedEnergy,
    getVisibleRoomSummary,
};
