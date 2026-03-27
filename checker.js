const constants = require("./constants");

const CHECK_INTERVAL = 50;
const cycleActionTypes = [
    constants.actionTypes.SYNC_MINING_OPERATIONS,
    constants.actionTypes.SYNC_ROOM_BUILDER,
    constants.actionTypes.CHECK_UNIVERSALS,
    constants.actionTypes.CHECK_FILL_SPAWN,
    constants.actionTypes.CHECK_FILL_EXTENSION,
    constants.actionTypes.CHECK_FILL_TOWER,
    constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT,
];

function getCycleActionType(index) {
    return cycleActionTypes[index] || cycleActionTypes[0];
}

function getCycleLength() {
    return cycleActionTypes.length;
}

function checkUniversalCount(room, ctx) {
    const roomState = getRoomState(room.name);
    const currentCount = countUniversals(room.name, ctx);

    if (currentCount >= roomState.universalTargetCount) {
        return;
    }

    const missingCount = roomState.universalTargetCount - currentCount;

    for (let index = 0; index < missingCount; index += 1) {
        ctx.addTask(constants.taskTypes.SPAWN_CREEP, room.name, {
            role: constants.roles.UNIVERSAL,
        });
        ctx.log(`[checker] add ${constants.taskTypes.SPAWN_CREEP} for ${room.name}`);
    }
}

function checkSpawnEnergy(room, ctx) {
    const spawns = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    });

    syncEnergyTasks(room.name, constants.taskTypes.FILL_SPAWN, spawns, ctx);
}

function checkExtensionEnergy(room, ctx) {
    const extensions = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_EXTENSION;
    });

    syncEnergyTasks(room.name, constants.taskTypes.FILL_EXTENSION, extensions, ctx);
}

function checkTowerEnergy(room, ctx) {
    const towers = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_TOWER;
    });

    syncEnergyTasks(room.name, constants.taskTypes.FILL_TOWER, towers, ctx);
}

function recalculateUniversalsCount(room) {
    getRoomState(room.name);
}

function syncMiningOperations(room, ctx) {
    const sources = room.find(FIND_SOURCES);
    const sourceIds = {};

    for (const source of sources) {
        sourceIds[source.id] = true;
    }

    for (const task of ctx.listTasks(room.name)) {
        if (
            task.type === constants.taskTypes.MINING_OPERATION &&
            !sourceIds[task.data.sourceId]
        ) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${constants.taskTypes.MINING_OPERATION} for ${room.name}:${task.data.sourceId}`);
        }
    }

    for (const source of sources) {
        syncMiningOperationTask(room, source, ctx);
    }
}

function syncRoomBuilder(room, ctx) {
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.BUILD;
    });

    if (matchedTasks.length === 0) {
        ctx.addTask(constants.taskTypes.BUILD, room.name, {});
        ctx.log(`[checker] add ${constants.taskTypes.BUILD} for ${room.name}`);
        return;
    }

    removeExtraTasks(matchedTasks, ctx);
}

function syncMiningOperationTask(room, source, ctx) {
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return (
            task.type === constants.taskTypes.MINING_OPERATION &&
            task.data.sourceId === source.id
        );
    });
    const anchor = selectMiningAnchor(room, source);

    if (matchedTasks.length === 0) {
        ctx.addTask(constants.taskTypes.MINING_OPERATION, room.name, {
            sourceId: source.id,
            anchor: anchor,
        });
        ctx.log(`[checker] add ${constants.taskTypes.MINING_OPERATION} for ${room.name}:${source.id}`);
        return;
    }

    matchedTasks[0].data.anchor = anchor;
    removeExtraTasks(matchedTasks, ctx);
}

function syncEnergyTasks(roomName, taskType, targets, ctx) {
    const targetIds = {};

    for (const target of targets) {
        targetIds[target.id] = true;
    }

    for (const task of ctx.listTasks(roomName)) {
        if (task.type === taskType && !targetIds[task.data.targetId]) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${taskType} for ${roomName}:${task.data.targetId}`);
        }
    }

    for (const target of targets) {
        syncTargetTask(roomName, taskType, target.id, target.store.getFreeCapacity(RESOURCE_ENERGY) > 0, ctx);
    }
}

function syncTargetTask(roomName, taskType, targetId, shouldExist, ctx) {
    const matchedTasks = getTargetTasks(roomName, taskType, targetId, ctx);

    if (shouldExist) {
        if (matchedTasks.length === 0) {
            ctx.addTask(taskType, roomName, {
                targetId: targetId,
                total: Game.getObjectById(targetId).store.getFreeCapacity(RESOURCE_ENERGY),
            });
            ctx.log(`[checker] add ${taskType} for ${roomName}:${targetId}`);
            return;
        }

        if (matchedTasks[0].actionIds.length === 0) {
            matchedTasks[0].data.total = Game.getObjectById(targetId).store.getFreeCapacity(RESOURCE_ENERGY);
        }

        removeExtraTasks(matchedTasks, ctx);
        return;
    }

    for (const task of matchedTasks) {
        ctx.removeTask(task.id);
        ctx.log(`[checker] remove ${taskType} for ${roomName}:${targetId}`);
    }
}

function removeExtraTasks(matchedTasks, ctx) {
    for (let index = 1; index < matchedTasks.length; index += 1) {
        ctx.removeTask(matchedTasks[index].id);
    }
}

function getTargetTasks(roomName, taskType, targetId, ctx) {
    return ctx.listTasks(roomName).filter(function (task) {
        return task.type === taskType && task.data.targetId === targetId;
    });
}

function countUniversals(roomName, ctx) {
    let count = 0;

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role === constants.roles.UNIVERSAL &&
            creep.memory.originRoomName === roomName
        ) {
            count += 1;
        }
    }

    for (const task of ctx.listTasks(roomName)) {
        if (
            task.type === constants.taskTypes.SPAWN_CREEP &&
            task.data.role === constants.roles.UNIVERSAL
        ) {
            count += 1;
        }
    }

    return count;
}

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

function getRoomState(roomName) {
    if (!Memory.Checker.rooms[roomName]) {
        Memory.Checker.rooms[roomName] = {
            universalTargetCount: 3,
        };
    }

    return Memory.Checker.rooms[roomName];
}

module.exports = {
    CHECK_INTERVAL,
    checkExtensionEnergy,
    checkSpawnEnergy,
    checkTowerEnergy,
    checkUniversalCount,
    getCycleActionType,
    getCycleLength,
    getRoomState,
    recalculateUniversalsCount,
    syncMiningOperations,
    syncRoomBuilder,
};
