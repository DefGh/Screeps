const constants = require("./constants");
const census = require("./census");
const roomScope = require("./room.scope");
const store = require("./store");

const ROOM_EVENT_CONSTANTS = {
    attack: getEventConstant("EVENT_ATTACK"),
    build: getEventConstant("EVENT_BUILD"),
    destroyed: getEventConstant("EVENT_OBJECT_DESTROYED"),
    exit: getEventConstant("EVENT_EXIT"),
    harvest: getEventConstant("EVENT_HARVEST"),
    repair: getEventConstant("EVENT_REPAIR"),
    reserve: getEventConstant("EVENT_RESERVE_CONTROLLER"),
    transfer: getEventConstant("EVENT_TRANSFER"),
    upgrade: getEventConstant("EVENT_UPGRADE_CONTROLLER"),
};

function observeOwnedRooms(deadCreepsByOriginRoom) {
    const deltasByRoom = {};

    for (const roomName of roomScope.getOperationalRoomNames()) {
        deltasByRoom[roomName] = observeRoom(Game.rooms[roomName], deadCreepsByOriginRoom);
    }

    return deltasByRoom;
}

function observeRoom(room, deadCreepsByOriginRoom) {
    const planner = store.getRoomPlanner(room.name);
    const snapshot = planner.snapshot;
    const delta = {
        deadCreeps: deadCreepsByOriginRoom[room.name] || 0,
        dirty: false,
        events: null,
        reasons: [],
        roomName: room.name,
        roomVisible: true,
        sweep: false,
    };

    const rawEventLog = room.getEventLog(true);

    if (rawEventLog !== "[]") {
        delta.events = parseRoomEvents(rawEventLog);
        delta.dirty = true;
        delta.reasons.push("events");
        snapshot.lastEventTick = Game.time;
    }

    if (!snapshot.visible) {
        delta.dirty = true;
        delta.reasons.push("visibility");
    }

    snapshot.visible = true;

    const controllerLevel = room.controller
        ? room.controller.level
        : null;

    if (snapshot.controllerLevel !== controllerLevel) {
        delta.dirty = true;
        delta.reasons.push("rcl");
    }

    snapshot.controllerLevel = controllerLevel;

    const spawnCount = census.getSpawnCount(room.name);

    if (snapshot.spawnCount !== spawnCount) {
        delta.dirty = true;
        delta.reasons.push("spawnCount");
    }

    snapshot.spawnCount = spawnCount;

    const constructionSiteCount = room.find(FIND_MY_CONSTRUCTION_SITES).length;

    if (snapshot.constructionSiteCount !== constructionSiteCount) {
        delta.dirty = true;
        delta.reasons.push("construction");
    }

    snapshot.constructionSiteCount = constructionSiteCount;

    if (delta.deadCreeps > 0) {
        delta.dirty = true;
        delta.reasons.push("creepDeath");
    }

    if (shouldProbeHostiles(snapshot, delta.events)) {
        const hostileCount = room.find(FIND_HOSTILE_CREEPS).length;

        if (snapshot.hostileCount !== hostileCount) {
            delta.dirty = true;
            delta.reasons.push("hostiles");
        }

        snapshot.hostileCount = hostileCount;
        snapshot.lastHostileProbeTick = Game.time;

        if (hostileCount > 0) {
            snapshot.hostileAlarmUntil = Game.time + constants.alarms.HOSTILE_TTL;
        }
        else if (snapshot.hostileAlarmUntil <= Game.time) {
            snapshot.hostileAlarmUntil = 0;
        }
    }

    if (shouldSweepRoom(planner, Game.time)) {
        delta.dirty = true;
        delta.reasons.push("sweep");
        delta.sweep = true;
        snapshot.lastSweepTick = Game.time;
    }

    if (delta.dirty) {
        store.markRoomDirty(room.name, delta.reasons.join(","));
        snapshot.lastDirtyTick = Game.time;
    }

    return delta;
}

function shouldSweepRoom(planner, now) {
    return now - planner.snapshot.lastSweepTick >= constants.sweepIntervals.ROOM;
}

