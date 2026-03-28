function selectMiningAnchor(room, source) {
    const containers = source.pos.findInRange(FIND_STRUCTURES, 1).filter(function (structure) {
        return structure.structureType === STRUCTURE_CONTAINER;
    });

    if (containers.length > 0) {
        const container = containers.sort(compareByPosition)[0];
        return toAnchor(container.pos);
    }

    const sites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).filter(function (site) {
        return site.structureType === STRUCTURE_CONTAINER;
    });

    if (sites.length > 0) {
        const site = sites.sort(compareByPosition)[0];
        return toAnchor(site.pos);
    }

    return selectWalkableAnchor(room, source);
}

function selectWalkableAnchor(room, source) {
    const terrain = new Room.Terrain(room.name);
    const candidates = [];
    const nearestSpawn = pickClosestToPosition(source.pos, room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    }));

    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x += 1) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y += 1) {
            if ((x === source.pos.x && y === source.pos.y) || x < 0 || y < 0 || x > 49 || y > 49) {
                continue;
            }

            if (terrain.get(x, y) === TERRAIN_MASK_WALL || hasBlockingStructure(room, x, y)) {
                continue;
            }

            candidates.push(new RoomPosition(x, y, room.name));
        }
    }

    candidates.sort(function (left, right) {
        const leftDistance = nearestSpawn ? left.getRangeTo(nearestSpawn.pos) : 0;
        const rightDistance = nearestSpawn ? right.getRangeTo(nearestSpawn.pos) : 0;

        if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
        }

        return compareByPosition({ pos: left }, { pos: right });
    });

    if (candidates.length === 0) {
        return toAnchor(source.pos);
    }

    return toAnchor(candidates[0]);
}

function hasBlockingStructure(room, x, y) {
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_ROAD
        ) {
            return true;
        }
    }

    return false;
}

function pickClosestToPosition(position, targets) {
    if (targets.length === 0) {
        return null;
    }

    return targets.sort(function (left, right) {
        const leftDistance = position.getRangeTo(left.pos);
        const rightDistance = position.getRangeTo(right.pos);

        if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
        }

        return compareByPosition(left, right);
    })[0];
}

function compareByPosition(left, right) {
    if (left.pos.x !== right.pos.x) {
        return left.pos.x - right.pos.x;
    }

    return left.pos.y - right.pos.y;
}

function toAnchor(position) {
    return {
        roomName: position.roomName,
        x: position.x,
        y: position.y,
    };
}

module.exports = {
    selectMiningAnchor,
};
