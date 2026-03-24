const constants = require("./constants");
const movement = require("./movement");
const resourceManager = require("./resource.manager");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");

const PRIMARY_ANCHOR_MIN_COORD = 4;
const PRIMARY_ANCHOR_MAX_COORD = 45;
const FALLBACK_ANCHOR_MIN_COORD = 2;
const FALLBACK_ANCHOR_MAX_COORD = 47;
const MIN_OPEN_NEIGHBORS = 6;

function run(creep, task) {
    if (!isValidBootstrapSpawnTask(task) || !creep || typeof creep.moveTo !== "function") {
        return true;
    }

    if (hasOwnedSpawnInRoom(task.data.targetRoomName)) {
        return true;
    }

    if (!creep.room || creep.room.name !== task.data.targetRoomName) {
        task.data.stage = constants.bootstrapSpawnTaskStages.MOVE;
        movement.moveTo(creep, new RoomPosition(25, 25, task.data.targetRoomName));
        return false;
    }

    const room = creep.room;
    const targetPos = resolveTargetPos(room, task);

    if (!targetPos) {
        return false;
    }

    if (!ensureSpawnSite(room, task, targetPos)) {
        return false;
    }

    if (hasOwnedSpawnInRoom(task.data.targetRoomName)) {
        return true;
    }

    const spawnSite = findOwnedSpawnSiteAt(room, targetPos);

    if (!spawnSite) {
        task.data.stage = constants.bootstrapSpawnTaskStages.COLLECT;
        return false;
    }

    if (task.data.stage === constants.bootstrapSpawnTaskStages.COLLECT) {
        return runCollectStage(creep, task);
    }

    if (task.data.stage === constants.bootstrapSpawnTaskStages.BUILD) {
        return runBuildStage(creep, task, spawnSite);
    }
}

function ensureBootstrapSpawnTask(originRoomName, targetRoomName) {
    if (
        typeof originRoomName !== "string" ||
        typeof targetRoomName !== "string" ||
        hasOwnedSpawnInRoom(targetRoomName)
    ) {
        return null;
    }

    const existingTask = findBootstrapSpawnTask(targetRoomName);

    if (existingTask) {
        return existingTask;
    }

    const taskId = taskStore.nextTaskId(constants.taskTypes.BOOTSTRAP_SPAWN);
    const task = {
        id: taskId,
        type: constants.taskTypes.BOOTSTRAP_SPAWN,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: {
            originRoomName: originRoomName,
            targetRoomName: targetRoomName,
            targetPos: null,
            stage: constants.bootstrapSpawnTaskStages.MOVE,
        },
    };

    taskStore.addTask(task);
    return task;
}

function canExecute(executor, task) {
    return Boolean(
        validate(task) &&
        executor &&
        executor.memory &&
        typeof executor.moveTo === "function" &&
        typeof executor.build === "function" &&
        executor.memory.originRoomName === task.data.originRoomName
    );
}

function runCollectStage(creep, task) {
    task.data.stage = constants.bootstrapSpawnTaskStages.COLLECT;

    if (resourceManager.getFreeEnergyCapacity(creep) === 0) {
        task.data.stage = constants.bootstrapSpawnTaskStages.BUILD;
        return false;
    }

    const sourceSelection = resourceManager.findBestEnergySource(
        creep,
        resourceManager.getFreeEnergyCapacity(creep)
    );

    if (!sourceSelection || !sourceSelection.object) {
        if (resourceManager.getUsedEnergy(creep) > 0) {
            task.data.stage = constants.bootstrapSpawnTaskStages.BUILD;
        }

        return false;
    }

    const result = collectFromSource(creep, sourceSelection.type, sourceSelection.object);

    if (result === OK) {
        resourceManager.invalidateResourcePlanCache();

        if (resourceManager.getFreeEnergyCapacity(creep) === 0) {
            task.data.stage = constants.bootstrapSpawnTaskStages.BUILD;
        }

        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, sourceSelection.object);
        return false;
    }

    if (result === ERR_FULL) {
        task.data.stage = constants.bootstrapSpawnTaskStages.BUILD;
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        if (resourceManager.getUsedEnergy(creep) > 0) {
            task.data.stage = constants.bootstrapSpawnTaskStages.BUILD;
        }

        return false;
    }

    return false;
}

function runBuildStage(creep, task, spawnSite) {
    task.data.stage = constants.bootstrapSpawnTaskStages.BUILD;

    if (resourceManager.getUsedEnergy(creep) <= 0) {
        task.data.stage = constants.bootstrapSpawnTaskStages.COLLECT;
        return false;
    }

    if (!spawnSite) {
        task.data.stage = constants.bootstrapSpawnTaskStages.COLLECT;
        return false;
    }

    const result = creep.build(spawnSite);

    if (result === OK) {
        resourceManager.invalidateResourcePlanCache();
        return false;
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, spawnSite);
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        task.data.stage = constants.bootstrapSpawnTaskStages.COLLECT;
        return false;
    }

    if (result === ERR_INVALID_TARGET) {
        return hasOwnedSpawnInRoom(task.data.targetRoomName);
    }

    return false;
}

