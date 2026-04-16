const constants = require("./constants");
const fillEnergy = require("./fill.energy");
const logistics = require("./logistics");
const longRangeMining = require("./long_range_mining");
const miningAnchors = require("./planner.mining_anchors");
const renewUniversal = require("./renew.universal");

const CHECK_INTERVAL = 5;
const UNIVERSAL_RECALCULATE_INTERVAL = 300;
const UNIVERSAL_TARGET_BUFFER = 3000;
const UNIVERSAL_TARGET_DEADBAND = 500;
const UNIVERSAL_TARGET_MIN = 3;
const UNIVERSAL_TARGET_MAX = 6;
const DEFAULT_UNIVERSAL_TARGET_COUNT = 3;
const HAULER_RENEW_TARGET_TTL = 1400;
const cycleActionTypes = [
    constants.actionTypes.SYNC_MINING_OPERATIONS,
    constants.actionTypes.CHECK_LONG_RANGE_MINING,
    constants.actionTypes.SYNC_ROOM_BUILDER,
    constants.actionTypes.SYNC_TOWER_OPERATIONS,
    constants.actionTypes.CHECK_UNIVERSALS,
    constants.actionTypes.CHECK_UNIVERSAL_RENEW,
    constants.actionTypes.CHECK_FILL_ENERGY,
    constants.actionTypes.CHECK_NON_ENERGY_LOGISTICS,
    constants.actionTypes.CHECK_FILL_TOWER,
    constants.actionTypes.CHECK_EXPANSION,
    constants.actionTypes.CHECK_UPGRADE_CONTROLLER,
    constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT,
];
const MAX_LEVEL_UPGRADE_TASK_TOTAL =
    CONTROLLER_MAX_UPGRADE_PER_TICK * CHECK_INTERVAL * cycleActionTypes.length;

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

function checkUniversalRenew(room, ctx) {
    const roomState = getRoomState(room.name);
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.RENEW_UNIVERSAL;
    });
    const currentCount = countUniversals(room.name, ctx);
    const roomGeneration = renewUniversal.getRoomGeneration(room);
    const spawn = renewUniversal.getPrimarySpawn(room.name);
    let task = matchedTasks[0] || null;

    removeExtraTasks(matchedTasks, ctx);

    if (
        !spawn ||
        currentCount > roomState.universalTargetCount
    ) {
        removeRenewTask(task, room.name, ctx);
        return;
    }

    if (task && !isValidRenewTask(task, roomState.universalTargetCount, currentCount, roomGeneration)) {
        removeRenewTask(task, room.name, ctx);
        task = null;
    }

    if (!task) {
        const target = pickRenewTarget(room.name, roomGeneration);

        if (!target) {
            return;
        }

        const result = ctx.addTask(constants.taskTypes.RENEW_UNIVERSAL, room.name, {
            renewUntil: renewUniversal.RENEW_TARGET_TTL,
            spawnName: spawn.name,
            targetCreepName: target.name,
            targetGeneration: roomGeneration,
        });

        if (!result || !result.task) {
            return;
        }

        task = result.task;
        ctx.log(`[checker] add ${constants.taskTypes.RENEW_UNIVERSAL} for ${room.name}:${target.name}`);
    }

    task.data.renewUntil = renewUniversal.getRenewUntil(task.data.renewUntil);
    task.data.spawnName = spawn.name;
    task.data.targetGeneration = roomGeneration;
    syncRenewTaskProgress(task);
}

function checkSpawnEnergy(room, ctx) {
    checkFillEnergy(room, ctx);
}

function checkExtensionEnergy(room, ctx) {
    checkFillEnergy(room, ctx);
}

