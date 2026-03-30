const constants = require("./constants");
const creepRoles = require("./creep.roles");

const RENEW_START_TTL = 500;
const RENEW_TARGET_TTL = 1400;

function getPrimarySpawn(roomName) {
    const room = Game.rooms[roomName];

    if (!room || !room.controller || !room.controller.my) {
        return null;
    }

    const spawns = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    });

    if (spawns.length === 0) {
        return null;
    }

    spawns.sort(function (left, right) {
        return left.name.localeCompare(right.name);
    });

    return spawns[0];
}

function getRoomGeneration(roomOrRoomName) {
    const room = typeof roomOrRoomName === "string"
        ? Game.rooms[roomOrRoomName]
        : roomOrRoomName;

    if (!room) {
        return 0;
    }

    return creepRoles.getUniversalGenerationForRoom(room);
}

function getCreepGeneration(creep) {
    return creepRoles.getCreepGeneration(creep);
}

function isUniversalOfRoom(creep, roomName) {
    return !!(
        creep &&
        creep.memory &&
        creep.memory.role === constants.roles.UNIVERSAL &&
        creep.memory.originRoomName === roomName
    );
}

function isGenerationCurrent(creep, roomOrRoomName) {
    return getCreepGeneration(creep) >= getRoomGeneration(roomOrRoomName);
}

function isEligibleToStart(creep, roomName) {
    return !!(
        isUniversalOfRoom(creep, roomName) &&
        Number.isFinite(creep.ticksToLive) &&
        creep.ticksToLive < RENEW_START_TTL &&
        isGenerationCurrent(creep, roomName)
    );
}

function isComplete(creep, renewUntil) {
    return !!(
        creep &&
        Number.isFinite(creep.ticksToLive) &&
        creep.ticksToLive >= getRenewUntil(renewUntil)
    );
}

function getRenewUntil(renewUntil) {
    return Number.isFinite(renewUntil)
        ? renewUntil
        : RENEW_TARGET_TTL;
}

function getProgressPercent(creep, renewUntil) {
    if (!creep || !Number.isFinite(creep.ticksToLive)) {
        return 0;
    }

    const targetTtl = getRenewUntil(renewUntil);
    const span = Math.max(1, targetTtl - RENEW_START_TTL);
    const progress = ((creep.ticksToLive - RENEW_START_TTL) / span) * 100;

    return Math.max(0, Math.min(100, progress));
}

module.exports = {
    RENEW_START_TTL,
    RENEW_TARGET_TTL,
    getCreepGeneration,
    getPrimarySpawn,
    getProgressPercent,
    getRenewUntil,
    getRoomGeneration,
    isComplete,
    isEligibleToStart,
    isGenerationCurrent,
    isUniversalOfRoom,
};
