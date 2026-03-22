const sourceManager = require("./source.manager");

const EXTENSION_SEARCH_RANGE = 8;
const EXTENSION_MIN_COORD = 2;
const EXTENSION_MAX_COORD = 47;
const ROAD_HALF_WIDTH = 1;
const ROAD_PLAIN_COST = 2;
const ROAD_SWAMP_COST = 10;

function refreshManagedConstruction() {
    for (const roomName of getManagedRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room || !room.controller || !room.controller.my) {
            continue;
        }

        refreshRoomConstruction(room);
    }
}

function refreshRoomConstruction(room) {
    if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
        return;
    }
    if (ensureExtensionSite(room)) {
        return;
    }

    if (ensureSourceContainerSite(room)) {
        return;
    }

    if (ensureRoadSite(room)) {
        return;
    }

}

function ensureSourceContainerSite(room) {
    const minerSources = sourceManager.getMinerSourcesForRoom(room.name);

    for (const sourceData of minerSources) {
        if (!sourceData || !sourceData.minerPos) {
            continue;
        }

        if (hasStructureOrSiteAt(room, sourceData.minerPos, STRUCTURE_CONTAINER)) {
            continue;
        }

        if (!canPlaceContainerAt(room, sourceData.minerPos)) {
            continue;
        }

        const result = room.createConstructionSite(
            sourceData.minerPos.x,
            sourceData.minerPos.y,
            STRUCTURE_CONTAINER
        );

        if (result === OK) {
            console.log(
                `construction planned ${STRUCTURE_CONTAINER} at ` +
                `${room.name} (${sourceData.minerPos.x},${sourceData.minerPos.y})`
            );
            return true;
        }
    }

    return false;
}

function ensureExtensionSite(room) {
    const extensionLimit = getStructureLimit(STRUCTURE_EXTENSION, room.controller.level);

    if (extensionLimit <= 0) {
        return false;
    }

    const currentExtensionCount = countRoomStructuresAndSites(room, STRUCTURE_EXTENSION);

    if (currentExtensionCount >= extensionLimit) {
        return false;
    }

    const anchor = chooseExtensionAnchor(room);

    if (!anchor) {
        return false;
    }

    const reservedPositions = getReservedPositions(room);

    for (const position of getExtensionCandidatePositions(anchor.pos)) {
        if (!canPlaceExtensionAt(room, position, reservedPositions)) {
            continue;
        }

        const result = room.createConstructionSite(position.x, position.y, STRUCTURE_EXTENSION);

        if (result === OK) {
            console.log(
                `construction planned ${STRUCTURE_EXTENSION} at ` +
                `${room.name} (${position.x},${position.y})`
            );
            return true;
        }
    }

    return false;
}

function ensureRoadSite(room) {
    const anchor = chooseRoadAnchor(room);

    if (!anchor) {
        return false;
    }

    for (const target of getRoadTargets(room)) {
        const path = findRoadPath(room, anchor.pos, target.pos, target.range);

        if (path.length === 0) {
            continue;
        }

        for (const position of getWideRoadPositions(path)) {
            if (!canPlaceRoadAt(room, position)) {
                continue;
            }

            const result = room.createConstructionSite(position.x, position.y, STRUCTURE_ROAD);

            if (result === OK) {
                console.log(
                    `construction planned ${STRUCTURE_ROAD} at ` +
                    `${room.name} (${position.x},${position.y})`
                );
                return true;
            }
        }
    }

    return false;
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

function hasStructureOrSiteAt(room, position, structureType) {
    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (structure.structureType === structureType) {
            return true;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (site.structureType === structureType) {
            return true;
        }
    }

    return false;
}

function canPlaceContainerAt(room, position) {
    if (!position || position.roomName !== room.name) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_RAMPART &&
            structure.structureType !== STRUCTURE_CONTAINER
        ) {
            return false;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (
            site.structureType !== STRUCTURE_ROAD &&
            site.structureType !== STRUCTURE_RAMPART &&
            site.structureType !== STRUCTURE_CONTAINER
        ) {
            return false;
        }
    }

    return true;
}