function resolveTargetPos(room, task) {
    const existingSpawnSite = findOwnedSpawnSite(room);

    if (existingSpawnSite) {
        task.data.targetPos = serializePosition(existingSpawnSite.pos);
        return task.data.targetPos;
    }

    if (isValidTargetPos(room, task.data.targetPos)) {
        return task.data.targetPos;
    }

    const targetPos =
        findBestAnchor(room, PRIMARY_ANCHOR_MIN_COORD, PRIMARY_ANCHOR_MAX_COORD) ||
        findBestAnchor(room, FALLBACK_ANCHOR_MIN_COORD, FALLBACK_ANCHOR_MAX_COORD);

    task.data.targetPos = targetPos || null;
    return task.data.targetPos;
}

function ensureSpawnSite(room, task, targetPos) {
    if (findOwnedSpawnAt(room, targetPos) || findOwnedSpawnSiteAt(room, targetPos)) {
        return true;
    }

    const result = room.createConstructionSite(targetPos.x, targetPos.y, STRUCTURE_SPAWN);

    if (result === OK) {
        return true;
    }

    if (result === ERR_INVALID_TARGET) {
        task.data.targetPos = null;
    }

    return false;
}

function findBestAnchor(room, minCoord, maxCoord) {
    const candidates = [];

    for (let x = minCoord; x <= maxCoord; x += 1) {
        for (let y = minCoord; y <= maxCoord; y += 1) {
            const position = {
                roomName: room.name,
                x: x,
                y: y,
            };

            if (!isValidTargetPos(room, position)) {
                continue;
            }

            candidates.push({
                position: position,
                neighborCount: countWalkableNeighbors(room, position),
                score: getAnchorScore(room, position),
                edgeDistance: getEdgeDistance(position),
            });
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    const openCandidates = candidates.filter(function (candidate) {
        return candidate.neighborCount >= MIN_OPEN_NEIGHBORS;
    });
    const usableCandidates = openCandidates.length > 0 ? openCandidates : candidates;

    usableCandidates.sort(compareAnchorCandidates);
    return usableCandidates[0].position;
}

function compareAnchorCandidates(left, right) {
    if (left.score !== right.score) {
        return left.score - right.score;
    }

    if (left.neighborCount !== right.neighborCount) {
        return right.neighborCount - left.neighborCount;
    }

    if (left.edgeDistance !== right.edgeDistance) {
        return right.edgeDistance - left.edgeDistance;
    }

    if (left.position.x !== right.position.x) {
        return left.position.x - right.position.x;
    }

    return left.position.y - right.position.y;
}

function getAnchorScore(room, position) {
    let score = 0;

    if (room.controller && room.controller.pos) {
        score += getRange(room.controller.pos, position);
    }

    for (const source of room.find(FIND_SOURCES)) {
        score += getRange(source.pos, position);
    }

    return score;
}

function countWalkableNeighbors(room, position) {
    let count = 0;

    for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
            if (dx === 0 && dy === 0) {
                continue;
            }

            if (isWalkableNeighbor(room, position.x + dx, position.y + dy)) {
                count += 1;
            }
        }
    }

    return count;
}

function isWalkableNeighbor(room, x, y) {
    if (!isInsideRoom(x, y)) {
        return false;
    }

    if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) {
        return false;
    }

    if (isSourceTile(room, x, y) || isMineralTile(room, x, y) || isControllerTile(room, x, y)) {
        return false;
    }

    if (hasBlockingStructureAt(room, x, y)) {
        return false;
    }

    if (hasBlockingConstructionSiteAt(room, x, y)) {
        return false;
    }

    return true;
}

function isValidTargetPos(room, position) {
    if (
        !position ||
        position.roomName !== room.name ||
        typeof position.x !== "number" ||
        typeof position.y !== "number" ||
        !isInsideRoom(position.x, position.y)
    ) {
        return false;
    }

    if (findOwnedSpawnAt(room, position) || findOwnedSpawnSiteAt(room, position)) {
        return true;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    if (isSourceTile(room, position.x, position.y)) {
        return false;
    }

    if (isMineralTile(room, position.x, position.y)) {
        return false;
    }

    if (isControllerTile(room, position.x, position.y)) {
        return false;
    }

    if (isReservedMinerPos(room.name, position.x, position.y)) {
        return false;
    }

    if (hasAnyStructureAt(room, position.x, position.y)) {
        return false;
    }

    if (hasAnyConstructionSiteAt(room, position.x, position.y)) {
        return false;
    }

    return true;
}

function hasOwnedSpawnInRoom(roomName) {
    if (typeof roomName !== "string") {
        return false;
    }

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.my && spawn.room && spawn.room.name === roomName) {
            return true;
        }
    }

    return false;
}

function findOwnedSpawn(room) {
    const spawns = room.find(FIND_MY_SPAWNS);
    return spawns.length > 0 ? spawns[0] : null;
}

function findOwnedSpawnAt(room, position) {
    if (!room || !position) {
        return null;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_SPAWN && structure.my) {
            return structure;
        }
    }

    return null;
}