function observeEmpire() {
    const expansion = store.getExpansionMemory();
    const delta = {
        dirty: false,
        reasons: [],
    };

    if (expansion.lastGclLevel !== Game.gcl.level) {
        delta.dirty = true;
        delta.reasons.push("gcl");
        expansion.lastGclLevel = Game.gcl.level;
    }

    if (Game.time >= expansion.nextSweepTick) {
        delta.dirty = true;
        delta.reasons.push("sweep");
        expansion.nextSweepTick = Game.time + constants.sweepIntervals.EXPANSION;
    }

    if (expansion.activeScout && Game.rooms[expansion.activeScout.targetRoomName]) {
        recordRoomIntel(Game.rooms[expansion.activeScout.targetRoomName]);
        delta.dirty = true;
        delta.reasons.push("scoutVisible");
    }

    if (expansion.activeCandidate && Game.rooms[expansion.activeCandidate.targetRoomName]) {
        recordRoomIntel(Game.rooms[expansion.activeCandidate.targetRoomName]);
        delta.dirty = true;
        delta.reasons.push("candidateVisible");
    }

    if (expansion.dirty) {
        delta.dirty = true;
        delta.reasons.push("flag");
        expansion.dirty = false;
    }

    return delta;
}

function recordRoomIntel(room) {
    const expansion = store.getExpansionMemory();
    const intel = expansion.roomIntel[room.name] || {};
    const exits = Game.map.describeExits(room.name) || {};
    const username = roomScope.getMyUsername();

    intel.claimable = isClaimableRoom(room, username);
    intel.controllerExists = Boolean(room.controller);
    intel.exits = Object.values(exits).sort();
    intel.ownerUsername =
        room.controller && room.controller.owner
            ? room.controller.owner.username
            : null;
    intel.reservationUsername =
        room.controller && room.controller.reservation
            ? room.controller.reservation.username
            : null;
    intel.roomName = room.name;
    intel.scoutedAt = Game.time;
    intel.sourceCount = room.find(FIND_SOURCES).length;

    expansion.roomIntel[room.name] = intel;
    return intel;
}

function isClaimableRoom(room, username) {
    if (!room.controller) {
        return false;
    }

    if (room.controller.owner) {
        return false;
    }

    if (
        room.controller.reservation &&
        room.controller.reservation.username !== username
    ) {
        return false;
    }

    return room.find(FIND_SOURCES).length > 0;
}

function shouldProbeHostiles(snapshot, events) {
    if (
        events &&
        (
            events.attack > 0 ||
            events.destroyed > 0
        )
    ) {
        return true;
    }

    if (snapshot.hostileAlarmUntil > Game.time) {
        return true;
    }

    if (!snapshot.lastHostileProbeTick) {
        return true;
    }

    return Game.time - snapshot.lastHostileProbeTick >= constants.sweepIntervals.HOSTILE_PROBE;
}

function parseRoomEvents(rawEventLog) {
    const counts = {
        attack: 0,
        build: 0,
        destroyed: 0,
        exit: 0,
        harvest: 0,
        repair: 0,
        reserve: 0,
        transfer: 0,
        upgrade: 0,
    };
    const events = JSON.parse(rawEventLog);

    for (const event of events) {
        if (event.event === ROOM_EVENT_CONSTANTS.attack) {
            counts.attack += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.build) {
            counts.build += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.destroyed) {
            counts.destroyed += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.exit) {
            counts.exit += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.harvest) {
            counts.harvest += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.repair) {
            counts.repair += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.reserve) {
            counts.reserve += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.transfer) {
            counts.transfer += 1;
        }
        else if (event.event === ROOM_EVENT_CONSTANTS.upgrade) {
            counts.upgrade += 1;
        }
    }

    return counts;
}

function getEventConstant(name) {
    return global[name];
}

module.exports = {
    observeEmpire,
    observeOwnedRooms,
    observeRoom,
    recordRoomIntel,
    shouldSweepRoom,
};
