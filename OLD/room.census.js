const constants = require("./constants");

let cachedTick = null;
let cachedCensus = null;

function getOriginRoleCount(roomName, role) {
    return getRoleCreeps(getCensus().originRolesByRoom, roomName, role).length;
}

function getOriginRoleCreeps(roomName, role) {
    return getRoleCreeps(getCensus().originRolesByRoom, roomName, role).slice();
}

function getCurrentRoomRoleCount(roomName, role) {
    return getRoleCreeps(getCensus().currentRolesByRoom, roomName, role).length;
}

function getGlobalRoleCount(role) {
    return typeof getCensus().globalRoleCounts[role] === "number"
        ? getCensus().globalRoleCounts[role]
        : 0;
}

function getRoomResourceAmount(roomOrName) {
    const summary = getVisibleRoomSummary(roomOrName);
    return summary ? summary.resourceAmount : 0;
}

function getVisibleRoomSummary(roomOrName) {
    const room = resolveRoom(roomOrName);

    if (!room || typeof room.name !== "string") {
        return null;
    }

    const census = getCensus();

    if (!census.visibleRooms[room.name]) {
        census.visibleRooms[room.name] = buildVisibleRoomSummary(room, census);
    }

    return census.visibleRooms[room.name];
}

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
        visibleRooms: {},
    };

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (!creep || !creep.memory || !creep.my) {
            continue;
        }

        const role = typeof creep.memory.role === "string" ? creep.memory.role : null;

        if (!role) {
            continue;
        }

        census.globalRoleCounts[role] = (census.globalRoleCounts[role] || 0) + 1;

        if (typeof creep.memory.originRoomName === "string") {
            pushRoleCreep(census.originRolesByRoom, creep.memory.originRoomName, role, creep);
        }

        if (creep.room && typeof creep.room.name === "string") {
            pushRoleCreep(census.currentRolesByRoom, creep.room.name, role, creep);
        }
    }

    return census;
}

function buildVisibleRoomSummary(room, census) {
    const summary = {
        controllerMy: Boolean(room.controller && room.controller.my),
        controllerLevel: room.controller && typeof room.controller.level === "number"
            ? room.controller.level
            : null,
        hostileCount: room.find(FIND_HOSTILE_CREEPS).length,
        myConstructionSiteCount: room.find(FIND_MY_CONSTRUCTION_SITES).length,
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

        if (!shouldCountTrackedStructure(structure)) {
            continue;
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

    for (const roleName in census.currentRolesByRoom[room.name] || {}) {
        const creeps = census.currentRolesByRoom[room.name][roleName];

        for (const creep of creeps) {
            summary.resourceAmount += getUsedEnergy(creep);
        }
    }

    return summary;
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

function getRoleCreeps(roleMap, roomName, role) {
    if (
        typeof roomName !== "string" ||
        typeof role !== "string" ||
        !roleMap[roomName] ||
        !Array.isArray(roleMap[roomName][role])
    ) {
        return [];
    }

    return roleMap[roomName][role];
}

function resolveRoom(roomOrName) {
    if (roomOrName && typeof roomOrName.name === "string") {
        return roomOrName;
    }

    if (typeof roomOrName === "string" && Game.rooms[roomOrName]) {
        return Game.rooms[roomOrName];
    }

    return null;
}

function shouldCountTrackedStructure(structure) {
    if (!structure || typeof structure.structureType !== "string") {
        return false;
    }

    return (
        structure.structureType === STRUCTURE_SPAWN ||
        structure.structureType === STRUCTURE_EXTENSION ||
        structure.structureType === STRUCTURE_TOWER ||
        structure.structureType === STRUCTURE_CONTAINER ||
        structure.structureType === STRUCTURE_ROAD ||
        structure.structureType === STRUCTURE_WALL ||
        structure.structureType === STRUCTURE_RAMPART
    );
}

function getControllerOwnerUsername(controller) {
    return controller && controller.owner && typeof controller.owner.username === "string"
        ? controller.owner.username
        : null;
}

function getControllerReservationUsername(controller) {
    return controller && controller.reservation && typeof controller.reservation.username === "string"
        ? controller.reservation.username
        : null;
}

function getUsedEnergy(object) {
    if (!object) {
        return 0;
    }

    if (object.store && typeof object.store.getUsedCapacity === "function") {
        return object.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    if (object.store && typeof object.store[RESOURCE_ENERGY] === "number") {
        return object.store[RESOURCE_ENERGY];
    }

    if (object.carry && typeof object.carry[RESOURCE_ENERGY] === "number") {
        return object.carry[RESOURCE_ENERGY];
    }

    if (
        typeof object.energy === "number" &&
        (
            object.structureType === STRUCTURE_SPAWN ||
            object.structureType === STRUCTURE_EXTENSION ||
            object.structureType === STRUCTURE_TOWER
        )
    ) {
        return object.energy;
    }

    return 0;
}

module.exports = {
    getCurrentRoomRoleCount,
    getGlobalRoleCount,
    getOriginRoleCount,
    getOriginRoleCreeps,
    getRoomResourceAmount,
    getVisibleRoomSummary,
};