function checkFillEnergy(room, ctx) {
    cleanupLegacyFillTasks(room.name, ctx);

    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.FILL_ENERGY;
    });
    const hasLiveDemand = fillEnergy.getRoomTargets(room).some(function (target) {
        return target.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
    });

    if (matchedTasks.length === 0 && !hasLiveDemand) {
        return;
    }

    const task = ensureFillEnergyTask(room, matchedTasks, ctx);

    if (!task) {
        return;
    }

    normalizeTaskAssignments(task);
    fillEnergy.syncTask(task, room);

    if (!fillEnergy.hasOutstandingDemand(task) && task.actionIds.length === 0) {
        ctx.removeTask(task.id);
        ctx.log(`[checker] remove ${constants.taskTypes.FILL_ENERGY} for ${room.name}`);
    }
}

function checkNonEnergyLogistics(room, ctx) {
    const storage = longRangeMining.getOwnedStorage(room);

    syncCollectDroppedResourceTasks(room, storage, ctx);
    syncExportResourceTasks(room, storage, ctx);
    syncCapitalExportHauler(room, storage, ctx);
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

    if (isMaxLevelController(room.controller)) {
        const task = ensureUpgradeTask(room, matchedTasks, ctx);

        if (!task) {
            return;
        }

        if (!task.data.isMaxLevel) {
            task.donePercent = 0;
            task.assignedPercent = 0;
        }

        task.data.isMaxLevel = true;
        task.data.total = getUpgradeTaskTotal(room.controller);

        normalizeTaskAssignments(task);
        return;
    }

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
    delete task.data.isMaxLevel;
    task.donePercent = getControllerProgressPercent(room.controller);

    normalizeTaskAssignments(task);
}

function checkExpansion(room, ctx) {
    require("./expansion").reconcile(room, ctx);
}

function checkLongRangeMining(room, ctx) {
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.LONG_RANGE_MINING;
    });
    const hasSpawn = !!renewUniversal.getPrimarySpawn(room.name);
    let task = matchedTasks[0] || null;

    removeExtraTasks(matchedTasks, ctx);

    if (!hasSpawn) {
        removeLongRangeMiningTask(task, room.name, ctx);
        removeQueuedRoleSpawnTasks(room.name, constants.roles.OUTPOST_SCOUT, ctx);
        removeRemoteHaulerRenewTasks(room.name, ctx);
        removeRemoteMiningOperations(room.name, ctx);
        return;
    }

    if (!task) {
        const result = ctx.addTask(constants.taskTypes.LONG_RANGE_MINING, room.name, {
            outposts: {},
        });

        if (!result || !result.task) {
            return;
        }

        task = result.task;
        ctx.log(`[checker] add ${constants.taskTypes.LONG_RANGE_MINING} for ${room.name}`);
    }

    longRangeMining.ensureTaskState(task, room);
    longRangeMining.refreshVisibleOutposts(task, room);
    syncOutpostScout(task, room.name, ctx);

    const storage = longRangeMining.getOwnedStorage(room);

    if (!storage) {
        removeRemoteHaulerRenewTasks(room.name, ctx);
        removeRemoteMiningOperations(room.name, ctx);
        return;
    }

    syncRemoteMiningOperations(room, task, storage, ctx);
    syncRemoteHaulerRenewTasks(room, ctx);
}

function ensureFillEnergyTask(room, matchedTasks, ctx) {
    if (matchedTasks.length === 0) {
        const result = ctx.addTask(constants.taskTypes.FILL_ENERGY, room.name, {
            targets: [],
            total: 0,
        });

        if (result && result.task) {
            ctx.log(`[checker] add ${constants.taskTypes.FILL_ENERGY} for ${room.name}`);
            return result.task;
        }

        return null;
    }

    removeExtraTasks(matchedTasks, ctx);
    return matchedTasks[0];
}

function cleanupLegacyFillTasks(roomName, ctx) {
    const roomTasks = ctx.listTasks(roomName);

    for (const task of roomTasks) {
        if (
            task.type !== constants.taskTypes.FILL_SPAWN &&
            task.type !== constants.taskTypes.FILL_EXTENSION
        ) {
            continue;
        }

        ctx.removeTask(task.id);
        ctx.log(`[checker] remove legacy ${task.type} for ${roomName}`);
    }
}