function countRoomStructuresAndSites(room, structureType) {
    let count = 0;

    for (const structure of room.find(FIND_MY_STRUCTURES)) {
        if (structure.structureType === structureType) {
            count += 1;
        }
    }

    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType === structureType) {
            count += 1;
        }
    }

    return count;
}

function chooseExtensionAnchor(room) {
    const spawns = room.find(FIND_MY_SPAWNS);

    if (spawns.length === 0) {
        return null;
    }

    return spawns[0];
}

function chooseRoadAnchor(room) {
    return chooseExtensionAnchor(room);
}

function getRoadTargets(room) {
    const targets = [];
    const minerSources = sourceManager.getMinerSourcesForRoom(room.name);

    for (const sourceData of minerSources) {
        if (!sourceData || !sourceData.minerPos) {
            continue;
        }

        targets.push({
            pos: createRoomPosition(sourceData.minerPos),
            range: 1,
        });
    }

    if (room.controller && room.controller.my) {
        targets.push({
            pos: room.controller.pos,
            range: 1,
        });
    }

    return targets;
}

function getReservedPositions(room) {
    const reservedPositions = {};
    const minerSources = sourceManager.getMinerSourcesForRoom(room.name);

    for (const sourceData of minerSources) {
        if (!sourceData || !sourceData.minerPos) {
            continue;
        }

        reservedPositions[buildPositionKey(sourceData.minerPos)] = true;
    }

    return reservedPositions;
}

function getExtensionCandidatePositions(anchorPos) {
    const positions = [];

    for (let range = 2; range <= EXTENSION_SEARCH_RANGE; range += 1) {
        for (let dx = -range; dx <= range; dx += 1) {
            for (let dy = -range; dy <= range; dy += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== range) {
                    continue;
                }

                const x = anchorPos.x + dx;
                const y = anchorPos.y + dy;

                if (!isInsideExtensionBounds(x, y)) {
                    continue;
                }

                if ((x + y) % 2 !== 0) {
                    continue;
                }

                positions.push({
                    x: x,
                    y: y,
                    roomName: anchorPos.roomName,
                });
            }
        }
    }

    return positions;
}

function findRoadPath(room, origin, target, range) {
    if (!origin || !target) {
        return [];
    }

    const result = PathFinder.search(
        origin,
        {
            pos: target,
            range: range,
        },
        {
            plainCost: ROAD_PLAIN_COST,
            swampCost: ROAD_SWAMP_COST,
            roomCallback: function (roomName) {
                if (roomName !== room.name) {
                    return false;
                }

                return buildRoadCostMatrix(room);
            },
        }
    );

    return result.path || [];
}

function getWideRoadPositions(path) {
    const positions = [];
    const seenPositions = {};

    for (let index = 0; index < path.length; index += 1) {
        const previous = index > 0 ? path[index - 1] : null;
        const current = path[index];
        const next = index < path.length - 1 ? path[index + 1] : null;

        for (const position of getRoadStripePositions(previous, current, next)) {
            const key = buildPositionKey(position);

            if (seenPositions[key]) {
                continue;
            }

            seenPositions[key] = true;
            positions.push(position);
        }
    }

    return positions;
}

function getRoadStripePositions(previous, current, next) {
    if (!current) {
        return [];
    }

    const positions = [current];
    const offsets = {};

    addPerpendicularOffsets(offsets, getStepDirection(previous, current));
    addPerpendicularOffsets(offsets, getStepDirection(current, next));

    for (const key in offsets) {
        const offset = offsets[key];
        const position = {
            x: current.x + offset.x,
            y: current.y + offset.y,
            roomName: current.roomName,
        };

        if (!isInsideRoom(position.x, position.y)) {
            continue;
        }

        positions.push(position);
    }

    return positions;
}

function addPerpendicularOffsets(offsets, direction) {
    if (!direction) {
        return;
    }

    const left = {
        x: -direction.dy * ROAD_HALF_WIDTH,
        y: direction.dx * ROAD_HALF_WIDTH,
    };
    const right = {
        x: direction.dy * ROAD_HALF_WIDTH,
        y: -direction.dx * ROAD_HALF_WIDTH,
    };

    offsets[buildOffsetKey(left)] = left;
    offsets[buildOffsetKey(right)] = right;
}

