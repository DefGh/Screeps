const constants = require("./constants");
const miningAnchors = require("./planner.mining_anchors");

const CHECK_INTERVAL = 5;
const UNIVERSAL_RECALCULATE_INTERVAL = 300;
const UNIVERSAL_TARGET_BUFFER = 3000;
const UNIVERSAL_TARGET_DEADBAND = 500;
const UNIVERSAL_TARGET_MIN = 3;
const UNIVERSAL_TARGET_MAX = 10;
const cycleActionTypes = [
    constants.actionTypes.SYNC_MINING_OPERATIONS,
    constants.actionTypes.SYNC_ROOM_BUILDER,
    constants.actionTypes.SYNC_TOWER_OPERATIONS,
    constants.actionTypes.CHECK_UNIVERSALS,
    constants.actionTypes.CHECK_FILL_SPAWN,
    constants.actionTypes.CHECK_FILL_EXTENSION,
    constants.actionTypes.CHECK_FILL_TOWER,
    constants.actionTypes.CHECK_UPGRADE_CONTROLLER,
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

function checkUpgradeController(room, ctx) {
    if (!room.controller || !room.controller.my) {
        return;
    }

    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.UPGRADE_CONTROLLER;
    });

    if (!hasControllerUpgradeTotal(room.controller)) {
        for (const task of matchedTasks) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${constants.taskTypes.UPGRADE_CONTROLLER} for ${room.name}`);
        }

        return;
    }

    const task = ensureUpgradeTask(room, matchedTasks, ctx);

    if (!task) {
        return;
    }

    task.data.total = room.controller.progressTotal;
    task.donePercent = getControllerProgressPercent(room.controller);

    require("./dispatcher.cleanup").normalizeTaskAssignments(task);
}

function recalculateUniversalsCount(room, ctx) {
    const roomState = getRoomState(room.name);

    if (
        roomState.lastUniversalsRecalculatedAt !== undefined &&
        Game.time - roomState.lastUniversalsRecalculatedAt < UNIVERSAL_RECALCULATE_INTERVAL
    ) {
        return;
    }

    const buffer = getRoomEnergyBuffer(room);
    const previousTargetCount = roomState.universalTargetCount;

    if (buffer > UNIVERSAL_TARGET_BUFFER + UNIVERSAL_TARGET_DEADBAND) {
        roomState.universalTargetCount = Math.min(
            UNIVERSAL_TARGET_MAX,
            roomState.universalTargetCount + 1
        );
    }
    else if (buffer < UNIVERSAL_TARGET_BUFFER - UNIVERSAL_TARGET_DEADBAND) {
        roomState.universalTargetCount = Math.max(
            UNIVERSAL_TARGET_MIN,
            roomState.universalTargetCount - 1
        );
    }

    roomState.lastUniversalsRecalculatedAt = Game.time;

    if (
        ctx &&
        ctx.log &&
        roomState.universalTargetCount !== previousTargetCount
    ) {
        ctx.log(
            `[checker] ${room.name} universalTargetCount ${previousTargetCount} -> ${roomState.universalTargetCount} (buffer=${buffer})`
        );
    }
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

    if (shouldRecreateTaskWithoutExecutors(matchedTasks[0])) {
        recreateTask(
            matchedTasks,
            room.name,
            constants.taskTypes.BUILD,
            {},
            `for ${room.name} (no executors)`,
            ctx
        );
        return;
    }

    removeExtraTasks(matchedTasks, ctx);
}

function syncTowerOperations(room, ctx) {
    const towers = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_TOWER;
    });
    const towerIds = {};

    for (const tower of towers) {
        towerIds[tower.id] = true;
    }

    for (const task of ctx.listTasks(room.name)) {
        if (
            task.type === constants.taskTypes.TOWER_OPERATION &&
            !towerIds[task.data.towerId]
        ) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${constants.taskTypes.TOWER_OPERATION} for ${room.name}:${task.data.towerId}`);
        }
    }

    for (const tower of towers) {
        const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
            return (
                task.type === constants.taskTypes.TOWER_OPERATION &&
                task.data.towerId === tower.id
            );
        });

        if (matchedTasks.length === 0) {
            ctx.addTask(constants.taskTypes.TOWER_OPERATION, room.name, {
                towerId: tower.id,
            });
            ctx.log(`[checker] add ${constants.taskTypes.TOWER_OPERATION} for ${room.name}:${tower.id}`);
            continue;
        }

        if (shouldRecreateTaskWithoutExecutors(matchedTasks[0])) {
            recreateTask(
                matchedTasks,
                room.name,
                constants.taskTypes.TOWER_OPERATION,
                {
                    towerId: tower.id,
                },
                `for ${room.name}:${tower.id} (no executors)`,
                ctx
            );
            continue;
        }

        removeExtraTasks(matchedTasks, ctx);
    }
}