function syncCollectDroppedResourceTasks(room, storage, ctx) {
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.COLLECT_DROPPED_RESOURCE;
    });
    const livePilesById = {};
    const livePiles = storage
        ? logistics.getNonEnergyDroppedResources(room)
        : [];

    for (const pile of livePiles) {
        livePilesById[pile.id] = pile;
    }

    const seenPileIds = {};

    for (const task of matchedTasks) {
        normalizeTaskAssignments(task);

        const pile = livePilesById[task.data.pileId];
        const keepDetachedTask = (
            task.actionIds.length > 0 ||
            hasUniversalCargo(room.name, task.data.resourceType)
        );

        if (
            !storage ||
            (
                !pile &&
                !keepDetachedTask
            ) ||
            (
                pile &&
                pile.resourceType !== task.data.resourceType
            ) ||
            seenPileIds[task.data.pileId]
        ) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${constants.taskTypes.COLLECT_DROPPED_RESOURCE} for ${room.name}:${task.data.pileId}`);
            continue;
        }

        seenPileIds[task.data.pileId] = true;

        if (pile) {
            task.data.resourceType = pile.resourceType;

            if (task.actionIds.length === 0) {
                task.data.total = pile.amount;
            }
        }
    }

    if (!storage) {
        return;
    }

    for (const pile of livePiles) {
        if (seenPileIds[pile.id]) {
            continue;
        }

        const result = ctx.addTask(constants.taskTypes.COLLECT_DROPPED_RESOURCE, room.name, {
            pileId: pile.id,
            resourceType: pile.resourceType,
            total: pile.amount,
        });

        if (!result || !result.task) {
            continue;
        }

        seenPileIds[pile.id] = true;
        ctx.log(`[checker] add ${constants.taskTypes.COLLECT_DROPPED_RESOURCE} for ${room.name}:${pile.id}`);
    }
}

function syncExportResourceTasks(room, storage, ctx) {
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL;
    });
    const capitalStorage = logistics.getCapitalStorage();
    const isCapitalRoom = logistics.isCapitalRoom(room.name);
    const liveEntries = (
        storage &&
        capitalStorage &&
        !isCapitalRoom
    )
        ? logistics.getStorageNonEnergyResources(storage)
        : [];
    const liveEntriesByResourceType = {};

    for (const entry of liveEntries) {
        liveEntriesByResourceType[entry.resourceType] = entry;
    }

    const seenResourceTypes = {};

    for (const task of matchedTasks) {
        normalizeTaskAssignments(task);

        const resourceType = task.data.resourceType;
        const entry = liveEntriesByResourceType[resourceType];
        const keepDetachedTask = (
            task.actionIds.length > 0 ||
            hasExportHaulerCargo(room.name, resourceType)
        );

        if (
            isCapitalRoom ||
            (
                !storage &&
                !keepDetachedTask
            ) ||
            (
                !capitalStorage &&
                !keepDetachedTask
            ) ||
            (
                !entry &&
                !keepDetachedTask
            ) ||
            seenResourceTypes[resourceType]
        ) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL} for ${room.name}:${resourceType}`);
            continue;
        }

        seenResourceTypes[resourceType] = true;
        task.data.capitalRoomName = logistics.getCapitalRoomName();

        if (capitalStorage) {
            task.data.capitalStorageId = capitalStorage.id;
        }
        else {
            delete task.data.capitalStorageId;
        }

        if (storage) {
            task.data.sourceStorageId = storage.id;
        }
        else {
            delete task.data.sourceStorageId;
        }

        if (entry && task.actionIds.length === 0) {
            task.data.total = entry.amount;
        }
    }

    if (!storage || !capitalStorage || isCapitalRoom) {
        return;
    }

    for (const entry of liveEntries) {
        if (seenResourceTypes[entry.resourceType]) {
            continue;
        }

        const result = ctx.addTask(constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL, room.name, {
            capitalRoomName: logistics.getCapitalRoomName(),
            capitalStorageId: capitalStorage.id,
            resourceType: entry.resourceType,
            sourceStorageId: storage.id,
            total: entry.amount,
        });

        if (!result || !result.task) {
            continue;
        }

        seenResourceTypes[entry.resourceType] = true;
        ctx.log(`[checker] add ${constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL} for ${room.name}:${entry.resourceType}`);
    }
}

