const constants = require("./constants");
const planner = require("./planner.spawn_rings");

const edgeSpecs = [
    { edgeX: null, edgeY: 0, innerX: null, innerY: 1, axis: "x" },
    { edgeX: null, edgeY: 49, innerX: null, innerY: 48, axis: "x" },
    { edgeX: 0, edgeY: null, innerX: 1, innerY: null, axis: "y" },
    { edgeX: 49, edgeY: null, innerX: 48, innerY: null, axis: "y" },
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
    const primarySpawn = planner.getPrimarySpawn(room);
    const plannedByKey = {};
    const orderedKeys = [];

    for (const edgeSpec of edgeSpecs) {
        const segments = getExitSegments(room, edgeSpec);

        for (const segment of segments) {
            const segmentTiles = getSealTiles(room, edgeSpec, segment);

            if (segmentTiles.length === 0) {
                continue;
            }

            const gateTile = pickGateTile(primarySpawn, segmentTiles);

            if (!gateTile) {
                continue;
            }

            for (const tile of segmentTiles) {
                const structureType = isSameTile(tile, gateTile)
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

function pickGateTile(primarySpawn, segmentTiles) {
    const rampartCandidates = segmentTiles.filter(function (tile) {
        return canHostFortification(Game.rooms[tile.roomName], tile.x, tile.y, STRUCTURE_RAMPART);
    });

    if (rampartCandidates.length === 0) {
        return null;
    }

    rampartCandidates.sort(function (left, right) {
        const leftDistance = getChebyshevRange(primarySpawn.pos, left);
        const rightDistance = getChebyshevRange(primarySpawn.pos, right);

        if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
        }

        if (left.x !== right.x) {
            return left.x - right.x;
        }

        return left.y - right.y;
    });

    return rampartCandidates[0];
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
