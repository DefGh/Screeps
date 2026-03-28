const constants = require("./constants");
const miningAnchors = require("./planner.mining_anchors");
const planner = require("./planner.spawn_rings");

function onCompleted() {
}

function tryDispatch(task, room, ctx) {
    if (
        task.type !== constants.taskTypes.SYNC_ROADS ||
        ctx.executorType !== "room" ||
        room.name !== task.room ||
        !room.controller ||
        !room.controller.my
    ) {
        return [];
    }

    if (!canPlaceRoads(room)) {
        ctx.removeTask(task.id);
        return [];
    }

    const primarySpawn = planner.getPrimarySpawn(room);

    if (!primarySpawn) {
        return [];
    }

    const activePlacementActions =
        planner.getActivePlacementActions(task, STRUCTURE_ROAD);

    if (Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) {
        return [];
    }

    if (activePlacementActions.length > 0) {
        return [];
    }

    const roadPlan = buildRoadPlan(room, primarySpawn, activePlacementActions);
    const nextTile = pickNextUnplannedTile(room, roadPlan.tiles, activePlacementActions);

    if (!nextTile) {
        if (roadPlan.hasUnresolvedRoute) {
            return [];
        }

        ctx.removeTask(task.id);
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: room.name,
                structureType: STRUCTURE_ROAD,
                x: nextTile.x,
                y: nextTile.y,
            },
        },
    ];
}

function canPlaceRoads(room) {
    return (CONTROLLER_STRUCTURES[STRUCTURE_ROAD][room.controller.level] || 0) > 0;
}

function buildRoadPlan(room, primarySpawn, activePlacementActions) {
    const tiles = [];
    const seen = {};
    const protectedKeys = getProtectedKeys(room, primarySpawn);
    let hasUnresolvedRoute = false;

    for (const target of getRoadTargets(room)) {
        const result = PathFinder.search(
            primarySpawn.pos,
            {
                pos: target.pos,
                range: target.range,
            },
            {
                plainCost: 1,
                swampCost: 1,
                maxRooms: 1,
                roomCallback: function (roomName) {
                    if (roomName !== room.name) {
                        return false;
                    }

                    return createRoadCostMatrix(room, primarySpawn);
                },
            }
        );

        if (result.incomplete) {
            hasUnresolvedRoute = true;
            continue;
        }

        for (const position of result.path) {
            const key = positionKey(position.x, position.y);

            if (protectedKeys[key] || seen[key]) {
                continue;
            }

            seen[key] = true;
            tiles.push({
                roomName: position.roomName,
                x: position.x,
                y: position.y,
            });
        }
    }

    return {
        hasUnresolvedRoute: hasUnresolvedRoute,
        tiles: tiles,
    };
}

function getRoadTargets(room) {
    const targets = [];
    const sources = room.find(FIND_SOURCES).slice();

    sources.sort(function (left, right) {
        if (left.pos.x !== right.pos.x) {
            return left.pos.x - right.pos.x;
        }

        if (left.pos.y !== right.pos.y) {
            return left.pos.y - right.pos.y;
        }

        return String(left.id).localeCompare(String(right.id));
    });

    for (const source of sources) {
        const anchor = miningAnchors.selectMiningAnchor(room, source);

        targets.push({
            pos: new RoomPosition(anchor.x, anchor.y, anchor.roomName),
            range: 1,
        });
    }

    targets.push({
        pos: room.controller.pos,
        range: 1,
    });

    return targets;
}

function getProtectedKeys(room, primarySpawn) {
    const keys = {};

    keys[positionKey(primarySpawn.pos.x, primarySpawn.pos.y)] = true;
    keys[positionKey(room.controller.pos.x, room.controller.pos.y)] = true;

    for (const source of room.find(FIND_SOURCES)) {
        keys[positionKey(source.pos.x, source.pos.y)] = true;

        const anchor = miningAnchors.selectMiningAnchor(room, source);
        keys[positionKey(anchor.x, anchor.y)] = true;
    }

    return keys;
}

function createRoadCostMatrix(room, primarySpawn) {
    const matrix = new PathFinder.CostMatrix();
    const terrain = new Room.Terrain(room.name);

    for (let x = 0; x <= 49; x += 1) {
        for (let y = 0; y <= 49; y += 1) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                matrix.set(x, y, 255);
            }
        }
    }

    const structures = room.find(FIND_STRUCTURES);

    for (const structure of structures) {
        if (
            structure.pos.x === primarySpawn.pos.x &&
            structure.pos.y === primarySpawn.pos.y
        ) {
            continue;
        }

        if (
            structure.structureType === STRUCTURE_ROAD ||
            structure.structureType === STRUCTURE_RAMPART ||
            structure.structureType === STRUCTURE_CONTAINER
        ) {
            continue;
        }

        matrix.set(structure.pos.x, structure.pos.y, 255);
    }

    const sites = room.find(FIND_CONSTRUCTION_SITES);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_ROAD) {
            continue;
        }

        matrix.set(site.pos.x, site.pos.y, 255);
    }

    return matrix;
}

function pickNextUnplannedTile(room, tiles, activePlacementActions) {
    const activeKeys = {};

    for (const action of activePlacementActions) {
        activeKeys[positionKey(action.data.x, action.data.y)] = true;
    }

    for (const tile of tiles) {
        if (!isRoadTileSatisfied(room, tile, activeKeys)) {
            return tile;
        }
    }

    return null;
}

function isRoadTileSatisfied(room, tile, activeKeys) {
    if (activeKeys[positionKey(tile.x, tile.y)]) {
        return true;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, tile.x, tile.y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_ROAD) {
            return true;
        }
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, tile.x, tile.y);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_ROAD) {
            return true;
        }
    }

    return false;
}

function positionKey(x, y) {
    return `${x}:${y}`;
}

module.exports = {
    onCompleted,
    tryDispatch,
};