function syncCapitalExportHauler(room, storage, ctx) {
    const roomName = room.name;
    const spawn = renewUniversal.getPrimarySpawn(roomName);
    const queuedTasks = ctx.listTasks(roomName).filter(isExportHaulerSpawnTask);
    const currentCount = countLiveExportHaulers(roomName);
    const desiredCount = shouldHaveExportHauler(room, storage, ctx) && spawn
        ? 1
        : 0;

    while (currentCount + queuedTasks.length > desiredCount && queuedTasks.length > 0) {
        ctx.removeTask(queuedTasks.pop().id);
    }

    while (currentCount + queuedTasks.length < desiredCount) {
        const result = ctx.addTask(constants.taskTypes.SPAWN_CREEP, roomName, {
            memory: {
                haulerMode: "capital_export",
            },
            role: constants.roles.HAULER,
        });

        if (!result || !result.task) {
            break;
        }

        queuedTasks.push(result.task);
        ctx.log(`[checker] add ${constants.taskTypes.SPAWN_CREEP} for ${roomName}:capital_export`);
    }
}

function shouldHaveExportHauler(room, storage, ctx) {
    if (
        !storage ||
        logistics.isCapitalRoom(room.name) ||
        !logistics.getCapitalStorage()
    ) {
        return false;
    }

    return ctx.listTasks(room.name).some(function (task) {
        return task.type === constants.taskTypes.EXPORT_RESOURCE_TO_CAPITAL;
    });
}

function countLiveExportHaulers(roomName) {
    let count = 0;

    for (const creepName in Game.creeps) {
        if (logistics.isExportHauler(Game.creeps[creepName], roomName)) {
            count += 1;
        }
    }

    return count;
}

function isExportHaulerSpawnTask(task) {
    return !!(
        task &&
        task.type === constants.taskTypes.SPAWN_CREEP &&
        task.data.role === constants.roles.HAULER &&
        task.data.memory &&
        task.data.memory.haulerMode === "capital_export"
    );
}

function hasUniversalCargo(roomName, resourceType) {
    if (!resourceType) {
        return false;
    }

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role === constants.roles.UNIVERSAL &&
            creep.memory.originRoomName === roomName &&
            creep.store.getUsedCapacity(resourceType) > 0
        ) {
            return true;
        }
    }

    return false;
}

function hasExportHaulerCargo(roomName, resourceType) {
    if (!resourceType) {
        return false;
    }

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            logistics.isExportHauler(creep, roomName) &&
            creep.store.getUsedCapacity(resourceType) > 0
        ) {
            return true;
        }
    }

    return false;
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
            !task.data.isRemote &&
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
            !task.data.isRemote &&
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
            isMaxLevel: isMaxLevelController(room.controller),
            total: getUpgradeTaskTotal(room.controller),
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

function getUpgradeTaskTotal(controller) {
    if (isMaxLevelController(controller)) {
        return MAX_LEVEL_UPGRADE_TASK_TOTAL;
    }

    return controller.progressTotal;
}

function isValidRenewTask(task, targetCount, currentCount, roomGeneration) {
    const creep = Game.creeps[task.data.targetCreepName];
    const spawn = Game.spawns[task.data.spawnName];

    if (
        !creep ||
        !renewUniversal.isUniversalOfRoom(creep, task.room) ||
        !spawn ||
        spawn.room.name !== task.room ||
        currentCount > targetCount ||
        !renewUniversal.isGenerationCurrent(creep, task.room) ||
        renewUniversal.isComplete(creep, task.data.renewUntil) ||
        renewUniversal.getCreepGeneration(creep) < roomGeneration
    ) {
        return false;
    }

    return true;
}