function getStepDirection(origin, target) {
    if (!origin || !target) {
        return null;
    }

    const dx = normalizeStep(target.x - origin.x);
    const dy = normalizeStep(target.y - origin.y);

    if (dx === 0 && dy === 0) {
        return null;
    }

    return {
        dx: dx,
        dy: dy,
    };
}

function normalizeStep(delta) {
    if (delta === 0) {
        return 0;
    }

    return delta > 0 ? 1 : -1;
}

function canPlaceExtensionAt(room, position, reservedPositions) {
    if (!position || position.roomName !== room.name) {
        return false;
    }

    if (!isInsideExtensionBounds(position.x, position.y)) {
        return false;
    }

    if (reservedPositions[buildPositionKey(position)]) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    if (room.lookForAt(LOOK_STRUCTURES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_SOURCES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_MINERALS, position.x, position.y).length > 0) {
        return false;
    }

    if (room.controller && room.controller.pos.x === position.x && room.controller.pos.y === position.y) {
        return false;
    }

    return true;
}

function canPlaceRoadAt(room, position) {
    if (
        !position ||
        position.roomName !== room.name ||
        !isInsideRoom(position.x, position.y)
    ) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_ROAD) {
            return false;
        }

        if (
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART
        ) {
            return false;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (site.structureType === STRUCTURE_ROAD) {
            return false;
        }

        if (
            site.structureType !== STRUCTURE_CONTAINER &&
            site.structureType !== STRUCTURE_RAMPART
        ) {
            return false;
        }
    }

    if (room.lookForAt(LOOK_SOURCES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_MINERALS, position.x, position.y).length > 0) {
        return false;
    }

    if (room.controller && room.controller.pos.x === position.x && room.controller.pos.y === position.y) {
        return false;
    }

    return true;
}

function buildRoadCostMatrix(room) {
    const costs = new PathFinder.CostMatrix();

    for (const structure of room.find(FIND_STRUCTURES)) {
        if (structure.structureType === STRUCTURE_ROAD) {
            costs.set(structure.pos.x, structure.pos.y, 1);
            continue;
        }

        if (structure.structureType === STRUCTURE_CONTAINER) {
            continue;
        }

        if (structure.structureType === STRUCTURE_RAMPART && structure.my) {
            continue;
        }

        costs.set(structure.pos.x, structure.pos.y, 0xff);
    }

    for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
        if (
            site.structureType === STRUCTURE_ROAD ||
            site.structureType === STRUCTURE_CONTAINER ||
            site.structureType === STRUCTURE_RAMPART
        ) {
            continue;
        }

        costs.set(site.pos.x, site.pos.y, 0xff);
    }

    return costs;
}

function isInsideExtensionBounds(x, y) {
    return (
        x >= EXTENSION_MIN_COORD &&
        x <= EXTENSION_MAX_COORD &&
        y >= EXTENSION_MIN_COORD &&
        y <= EXTENSION_MAX_COORD
    );
}

function getStructureLimit(structureType, controllerLevel) {
    if (
        typeof CONTROLLER_STRUCTURES === "undefined" ||
        !CONTROLLER_STRUCTURES[structureType] ||
        typeof CONTROLLER_STRUCTURES[structureType][controllerLevel] !== "number"
    ) {
        return 0;
    }

    return CONTROLLER_STRUCTURES[structureType][controllerLevel];
}

function buildPositionKey(position) {
    return `${position.roomName}:${position.x}:${position.y}`;
}

function buildOffsetKey(offset) {
    return `${offset.x}:${offset.y}`;
}

function isInsideRoom(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function createRoomPosition(position) {
    if (
        !position ||
        typeof position.x !== "number" ||
        typeof position.y !== "number" ||
        typeof position.roomName !== "string"
    ) {
        return null;
    }

    return new RoomPosition(position.x, position.y, position.roomName);
}

module.exports = {
    refreshManagedConstruction,
};
