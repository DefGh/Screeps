function selectStorageTile(room) {
    if (!room) {
        return null;
    }

    const center = new RoomPosition(25, 25, room.name);
    const terrain = new Room.Terrain(room.name);
    const candidates = [];

    for (let x = 1; x <= 48; x += 1) {
        for (let y = 1; y <= 48; y += 1) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                continue;
            }

            if (!isWalkableStorageTile(room, x, y)) {
                continue;
            }

            candidates.push({
                range: center.getRangeTo(x, y),
                x: x,
                y: y,
            });
        }
    }

    candidates.sort(function (left, right) {
        if (left.range !== right.range) {
            return left.range - right.range;
        }

        if (left.x !== right.x) {
            return left.x - right.x;
        }

        return left.y - right.y;
    });

    if (candidates.length === 0) {
        return null;
    }

    return {
        roomName: room.name,
        x: candidates[0].x,
        y: candidates[0].y,
    };
}

function isWalkableStorageTile(room, x, y) {
    if (occupiesReservedTile(room.controller, x, y)) {
        return false;
    }

    for (const source of room.find(FIND_SOURCES)) {
        if (occupiesReservedTile(source, x, y)) {
            return false;
        }
    }

    for (const mineral of room.find(FIND_MINERALS)) {
        if (occupiesReservedTile(mineral, x, y)) {
            return false;
        }
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_RAMPART
        ) {
            return false;
        }
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);

    for (const site of sites) {
        if (
            site.structureType !== STRUCTURE_ROAD &&
            site.structureType !== STRUCTURE_RAMPART &&
            site.structureType !== STRUCTURE_STORAGE
        ) {
            return false;
        }
    }

    return true;
}

function occupiesReservedTile(target, x, y) {
    return !!(
        target &&
        target.pos &&
        target.pos.x === x &&
        target.pos.y === y
    );
}

module.exports = {
    selectStorageTile,
};
