const constants = require("./constants");

function countOwnedStructures(room, structureType) {
    return room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === structureType;
    }).length;
}

function countOwnedSites(room, structureType) {
    return room.find(FIND_MY_CONSTRUCTION_SITES).filter(function (site) {
        return site.structureType === structureType;
    }).length;
}

function getActivePlacementActions(task, structureType) {
    const actions = [];

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.PLACE_CONSTRUCTION_SITE &&
            action.status !== "done" &&
            action.data.structureType === structureType
        ) {
            actions.push(action);
        }
    }

    return actions;
}

function findNextSpawnRingPosition(room, activePlacementActions) {
    const primarySpawn = getPrimarySpawn(room);

    if (!primarySpawn) {
        return null;
    }

    const reservedKeys = toReservedPositionKeys(activePlacementActions);
    const anchorParity = (primarySpawn.pos.x + primarySpawn.pos.y) % 2;

    for (let range = 1; range <= 48; range += 1) {
        for (const candidate of getRingCandidates(primarySpawn.pos, range)) {
            if (
                ((candidate.x + candidate.y) % 2) !== anchorParity ||
                reservedKeys[candidateKey(candidate.x, candidate.y)] ||
                !isValidSpawnRingTile(room, primarySpawn, candidate.x, candidate.y)
            ) {
                continue;
            }

            return candidate;
        }
    }

    return null;
}

function getPrimarySpawn(room) {
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

function getRingCandidates(anchorPosition, range) {
    const candidates = [];
    const minX = Math.max(1, anchorPosition.x - range);
    const maxX = Math.min(48, anchorPosition.x + range);
    const minY = Math.max(1, anchorPosition.y - range);
    const maxY = Math.min(48, anchorPosition.y + range);

    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            if (
                Math.max(
                    Math.abs(x - anchorPosition.x),
                    Math.abs(y - anchorPosition.y)
                ) !== range
            ) {
                continue;
            }

            candidates.push({
                roomName: anchorPosition.roomName,
                x: x,
                y: y,
            });
        }
    }

    return candidates;
}

function isValidSpawnRingTile(room, primarySpawn, x, y) {
    if (
        x === primarySpawn.pos.x &&
        y === primarySpawn.pos.y
    ) {
        return false;
    }

    const terrain = new Room.Terrain(room.name);

    if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        return false;
    }

    if (matchesProtectedRoomObject(room.controller, x, y)) {
        return false;
    }

    for (const source of room.find(FIND_SOURCES)) {
        if (matchesProtectedRoomObject(source, x, y)) {
            return false;
        }
    }

    for (const mineral of room.find(FIND_MINERALS)) {
        if (matchesProtectedRoomObject(mineral, x, y)) {
            return false;
        }
    }

    if (hasBlockingStructure(room, x, y) || hasBlockingSite(room, x, y)) {
        return false;
    }

    return true;
}

function hasBlockingStructure(room, x, y) {
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (structure.structureType !== STRUCTURE_RAMPART) {
            return true;
        }
    }

    return false;
}

function hasBlockingSite(room, x, y) {
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);

    for (const site of sites) {
        if (site.structureType !== STRUCTURE_RAMPART) {
            return true;
        }
    }

    return false;
}

function matchesProtectedRoomObject(target, x, y) {
    return target && target.pos.x === x && target.pos.y === y;
}

function toReservedPositionKeys(actions) {
    const keys = {};

    for (const action of actions) {
        keys[candidateKey(action.data.x, action.data.y)] = true;
    }

    return keys;
}

function candidateKey(x, y) {
    return `${x}:${y}`;
}

module.exports = {
    countOwnedSites,
    countOwnedStructures,
    findNextSpawnRingPosition,
    getActivePlacementActions,
    getPrimarySpawn,
};