function pickRenewTarget(roomName, roomGeneration) {
    let bestCreep = null;

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            !renewUniversal.isEligibleToStart(creep, roomName) ||
            renewUniversal.getCreepGeneration(creep) < roomGeneration
        ) {
            continue;
        }

        if (
            !bestCreep ||
            creep.ticksToLive < bestCreep.ticksToLive ||
            (
                creep.ticksToLive === bestCreep.ticksToLive &&
                creep.name.localeCompare(bestCreep.name) < 0
            )
        ) {
            bestCreep = creep;
        }
    }

    return bestCreep;
}

function removeRenewTask(task, roomName, ctx) {
    if (!task) {
        return;
    }

    ctx.removeTask(task.id);
    ctx.log(`[checker] remove ${constants.taskTypes.RENEW_UNIVERSAL} for ${roomName}`);
}

function syncRenewTaskProgress(task) {
    const creep = Game.creeps[task.data.targetCreepName];

    if (!creep) {
        task.donePercent = 0;
        task.assignedPercent = 0;
        return;
    }

    const progress = renewUniversal.getProgressPercent(creep, task.data.renewUntil);

    task.donePercent = progress;
    task.assignedPercent = progress;
}

function syncHaulerRenewTaskProgress(task) {
    const creep = Game.creeps[task.data.targetCreepName];

    if (!creep) {
        task.donePercent = 0;
        task.assignedPercent = 0;
        return;
    }

    const progress = renewUniversal.getProgressPercent(creep, task.data.renewUntil);

    task.donePercent = progress;
    task.assignedPercent = progress;
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

function isMaxLevelController(controller) {
    return !!(
        controller &&
        controller.level === 8
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

function countLiveRole(roomName, role) {
    let count = 0;

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role === role &&
            creep.memory.originRoomName === roomName
        ) {
            count += 1;
        }
    }

    return count;
}

function syncOutpostScout(longRangeTask, roomName, ctx) {
    const desiredCount = longRangeMining.pickNextScoutRoom(longRangeTask) ? 1 : 0;
    const queuedTasks = ctx.listTasks(roomName).filter(function (task) {
        return (
            task.type === constants.taskTypes.SPAWN_CREEP &&
            task.data.role === constants.roles.OUTPOST_SCOUT
        );
    });
    const currentCount = countLiveRole(roomName, constants.roles.OUTPOST_SCOUT);

    while (currentCount + queuedTasks.length > desiredCount && queuedTasks.length > 0) {
        ctx.removeTask(queuedTasks.pop().id);
    }

    while (currentCount + queuedTasks.length < desiredCount) {
        const result = ctx.addTask(constants.taskTypes.SPAWN_CREEP, roomName, {
            role: constants.roles.OUTPOST_SCOUT,
        });

        if (!result || !result.task) {
            break;
        }

        queuedTasks.push(result.task);
        ctx.log(`[checker] add ${constants.taskTypes.SPAWN_CREEP} for ${roomName}:${constants.roles.OUTPOST_SCOUT}`);
    }
}

function removeQueuedRoleSpawnTasks(roomName, role, ctx) {
    for (const task of ctx.listTasks(roomName)) {
        if (
            task.type === constants.taskTypes.SPAWN_CREEP &&
            task.data.role === role
        ) {
            ctx.removeTask(task.id);
        }
    }
}

function syncRemoteMiningOperations(room, longRangeTask, storage, ctx) {
    const desiredSourceIds = {};
    const outposts = longRangeTask.data.outposts || {};
    const visibleRooms = {};

    for (const outpostRoomName in outposts) {
        const outpostState = outposts[outpostRoomName];

        if (outpostState.status !== "safe") {
            continue;
        }

        for (const sourceId of outpostState.sourceIds || []) {
            desiredSourceIds[sourceId] = outpostRoomName;
        }

        if (Game.rooms[outpostRoomName]) {
            visibleRooms[outpostRoomName] = Game.rooms[outpostRoomName];
        }
    }

    for (const task of ctx.listTasks(room.name)) {
        if (
            !longRangeMining.isRemoteMiningTask(task) ||
            !desiredSourceIds[task.data.sourceId]
        ) {
            if (longRangeMining.isRemoteMiningTask(task)) {
                ctx.removeTask(task.id);
                ctx.log(`[checker] remove ${constants.taskTypes.MINING_OPERATION} for ${room.name}:${task.data.sourceId}`);
            }

            continue;
        }

        task.data.deliveryTargetId = storage.id;
        task.data.isRemote = true;
        task.data.sourceRoomName = desiredSourceIds[task.data.sourceId];

        const sourceRoom = visibleRooms[task.data.sourceRoomName];
        const source = sourceRoom ? Game.getObjectById(task.data.sourceId) : null;

        if (sourceRoom && source) {
            task.data.anchor = miningAnchors.selectMiningAnchor(sourceRoom, source);
        }
    }

    for (const sourceId in desiredSourceIds) {
        const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
            return (
                longRangeMining.isRemoteMiningTask(task) &&
                task.data.sourceId === sourceId
            );
        });

        if (matchedTasks.length > 0) {
            removeExtraTasks(matchedTasks, ctx);
            continue;
        }

        const sourceRoomName = desiredSourceIds[sourceId];
        const sourceRoom = Game.rooms[sourceRoomName];

        if (!sourceRoom) {
            continue;
        }

        const source = Game.getObjectById(sourceId);

        if (!source) {
            continue;
        }

        ctx.addTask(constants.taskTypes.MINING_OPERATION, room.name, {
            anchor: miningAnchors.selectMiningAnchor(sourceRoom, source),
            deliveryTargetId: storage.id,
            isRemote: true,
            sourceId: sourceId,
            sourceRoomName: sourceRoomName,
        });
        ctx.log(`[checker] add ${constants.taskTypes.MINING_OPERATION} for ${room.name}:${sourceId}`);
    }
}

