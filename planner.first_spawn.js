function findFirstSpawnPosition(room) {
    if (!room || !room.controller) {
        return null;
    }

    const terrain = new Room.Terrain(room.name);
    const anchors = [room.controller].concat(room.find(FIND_SOURCES));
    let bestCandidate = null;

    for (let x = 1; x <= 48; x += 1) {
        for (let y = 1; y <= 48; y += 1) {
            if (!isValidTile(room, terrain, x, y)) {
                continue;
            }

            const score = scoreTile(anchors, x, y);
            const candidate = {
                maxDistance: score.maxDistance,
                score: score.totalDistance,
                x: x,
                y: y,
            };

            if (isBetterCandidate(candidate, bestCandidate)) {
                bestCandidate = candidate;
            }
        }
    }

    return bestCandidate;
}

function isValidTile(room, terrain, x, y) {
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

    return !hasBlockingStructure(room, x, y) && !hasBlockingSite(room, x, y);
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

function scoreTile(anchors, x, y) {
    let totalDistance = 0;
    let maxDistance = 0;

    for (const anchor of anchors) {
        const distance = getChebyshevDistance(anchor.pos.x, anchor.pos.y, x, y);
        totalDistance += distance;
        maxDistance = Math.max(maxDistance, distance);
    }

    return {
        maxDistance: maxDistance,
        totalDistance: totalDistance,
    };
}

function isBetterCandidate(candidate, bestCandidate) {
    if (!bestCandidate) {
        return true;
    }

    if (candidate.score !== bestCandidate.score) {
        return candidate.score < bestCandidate.score;
    }

    if (candidate.maxDistance !== bestCandidate.maxDistance) {
        return candidate.maxDistance < bestCandidate.maxDistance;
    }

    if (candidate.x !== bestCandidate.x) {
        return candidate.x < bestCandidate.x;
    }

    return candidate.y < bestCandidate.y;
}

function getChebyshevDistance(leftX, leftY, rightX, rightY) {
    return Math.max(
        Math.abs(leftX - rightX),
        Math.abs(leftY - rightY)
    );
}

module.exports = {
    findFirstSpawnPosition,
};
