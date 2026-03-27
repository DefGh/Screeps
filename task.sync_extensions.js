const constants = require("./constants");

function onCompleted() {
}

function tryDispatch(task, room, ctx) {
    if (
        task.type !== constants.taskTypes.SYNC_EXTENSIONS ||
        ctx.executorType !== "room" ||
        room.name !== task.room ||
        !room.controller ||
        !room.controller.my
    ) {
        return [];
    }

    const allowedCount =
        CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const activePlacementActions = getActivePlacementActions(task);
    const progress =
        countExistingExtensions(room) +
        countExistingExtensionSites(room) +
        activePlacementActions.length;

    if (progress >= allowedCount) {
        ctx.removeTask(task.id);
        return [];
    }

    if (Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) {
        return [];
    }

    if (activePlacementActions.length > 0) {
        return [];
    }

    const nextPosition = findNextExtensionPosition(room, activePlacementActions);

    if (!nextPosition) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: room.name,
                structureType: STRUCTURE_EXTENSION,
                x: nextPosition.x,
                y: nextPosition.y,
            },
        },
    ];
}

function countExistingExtensions(room) {
    return room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_EXTENSION;
    }).length;
}

function countExistingExtensionSites(room) {
    return room.find(FIND_MY_CONSTRUCTION_SITES).filter(function (site) {
        return site.structureType === STRUCTURE_EXTENSION;
    }).length;
}

function getActivePlacementActions(task) {
    const actions = [];

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.PLACE_CONSTRUCTION_SITE &&
            action.status !== "done" &&
            action.data.structureType === STRUCTURE_EXTENSION
        ) {
            actions.push(action);
        }
    }

    return actions;
}

function findNextExtensionPosition(room, activePlacementActions) {
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
                !isValidExtensionTile(room, primarySpawn, candidate.x, candidate.y)
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

function isValidExtensionTile(room, primarySpawn, x, y) {
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
    onCompleted,
    tryDispatch,
};
