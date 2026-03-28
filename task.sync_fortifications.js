const constants = require("./constants");
const planner = require("./planner.spawn_rings");

const FORTIFICATION_EDGE_OFFSET = 3;
const RAMPART_GATE_WIDTH = 3;
const ROOM_EDGE_MIN = 0;
const ROOM_EDGE_MAX = 49;

const edgeSpecs = [
    {
        edgeX: null,
        edgeY: ROOM_EDGE_MIN,
        innerX: null,
        innerY: ROOM_EDGE_MIN + FORTIFICATION_EDGE_OFFSET,
        axis: "x",
    },
    {
        edgeX: null,
        edgeY: ROOM_EDGE_MAX,
        innerX: null,
        innerY: ROOM_EDGE_MAX - FORTIFICATION_EDGE_OFFSET,
        axis: "x",
    },
    {
        edgeX: ROOM_EDGE_MIN,
        edgeY: null,
        innerX: ROOM_EDGE_MIN + FORTIFICATION_EDGE_OFFSET,
        innerY: null,
        axis: "y",
    },
    {
        edgeX: ROOM_EDGE_MAX,
        edgeY: null,
        innerX: ROOM_EDGE_MAX - FORTIFICATION_EDGE_OFFSET,
        innerY: null,
        axis: "y",
    },
];

function onCompleted() {
}

function tryDispatch(task, room, ctx) {
    if (
        task.type !== constants.taskTypes.SYNC_FORTIFICATIONS ||
        ctx.executorType !== "room" ||
        room.name !== task.room ||
        !room.controller ||
        !room.controller.my
    ) {
        return [];
    }

    if (!planner.getPrimarySpawn(room)) {
        return [];
    }

    if (!canPlaceFortifications(room)) {
        return [];
    }

    if (Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) {
        return [];
    }

    const activePlacementActions = getActivePlacementActions(task);

    if (activePlacementActions.length > 0) {
        return [];
    }

    const plan = buildFortificationPlan(room);

    if (plan.length === 0) {
        ctx.removeTask(task.id);
        return [];
    }

    const nextTile = pickNextUnplannedTile(room, plan);

    if (!nextTile) {
        ctx.removeTask(task.id);
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: room.name,
                structureType: nextTile.structureType,
                x: nextTile.x,
                y: nextTile.y,
            },
        },
    ];
}

function canPlaceFortifications(room) {
    const level = room.controller.level;

    return (
        (CONTROLLER_STRUCTURES[STRUCTURE_RAMPART][level] || 0) > 0 &&
        (CONTROLLER_STRUCTURES[STRUCTURE_WALL][level] || 0) > 0
    );
}

function getActivePlacementActions(task) {
    const actions = [];

    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.PLACE_CONSTRUCTION_SITE &&
            action.status !== "done" &&
            (
                action.data.structureType === STRUCTURE_RAMPART ||
                action.data.structureType === STRUCTURE_WALL
            )
        ) {
            actions.push(action);
        }
    }

    return actions;
}

function buildFortificationPlan(room) {
    const plannedByKey = {};
    const orderedKeys = [];

    for (const edgeSpec of edgeSpecs) {
        const segments = getExitSegments(room, edgeSpec);

        for (const segment of segments) {
            const segmentTiles = getSealTiles(room, edgeSpec, segment);

            if (segmentTiles.length === 0) {
                continue;
            }

            const rampartTiles = pickRampartTiles(room, segmentTiles);

            if (rampartTiles.length === 0) {
                continue;
            }

            for (const tile of segmentTiles) {
                const structureType = includesTile(rampartTiles, tile)
                    ? STRUCTURE_RAMPART
                    : STRUCTURE_WALL;

                if (!canHostFortification(room, tile.x, tile.y, structureType)) {
                    continue;
                }

                mergePlannedTile(
                    plannedByKey,
                    orderedKeys,
                    tile,
                    structureType
                );
            }
        }
    }

    return orderedKeys.map(function (key) {
        return plannedByKey[key];
    });
}

function getExitSegments(room, edgeSpec) {
    const terrain = new Room.Terrain(room.name);
    const coordinates = [];
    const segments = [];

    for (let coordinate = 0; coordinate <= 49; coordinate += 1) {
        const x = edgeSpec.edgeX === null ? coordinate : edgeSpec.edgeX;
        const y = edgeSpec.edgeY === null ? coordinate : edgeSpec.edgeY;

        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
            coordinates.push(coordinate);
        }
    }

    let start = null;
    let previous = null;

    for (const coordinate of coordinates) {
        if (start === null) {
            start = coordinate;
            previous = coordinate;
            continue;
        }

        if (coordinate === previous + 1) {
            previous = coordinate;
            continue;
        }

        segments.push({ start: start, end: previous });
        start = coordinate;
        previous = coordinate;
    }

    if (start !== null) {
        segments.push({ start: start, end: previous });
    }

    return segments;
}

function getSealTiles(room, edgeSpec, segment) {
    const values = [];
    const tiles = [];
    const seen = {};

    values.push(segment.start - 1);

    for (let value = segment.start; value <= segment.end; value += 1) {
        values.push(value);
    }

    values.push(segment.end + 1);

    for (const value of values) {
        const x = edgeSpec.innerX === null ? value : edgeSpec.innerX;
        const y = edgeSpec.innerY === null ? value : edgeSpec.innerY;

        if (!isInsideFortificationBounds(x, y)) {
            continue;
        }

        if (!isBaseFortificationTile(room, x, y)) {
            continue;
        }

        const key = positionKey(x, y);

        if (seen[key]) {
            continue;
        }

        seen[key] = true;
        tiles.push({
            roomName: room.name,
            x: x,
            y: y,
        });
    }

    return tiles;
}