function syncMiningOperationTask(room, source, ctx) {
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return (
            task.type === constants.taskTypes.MINING_OPERATION &&
            task.data.sourceId === source.id
        );
    });
    const anchor = miningAnchors.selectMiningAnchor(room, source);

    if (matchedTasks.length === 0) {
        ctx.addTask(constants.taskTypes.MINING_OPERATION, room.name, {
            sourceId: source.id,
            anchor: anchor,
        });
        ctx.log(`[checker] add ${constants.taskTypes.MINING_OPERATION} for ${room.name}:${source.id}`);
        return;
    }

    if (shouldRecreateTaskWithoutExecutors(matchedTasks[0])) {
        recreateTask(
            matchedTasks,
            room.name,
            constants.taskTypes.MINING_OPERATION,
            {
                sourceId: source.id,
                anchor: anchor,
            },
            `for ${room.name}:${source.id} (no executors)`,
            ctx
        );
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

function ensureUpgradeTask(room, matchedTasks, ctx) {
    if (matchedTasks.length === 0) {
        const result = ctx.addTask(constants.taskTypes.UPGRADE_CONTROLLER, room.name, {
            total: room.controller.progressTotal,
        });

        if (result && result.task) {
            ctx.log(`[checker] add ${constants.taskTypes.UPGRADE_CONTROLLER} for ${room.name}`);
            return result.task;
        }

        return null;
    }

    removeExtraTasks(matchedTasks, ctx);
    return matchedTasks[0];
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

        if (shouldRecreateTaskWithoutExecutors(matchedTasks[0])) {
            recreateTask(
                matchedTasks,
                roomName,
                taskType,
                {
                    targetId: targetId,
                    total: Game.getObjectById(targetId).store.getFreeCapacity(RESOURCE_ENERGY),
                },
                `for ${roomName}:${targetId} (no executors)`,
                ctx
            );
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

function hasControllerUpgradeTotal(controller) {
    return !!(
        controller &&
        Number.isFinite(controller.progressTotal) &&
        controller.progressTotal > 0
    );
}

function getControllerProgressPercent(controller) {
    if (!hasControllerUpgradeTotal(controller)) {
        return 0;
    }

    const progress = Number.isFinite(controller.progress)
        ? controller.progress
        : 0;

    return Math.max(
        0,
        Math.min(100, (progress / controller.progressTotal) * 100)
    );
}

function shouldRecreateTaskWithoutExecutors(task) {
    return false;
    return (
        hasNoExecutors(task) &&
        (
            (task.actionIds && task.actionIds.length > 0) ||
            task.assignedPercent > 0
        )
    );
}

function hasNoExecutors(task) {
    return !task.executorNames || task.executorNames.length === 0;
}

function recreateTask(matchedTasks, roomName, taskType, data, label, ctx) {
    removeExtraTasks(matchedTasks, ctx);
    ctx.removeTask(matchedTasks[0].id);
    ctx.addTask(taskType, roomName, data);
    ctx.log(`[checker] recreate ${taskType} ${label}`);
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

function getRoomEnergyBuffer(room) {
    let total = 0;

    const piles = room.find(FIND_DROPPED_RESOURCES);

    for (const pile of piles) {
        if (pile.resourceType === RESOURCE_ENERGY) {
            total += pile.amount;
        }
    }

    const containers = room.find(FIND_STRUCTURES);

    for (const structure of containers) {
        if (structure.structureType === STRUCTURE_CONTAINER) {
            total += structure.store.getUsedCapacity(RESOURCE_ENERGY);
        }
    }

    return total;
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
    checkUpgradeController,
    checkUniversalCount,
    getCycleActionType,
    getCycleLength,
    getRoomEnergyBuffer,
    getRoomState,
    recalculateUniversalsCount,
    syncMiningOperations,
    syncRoomBuilder,
    syncTowerOperations,
};
