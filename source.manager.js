const constants = require("./constants");

function refreshManagedSources() {
    const roomNames = getManagedRoomNames();

    for (const roomName of roomNames) {
        const room = Game.rooms[roomName];

        if (!room) {
            continue;
        }

        refreshRoomSources(room);
    }
}

function countMinerTargets(roomName) {
    let count = 0;

    for (const sourceId in Memory.sources) {
        const sourceMemory = Memory.sources[sourceId];

        if (!sourceMemory || !sourceMemory.minerPos) {
            continue;
        }

        if (sourceMemory.minerPos.roomName !== roomName) {
            continue;
        }

        count += 1;
    }

    return count;
}

function getMinerPos(sourceId) {
    const sourceMemory = Memory.sources && Memory.sources[sourceId];
    return sourceMemory && sourceMemory.minerPos ? sourceMemory.minerPos : null;
}

function getMinerSourcesForRoom(roomName) {
    const sources = [];

    for (const sourceId in Memory.sources) {
        const sourceMemory = Memory.sources[sourceId];

        if (!sourceMemory || !sourceMemory.minerPos) {
            continue;
        }

        if (sourceMemory.minerPos.roomName !== roomName) {
            continue;
        }

        sources.push({
            sourceId: sourceId,
            minerPos: sourceMemory.minerPos,
        });
    }

    return sources;
}

function refreshRoomSources(room) {
    const sources = room.find(FIND_SOURCES);
    const threats = getRoomThreats(room);

    for (const source of sources) {
        refreshSourceMemory(source, threats);
    }
}

function refreshSourceMemory(source, threats) {
    const sourceMemory = getSourceMemory(source.id);

    if (
        typeof sourceMemory.minerPosCheckedAt === "number" &&
        Game.time - sourceMemory.minerPosCheckedAt < constants.sources.MINER_POS_REFRESH_INTERVAL
    ) {
        return;
    }

    if (isMinerPosValid(source, sourceMemory.minerPos, threats)) {
        sourceMemory.minerPosCheckedAt = Game.time;
        return;
    }

    sourceMemory.minerPos = findMinerPos(source, threats);
    sourceMemory.minerPosCheckedAt = Game.time;
}

function findMinerPos(source, threats) {
    const roomName = source.room.name;

    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x += 1) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y += 1) {
            if (!isInsideRoom(x, y)) {
                continue;
            }

            if (x === source.pos.x && y === source.pos.y) {
                continue;
            }

            const position = {
                x: x,
                y: y,
                roomName: roomName,
            };

            if (isMinerPosValid(source, position, threats)) {
                return position;
            }
        }
    }

    return null;
}

function isMinerPosValid(source, minerPos, threats) {
    if (!source || !source.room || !minerPos) {
        return false;
    }

    if (
        typeof minerPos.x !== "number" ||
        typeof minerPos.y !== "number" ||
        !isInsideRoom(minerPos.x, minerPos.y) ||
        minerPos.roomName !== source.room.name
    ) {
        return false;
    }

    if (!source.pos.inRangeTo(minerPos.x, minerPos.y, 1)) {
        return false;
    }

    if (isWall(source.room, minerPos.x, minerPos.y)) {
        return false;
    }

    if (hasImpassableStructure(source.room, minerPos.x, minerPos.y)) {
        return false;
    }

    if (isDangerousPosition(threats, minerPos.x, minerPos.y)) {
        return false;
    }

    return true;
}

function getSourceMemory(sourceId) {
    if (!Memory.sources[sourceId] || typeof Memory.sources[sourceId] !== "object") {
        Memory.sources[sourceId] = {};
    }

    return Memory.sources[sourceId];
}

function getManagedRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.room) {
            roomNames[spawn.room.name] = true;
        }
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.my) {
            roomNames[roomName] = true;
        }
    }

    return Object.keys(roomNames);
}

function getRoomThreats(room) {
    return room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_STRUCTURES));
}

function isInsideRoom(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function isWall(room, x, y) {
    const terrain = room.getTerrain();
    return terrain.get(x, y) === TERRAIN_MASK_WALL;
}

function hasImpassableStructure(room, x, y) {
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (isImpassableStructure(structure)) {
            return true;
        }
    }

    return false;
}

function isImpassableStructure(structure) {
    if (!structure || !structure.structureType) {
        return false;
    }

    if (structure.structureType === STRUCTURE_ROAD) {
        return false;
    }

    if (structure.structureType === STRUCTURE_CONTAINER) {
        return false;
    }

    if (structure.structureType === STRUCTURE_RAMPART) {
        return !structure.my && !structure.isPublic;
    }

    if (typeof OBSTACLE_OBJECT_TYPES !== "undefined" && Array.isArray(OBSTACLE_OBJECT_TYPES)) {
        return OBSTACLE_OBJECT_TYPES.includes(structure.structureType);
    }

    return true;
}

function isDangerousPosition(threats, x, y) {
    for (const threat of threats) {
        if (threat.pos && threat.pos.inRangeTo(x, y, constants.sources.HOSTILE_DANGER_RANGE)) {
            return true;
        }
    }

    return false;
}

module.exports = {
    countMinerTargets,
    getMinerPos,
    getMinerSourcesForRoom,
    refreshManagedSources,
};