function findOwnedSpawnSite(room) {
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: function (site) {
            return site.structureType === STRUCTURE_SPAWN;
        },
    });

    return sites.length > 0 ? sites[0] : null;
}

function findOwnedSpawnSiteAt(room, position) {
    if (!room || !position) {
        return null;
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_SPAWN && site.my) {
            return site;
        }
    }

    return null;
}

function hasAnyStructureAt(room, x, y) {
    return room.lookForAt(LOOK_STRUCTURES, x, y).length > 0;
}

function hasAnyConstructionSiteAt(room, x, y) {
    return room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0;
}

function hasBlockingStructureAt(room, x, y) {
    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (isBlockingStructure(structure)) {
            return true;
        }
    }

    return false;
}

function hasBlockingConstructionSiteAt(room, x, y) {
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);

    for (const site of sites) {
        if (isBlockingConstructionSite(site)) {
            return true;
        }
    }

    return false;
}

function isBlockingStructure(structure) {
    if (!structure || !structure.structureType) {
        return false;
    }

    if (
        structure.structureType === STRUCTURE_ROAD ||
        structure.structureType === STRUCTURE_CONTAINER
    ) {
        return false;
    }

    if (structure.structureType === STRUCTURE_RAMPART) {
        return !structure.my && !structure.isPublic;
    }

    return true;
}

function isBlockingConstructionSite(site) {
    if (!site || !site.structureType) {
        return false;
    }

    return (
        site.structureType !== STRUCTURE_ROAD &&
        site.structureType !== STRUCTURE_CONTAINER &&
        site.structureType !== STRUCTURE_RAMPART
    );
}

function isSourceTile(room, x, y) {
    return room.lookForAt(LOOK_SOURCES, x, y).length > 0;
}

function isMineralTile(room, x, y) {
    return room.lookForAt(LOOK_MINERALS, x, y).length > 0;
}

function isControllerTile(room, x, y) {
    return Boolean(room.controller && room.controller.pos.x === x && room.controller.pos.y === y);
}

function isReservedMinerPos(roomName, x, y) {
    if (!Memory.sources) {
        return false;
    }

    for (const sourceId in Memory.sources) {
        const sourceMemory = Memory.sources[sourceId];
        const minerPos = sourceMemory && sourceMemory.minerPos;

        if (
            minerPos &&
            minerPos.roomName === roomName &&
            minerPos.x === x &&
            minerPos.y === y
        ) {
            return true;
        }
    }

    return false;
}

function collectFromSource(creep, sourceType, source) {
    if (sourceType === constants.transferEnergySourceTypes.SOURCE) {
        return creep.harvest(source);
    }

    if (sourceType === constants.transferEnergySourceTypes.PILE) {
        return creep.pickup(source);
    }

    if (sourceType === constants.transferEnergySourceTypes.CONTAINER) {
        return creep.withdraw(source, RESOURCE_ENERGY);
    }

    return ERR_INVALID_TARGET;
}

function getRange(leftPos, rightPos) {
    return Math.max(
        Math.abs(leftPos.x - rightPos.x),
        Math.abs(leftPos.y - rightPos.y)
    );
}

function getEdgeDistance(position) {
    return Math.min(position.x, position.y, 49 - position.x, 49 - position.y);
}

function isInsideRoom(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function serializePosition(position) {
    return {
        roomName: position.roomName,
        x: position.x,
        y: position.y,
    };
}

function findBootstrapSpawnTask(targetRoomName) {
    let matchedTask = null;
    const removedTaskIds = [];

    for (const task of taskIndex.getTasksByType(constants.taskTypes.BOOTSTRAP_SPAWN)) {
        if (
            task.data.targetRoomName !== targetRoomName ||
            (
                task.status !== constants.taskStatuses.PENDING &&
                task.status !== constants.taskStatuses.IN_PROGRESS
            )
        ) {
            continue;
        }

        if (!matchedTask) {
            matchedTask = task;
            continue;
        }

        removedTaskIds.push(task.id);
    }

    if (removedTaskIds.length > 0) {
        taskStore.removeTasks(removedTaskIds, {
            clearAssignments: true,
        });
    }

    return matchedTask;
}

function isValidBootstrapSpawnTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.BOOTSTRAP_SPAWN &&
        task.data &&
        typeof task.data.originRoomName === "string" &&
        typeof task.data.targetRoomName === "string" &&
        typeof task.data.stage === "string" &&
        (
            task.data.targetPos === null ||
            (
                task.data.targetPos &&
                typeof task.data.targetPos.roomName === "string" &&
                typeof task.data.targetPos.x === "number" &&
                typeof task.data.targetPos.y === "number"
            )
        )
    );
}

function validate(task) {
    return isValidBootstrapSpawnTask(task);
}

function getOwnerRoom(task) {
    return validate(task) ? task.data.originRoomName : null;
}

module.exports = {
    canExecute,
    ensureBootstrapSpawnTask,
    getOwnerRoom,
    run,
    validate,
};