function pickRampartTiles(room, segmentTiles) {
    const indexedTiles = segmentTiles.map(function (tile, index) {
        return {
            index: index,
            tile: tile,
        };
    }).filter(function (entry) {
        return canHostFortification(room, entry.tile.x, entry.tile.y, STRUCTURE_RAMPART);
    });

    if (indexedTiles.length === 0) {
        return [];
    }

    const groups = splitContiguousGroups(indexedTiles);
    const hasWideGroup = groups.some(function (group) {
        return group.length >= RAMPART_GATE_WIDTH;
    });
    const targetWidth = hasWideGroup
        ? RAMPART_GATE_WIDTH
        : groups.reduce(function (maxWidth, group) {
            return Math.max(maxWidth, group.length);
        }, 0);

    if (targetWidth <= 0) {
        return [];
    }

    const desiredCenter = (segmentTiles.length - 1) / 2;
    let bestWindow = null;

    for (const group of groups) {
        if (group.length < targetWidth) {
            continue;
        }

        for (let startIndex = 0; startIndex <= group.length - targetWidth; startIndex += 1) {
            const window = group.slice(startIndex, startIndex + targetWidth);

            if (isBetterRampartWindow(window, bestWindow, desiredCenter)) {
                bestWindow = window;
            }
        }
    }

    if (!bestWindow) {
        return [];
    }

    return bestWindow.map(function (entry) {
        return entry.tile;
    });
}

function splitContiguousGroups(indexedTiles) {
    const groups = [];
    let currentGroup = [];

    for (const entry of indexedTiles) {
        const previous = currentGroup[currentGroup.length - 1];

        if (!previous || areAdjacentSealTiles(previous.tile, entry.tile)) {
            currentGroup.push(entry);
            continue;
        }

        groups.push(currentGroup);
        currentGroup = [entry];
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups;
}

function isBetterRampartWindow(candidate, bestWindow, desiredCenter) {
    if (!bestWindow) {
        return true;
    }

    const candidateCenter = getWindowCenter(candidate);
    const bestCenter = getWindowCenter(bestWindow);
    const candidateDistance = Math.abs(candidateCenter - desiredCenter);
    const bestDistance = Math.abs(bestCenter - desiredCenter);

    if (candidateDistance !== bestDistance) {
        return candidateDistance < bestDistance;
    }

    if (candidate[0].index !== bestWindow[0].index) {
        return candidate[0].index < bestWindow[0].index;
    }

    const candidateFirstTile = candidate[0].tile;
    const bestFirstTile = bestWindow[0].tile;

    if (candidateFirstTile.x !== bestFirstTile.x) {
        return candidateFirstTile.x < bestFirstTile.x;
    }

    return candidateFirstTile.y < bestFirstTile.y;
}

function getWindowCenter(window) {
    return (window[0].index + window[window.length - 1].index) / 2;
}

function canHostFortification(room, x, y, structureType) {
    if (!isBaseFortificationTile(room, x, y)) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);

    if (structureType === STRUCTURE_RAMPART) {
        for (const structure of structures) {
            if (structure.structureType === STRUCTURE_WALL) {
                return false;
            }
        }

        for (const site of sites) {
            if (site.structureType !== STRUCTURE_RAMPART) {
                return false;
            }
        }

        return true;
    }

    for (const structure of structures) {
        if (structure.structureType !== STRUCTURE_WALL) {
            return false;
        }
    }

    for (const site of sites) {
        if (site.structureType !== STRUCTURE_WALL) {
            return false;
        }
    }

    return true;
}

function isBaseFortificationTile(room, x, y) {
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

    return true;
}

function pickNextUnplannedTile(room, plan) {
    for (const tile of plan) {
        if (!isPlannedTileSatisfied(room, tile)) {
            return tile;
        }
    }

    return null;
}

function isPlannedTileSatisfied(room, tile) {
    const structures = room.lookForAt(LOOK_STRUCTURES, tile.x, tile.y);

    for (const structure of structures) {
        if (structure.structureType === tile.structureType) {
            return true;
        }
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, tile.x, tile.y);

    for (const site of sites) {
        if (site.structureType === tile.structureType) {
            return true;
        }
    }

    return false;
}

function mergePlannedTile(plannedByKey, orderedKeys, tile, structureType) {
    const key = positionKey(tile.x, tile.y);
    const existing = plannedByKey[key];

    if (!existing) {
        plannedByKey[key] = {
            roomName: tile.roomName,
            x: tile.x,
            y: tile.y,
            structureType: structureType,
        };
        orderedKeys.push(key);
        return;
    }

    if (
        existing.structureType === STRUCTURE_WALL &&
        structureType === STRUCTURE_RAMPART
    ) {
        existing.structureType = STRUCTURE_RAMPART;
    }
}

function matchesProtectedRoomObject(target, x, y) {
    return target && target.pos.x === x && target.pos.y === y;
}

function isInsideFortificationBounds(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function isSameTile(left, right) {
    return left.x === right.x && left.y === right.y;
}

function includesTile(tiles, target) {
    return tiles.some(function (tile) {
        return isSameTile(tile, target);
    });
}

function areAdjacentSealTiles(left, right) {
    return getChebyshevRange(left, right) === 1;
}

function positionKey(x, y) {
    return `${x}:${y}`;
}

function getChebyshevRange(origin, target) {
    return Math.max(
        Math.abs(origin.x - target.x),
        Math.abs(origin.y - target.y)
    );
}

module.exports = {
    onCompleted,
    tryDispatch,
};