function syncRemoteHaulerRenewTasks(room, ctx) {
    const spawn = renewUniversal.getPrimarySpawn(room.name);
    const desiredTargets = getRemoteHaulerRenewTargets(room.name, ctx);
    const seenSourceIds = {};
    const matchedTasks = ctx.listTasks(room.name).filter(function (task) {
        return task.type === constants.taskTypes.RENEW_HAULER;
    });

    for (const task of matchedTasks) {
        const creep = desiredTargets[task.data.sourceId];

        if (
            !isValidRemoteHaulerRenewTask(task, room.name, spawn, creep) ||
            seenSourceIds[task.data.sourceId]
        ) {
            ctx.removeTask(task.id);
            ctx.log(`[checker] remove ${constants.taskTypes.RENEW_HAULER} for ${room.name}:${task.data.sourceId}`);
            continue;
        }

        seenSourceIds[task.data.sourceId] = true;
        task.data.renewUntil = getHaulerRenewUntil(task.data.renewUntil);
        task.data.spawnName = spawn.name;
        task.data.targetCreepName = creep.name;
        syncHaulerRenewTaskProgress(task);
    }

    if (!spawn) {
        return;
    }

    for (const sourceId in desiredTargets) {
        if (seenSourceIds[sourceId]) {
            continue;
        }

        const creep = desiredTargets[sourceId];
        const result = ctx.addTask(constants.taskTypes.RENEW_HAULER, room.name, {
            renewUntil: HAULER_RENEW_TARGET_TTL,
            spawnName: spawn.name,
            sourceId: sourceId,
            targetCreepName: creep.name,
        });

        if (!result || !result.task) {
            continue;
        }

        seenSourceIds[sourceId] = true;
        syncHaulerRenewTaskProgress(result.task);
        ctx.log(`[checker] add ${constants.taskTypes.RENEW_HAULER} for ${room.name}:${sourceId}`);
    }
}

function getRemoteHaulerRenewTargets(roomName, ctx) {
    const remoteSourceIds = {};
    const targets = {};

    for (const task of ctx.listTasks(roomName)) {
        if (longRangeMining.isRemoteMiningTask(task)) {
            remoteSourceIds[task.data.sourceId] = true;
        }
    }

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            !isRemoteHaulerRenewCandidate(creep, roomName) ||
            !remoteSourceIds[creep.memory.sourceId]
        ) {
            continue;
        }

        const current = targets[creep.memory.sourceId];

        if (
            !current ||
            (
                Number.isFinite(creep.ticksToLive) &&
                Number.isFinite(current.ticksToLive) &&
                creep.ticksToLive < current.ticksToLive
            )
        ) {
            targets[creep.memory.sourceId] = creep;
        }
    }

    return targets;
}

function isRemoteHaulerRenewCandidate(creep, roomName) {
    return !!(
        creep &&
        creep.memory &&
        creep.memory.role === constants.roles.HAULER &&
        creep.memory.originRoomName === roomName &&
        creep.memory.restoreTtl &&
        creep.memory.sourceId
    );
}

function isValidRemoteHaulerRenewTask(task, roomName, spawn, creep) {
    return !!(
        task &&
        task.type === constants.taskTypes.RENEW_HAULER &&
        spawn &&
        spawn.room.name === roomName &&
        creep &&
        creep.name === task.data.targetCreepName &&
        isRemoteHaulerRenewCandidate(creep, roomName)
    );
}

function getHaulerRenewUntil(renewUntil) {
    return Number.isFinite(renewUntil)
        ? renewUntil
        : HAULER_RENEW_TARGET_TTL;
}

function removeRemoteMiningOperations(roomName, ctx) {
    for (const task of ctx.listTasks(roomName)) {
        if (!longRangeMining.isRemoteMiningTask(task)) {
            continue;
        }

        ctx.removeTask(task.id);
    }
}

function removeRemoteHaulerRenewTasks(roomName, ctx) {
    for (const task of ctx.listTasks(roomName)) {
        if (task.type !== constants.taskTypes.RENEW_HAULER) {
            continue;
        }

        ctx.removeTask(task.id);
    }
}

function removeLongRangeMiningTask(task, roomName, ctx) {
    if (!task) {
        return;
    }

    ctx.removeTask(task.id);
    ctx.log(`[checker] remove ${constants.taskTypes.LONG_RANGE_MINING} for ${roomName}`);
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
        if (
            structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_STORAGE
        ) {
            total += structure.store.getUsedCapacity(RESOURCE_ENERGY);
        }
    }

    return total;
}

function normalizeTaskAssignments(task) {
    require("./dispatcher.cleanup").normalizeTaskAssignments(task);
}

function getRoomState(roomName) {
    if (!isOwnedRoomName(roomName) && !Memory.Checker.rooms[roomName]) {
        return {
            universalTargetCount: DEFAULT_UNIVERSAL_TARGET_COUNT,
        };
    }

    if (!Memory.Checker.rooms[roomName]) {
        Memory.Checker.rooms[roomName] = {
            universalTargetCount: DEFAULT_UNIVERSAL_TARGET_COUNT,
        };
    }

    return Memory.Checker.rooms[roomName];
}

function isOwnedRoomName(roomName) {
    const room = Game.rooms[roomName];

    return !!(
        room &&
        room.controller &&
        room.controller.my
    );
}

module.exports = {
    CHECK_INTERVAL,
    checkExpansion,
    checkFillEnergy,
    checkNonEnergyLogistics,
    checkExtensionEnergy,
    checkLongRangeMining,
    checkSpawnEnergy,
    checkTowerEnergy,
    checkUpgradeController,
    checkUniversalCount,
    checkUniversalRenew,
    getCycleActionType,
    getCycleLength,
    getRoomEnergyBuffer,
    getRoomState,
    recalculateUniversalsCount,
    syncMiningOperations,
    syncRoomBuilder,
    syncTowerOperations,
};
