const census = require("./census");
const constants = require("./constants");
const observer = require("./observer");
const roomScope = require("./room.scope");
const store = require("./store");

function reconcileExpansion(empireDelta) {
    const expansion = store.getExpansionMemory();

    if (!empireDelta.dirty) {
        return;
    }

    cleanupBootstrapRequests(expansion);
    reconcileActiveScout(expansion);
    reconcileActiveCandidate(expansion);

    if (!expansion.activeCandidate && !expansion.activeScout) {
        const opportunity = findExpansionOpportunity(expansion);

        if (opportunity && opportunity.type === constants.taskTypes.CLAIM_ROOM && hasAvailableClaimSlot()) {
            expansion.activeCandidate = {
                createdAt: Game.time,
                originRoomName: opportunity.originRoomName,
                status: "claiming",
                targetRoomName: opportunity.targetRoomName,
            };
            store.markRoomDirty(opportunity.originRoomName, "claimIntent");
        }
        else if (opportunity && opportunity.type === constants.taskTypes.SCOUT_ROOM) {
            expansion.activeScout = {
                createdAt: Game.time,
                originRoomName: opportunity.originRoomName,
                targetRoomName: opportunity.targetRoomName,
            };
            store.markRoomDirty(opportunity.originRoomName, "scoutIntent");
        }
    }

    syncGlobalIntents(expansion);
}

function reconcileDirtyRooms(roomDeltas) {
    for (const roomName of roomScope.getOperationalRoomNames()) {
        if (!store.isRoomDirty(roomName)) {
            continue;
        }

        reconcileRoom(roomName, roomDeltas[roomName]);
    }
}

function reconcileRoom(roomName, delta) {
    const room = Game.rooms[roomName];
    const planner = store.getRoomPlanner(roomName);
    refreshRoomStatic(room, planner, delta);
    store.cleanupExpiredReservations(roomName);
    store.cleanupExpiredTasks(roomName);

    const context = buildRoomContext(room, planner);

    reconcileRoomIntents(room, planner, context);
    pruneRoomTasks(roomName, room, context);
    reconcileSpawnTasks(roomName, room, context);
    reconcileMiningTasks(roomName, room, context);
    reconcileDefenseTasks(roomName, context);
    reconcileGlobalTasks(roomName, context);
    reconcileUniversalTasks(roomName, room, context);

    store.rebuildRoomQueues(roomName);
    store.clearRoomDirty(roomName);
}

function buildRoomContext(room, planner) {
    const summary = census.getVisibleRoomSummary(room);
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const globalIntents = getRoomGlobalIntents(room.name);
    const targetUniversals = adjustTargetUniversals(room.name, planner, summary.resourceAmount);

    return {
        bootstrapIntents: globalIntents.filter(isBootstrapIntent),
        claimIntents: globalIntents.filter(isClaimIntent),
        constructionSites: constructionSites,
        globalIntents: globalIntents,
        isUnderAttack: (planner.snapshot.hostileCount || 0) > 0,
        mineIntentId: buildIntentId(room.name, "mine"),
        planner: planner,
        room: room,
        scoutIntents: globalIntents.filter(isScoutIntent),
        sourceSpecs: planner.static.sources,
        summary: summary,
        targetUniversals: targetUniversals,
    };
}

function reconcileRoomIntents(room, planner, context) {
    const roomName = room.name;
    const buildProgress = calculateConstructionProgress(context.constructionSites);
    const hostileCount = planner.snapshot.hostileCount || 0;
    const sourceCount = context.sourceSpecs.length;

    upsertRoomIntent(roomName, "spawn", {
        priority: constants.priorities.SPAWN,
        progress: getSpawnIntentProgress(roomName, context.targetUniversals, sourceCount),
        scope: "room",
        status: constants.intentStatuses.ACTIVE,
        type: constants.taskTypes.SPAWN_CREEP,
    });

    upsertRoomIntent(roomName, "mine", {
        priority: constants.priorities.MINE,
        progress: sourceCount > 0
            ? Math.min(1, census.getOriginRoleCount(roomName, constants.roles.MINER) / sourceCount)
            : 1,
        scope: "room",
        status: sourceCount > 0
            ? constants.intentStatuses.ACTIVE
            : constants.intentStatuses.COMPLETED,
        type: constants.taskTypes.MINE,
    });

    upsertRoomIntent(roomName, "build", {
        priority: constants.priorities.BUILD,
        progress: buildProgress,
        scope: "room",
        status: context.constructionSites.length > 0
            ? constants.intentStatuses.ACTIVE
            : constants.intentStatuses.COMPLETED,
        type: constants.taskTypes.BUILD,
    });

    upsertRoomIntent(roomName, "upgrade", {
        priority: constants.priorities.UPGRADE,
        progress: getUpgradeIntentProgress(room),
        scope: "room",
        status: room.controller && room.controller.my
            ? constants.intentStatuses.ACTIVE
            : constants.intentStatuses.COMPLETED,
        targetId: room.controller ? room.controller.id : null,
        type: constants.taskTypes.TRANSFER_ENERGY,
    });

    upsertRoomIntent(roomName, "defend", {
        priority: constants.priorities.DEFENSE,
        progress: hostileCount > 0 ? 0 : 1,
        scope: "room",
        status: hostileCount > 0
            ? constants.intentStatuses.ACTIVE
            : constants.intentStatuses.COMPLETED,
        type: constants.taskTypes.DEFEND_ROOM,
    });
}

function pruneRoomTasks(roomName, room, context) {
    const tasks = store.listRoomTasks(roomName);

    for (const task of tasks) {
        if (task.type === constants.taskTypes.DEFEND_ROOM && !context.isUnderAttack) {
            store.removeTask(roomName, task.id, {
                clearAssignments: true,
            });
            continue;
        }

        if (task.type === constants.taskTypes.MINE && !hasSourceSpec(context.sourceSpecs, task.data.sourceId)) {
            store.removeTask(roomName, task.id, {
                clearAssignments: true,
            });
            continue;
        }

        if (task.type === constants.taskTypes.SCOUT_ROOM && !hasMatchingScoutIntent(context.scoutIntents, task)) {
            store.removeTask(roomName, task.id, {
                clearAssignments: true,
            });
            continue;
        }

        if (task.type === constants.taskTypes.CLAIM_ROOM && !hasMatchingClaimIntent(context.claimIntents, task)) {
            store.removeTask(roomName, task.id, {
                clearAssignments: true,
            });
            continue;
        }

        if (task.type === constants.taskTypes.BOOTSTRAP_SPAWN && !hasMatchingBootstrapIntent(context.bootstrapIntents, task)) {
            store.removeTask(roomName, task.id, {
                clearAssignments: true,
            });
        }
    }
}

function reconcileSpawnTasks(roomName, room, context) {
    const desiredByRole = {};
    const liveUniversals = census.getOriginRoleCount(roomName, constants.roles.UNIVERSAL);

    desiredByRole[constants.roles.UNIVERSAL] = context.targetUniversals;
    desiredByRole[constants.roles.MINER] = liveUniversals >= Math.min(context.targetUniversals, 2)
        ? context.sourceSpecs.length
        : 0;
    desiredByRole[constants.roles.ATTACKER] = context.isUnderAttack
        ? constants.attackers.MAX_PER_ROOM
        : 0;
    desiredByRole[constants.roles.SCOUT] = context.scoutIntents.length > 0 ? 1 : 0;
    desiredByRole[constants.roles.CLAIMER] = context.claimIntents.length > 0 && hasAvailableClaimSlot() ? 1 : 0;

    for (const role in desiredByRole) {
        reconcileRoleSpawnDemand(roomName, room, role, desiredByRole[role], context);
    }
}

function reconcileMiningTasks(roomName, room, context) {
    for (const sourceSpec of context.sourceSpecs) {
        const existing = store.listRoomTasks(roomName, function (task) {
            return task.type === constants.taskTypes.MINE && task.data.sourceId === sourceSpec.id;
        });

        if (existing.length === 0) {
            store.addTask(buildMineTask(roomName, sourceSpec));
            continue;
        }

        for (let index = 1; index < existing.length; index += 1) {
            store.removeTask(roomName, existing[index].id, {
                clearAssignments: true,
            });
        }
    }
}

function reconcileDefenseTasks(roomName, context) {
    const existing = store.listRoomTasks(roomName, function (task) {
        return task.type === constants.taskTypes.DEFEND_ROOM;
    });

    if (!context.isUnderAttack) {
        for (const task of existing) {
            store.removeTask(roomName, task.id, {
                clearAssignments: true,
            });
        }
        return;
    }

    if (existing.length === 0) {
        store.addTask(buildDefendTask(roomName));
    }
}

function reconcileGlobalTasks(roomName, context) {
    for (const scoutIntent of context.scoutIntents) {
        if (!hasTaskForTarget(roomName, constants.taskTypes.SCOUT_ROOM, scoutIntent.targetRoomName)) {
            store.addTask(buildScoutTask(roomName, scoutIntent));
        }
    }

    for (const claimIntent of context.claimIntents) {
        if (!hasTaskForTarget(roomName, constants.taskTypes.CLAIM_ROOM, claimIntent.targetRoomName)) {
            store.addTask(buildClaimTask(roomName, claimIntent));
        }
    }

    for (const bootstrapIntent of context.bootstrapIntents) {
        if (!hasTaskForTarget(roomName, constants.taskTypes.BOOTSTRAP_SPAWN, bootstrapIntent.targetRoomName)) {
            store.addTask(buildBootstrapTask(roomName, bootstrapIntent));
        }
    }
}

function reconcileUniversalTasks(roomName, room, context) {
    const urgentTargets = collectUrgentEnergyTargets(roomName, room, context);
    const maxBuildTasks = Math.max(1, Math.floor(context.targetUniversals / 2));
    const existingBuildTasks = store.listRoomTasks(roomName, function (task) {
        return task.type === constants.taskTypes.BUILD;
    });

    for (const target of urgentTargets) {
        if (!hasTaskForTarget(roomName, constants.taskTypes.TRANSFER_ENERGY, target.id)) {
            const transferTask = buildTransferTask(roomName, room, buildIntentId(roomName, "spawn"), target);

            if (transferTask) {
                store.addTask(transferTask);
            }
        }
    }

    if (context.constructionSites.length > 0 && existingBuildTasks.length < maxBuildTasks) {
        for (const site of context.constructionSites) {
            if (hasTaskForTarget(roomName, constants.taskTypes.BUILD, site.id)) {
                continue;
            }

            const buildTask = buildBuildTask(roomName, room, site);

            if (!buildTask) {
                break;
            }

            store.addTask(buildTask);

            if (
                store.countRoomTasks(roomName, function (task) {
                    return task.type === constants.taskTypes.BUILD;
                }) >= maxBuildTasks
            ) {
                break;
            }
        }
    }

    const hasTransferTasks = store.countRoomTasks(roomName, function (task) {
        return task.type === constants.taskTypes.TRANSFER_ENERGY;
    }) > 0;

    if (!hasTransferTasks && urgentTargets.length === 0 && room.controller && room.controller.my) {
        const controllerTask = buildTransferTask(roomName, room, buildIntentId(roomName, "upgrade"), {
            action: "controller",
            demand: getUpgradeTaskAmount(room),
            id: room.controller.id,
            object: room.controller,
            priority: constants.priorities.UPGRADE,
            type: "controller",
        });

        if (controllerTask) {
            store.addTask(controllerTask);
        }
    }
}

function refreshRoomStatic(room, planner, delta) {
    const shouldRefresh =
        planner.static.sources.length === 0 ||
        delta.sweep ||
        !planner.static.lastRefreshTick ||
        Game.time - planner.static.lastRefreshTick >= constants.sweepIntervals.STATIC_REFRESH;

    if (!shouldRefresh) {
        return;
    }

    const sourceSpecs = [];

    for (const source of room.find(FIND_SOURCES)) {
        sourceSpecs.push({
            id: source.id,
            minerPos: findMinerPos(room, source),
        });
    }

    planner.static.sources = sourceSpecs;
    planner.static.controllerId = room.controller ? room.controller.id : null;
    planner.static.exits = Object.values(Game.map.describeExits(room.name) || {}).sort();
    planner.static.lastRefreshTick = Game.time;
}

function findMinerPos(room, source) {
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x += 1) {
        for (let y = source.pos.y - 1; y <= source.pos.y + 1; y += 1) {
            if (!isInsideRoom(x, y)) {
                continue;
            }

            if (x === source.pos.x && y === source.pos.y) {
                continue;
            }

            if (isBlockedPosition(room, x, y)) {
                continue;
            }

            return {
                roomName: room.name,
                x: x,
                y: y,
            };
        }
    }

    return null;
}

function isInsideRoom(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function isBlockedPosition(room, x, y) {
    const terrain = room.getTerrain();

    if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        return true;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_ROAD) {
            continue;
        }

        if (structure.structureType === STRUCTURE_CONTAINER) {
            continue;
        }

        if (structure.structureType === STRUCTURE_RAMPART && structure.my) {
            continue;
        }

        if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
            return true;
        }
    }

    return false;
}

function getRoomGlobalIntents(roomName) {
    const intents = [];
    const globalIntents = store.getGlobalIntents();

    for (const intentId in globalIntents) {
        const intent = globalIntents[intentId];

        if (
            intent.originRoomName !== roomName ||
            intent.status !== constants.intentStatuses.ACTIVE
        ) {
            continue;
        }

        intents.push(intent);
    }

    return intents;
}

function adjustTargetUniversals(roomName, planner, resourceAmount) {
    const stats = planner.stats;
    const currentTarget = stats.targetUniversals;

    if (!stats.lastUniversalAdjustTick) {
        stats.lastUniversalAdjustTick = Game.time;
        stats.lastResourceAmount = resourceAmount;
        return currentTarget;
    }

    if (Game.time - stats.lastUniversalAdjustTick < constants.sweepIntervals.UNIVERSAL_ADJUST) {
        return currentTarget;
    }

    let nextTarget = currentTarget;

    if (
        stats.lastReservationFailureTick &&
        Game.time - stats.lastReservationFailureTick <= constants.sweepIntervals.UNIVERSAL_ADJUST
    ) {
        nextTarget -= 1;
    }
    else if (resourceAmount < constants.colony.LOW_RESOURCE_THRESHOLD) {
        nextTarget -= 1;
    }
    else if (resourceAmount > stats.lastResourceAmount + constants.colony.RESOURCE_GROWTH_STEP) {
        nextTarget += 1;
    }

    nextTarget = Math.max(constants.colony.MIN_TARGET_UNIVERSALS, Math.min(constants.colony.MAX_TARGET_UNIVERSALS, nextTarget));
    stats.targetUniversals = nextTarget;
    stats.lastUniversalAdjustTick = Game.time;
    stats.lastResourceAmount = resourceAmount;

    if (nextTarget !== currentTarget) {
        store.markRoomDirty(roomName, "universalTarget");
    }

    return nextTarget;
}

function collectUrgentEnergyTargets(roomName, room, context) {
    const targets = [];

    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];

        if (spawn.room.name !== roomName) {
            continue;
        }

        const demand = getStructureDemand(roomName, spawn);

        if (demand > 0) {
            targets.push({
                action: "transfer",
                demand: demand,
                id: spawn.id,
                object: spawn,
                priority: constants.priorities.TRANSFER_URGENT,
                type: "spawn",
            });
        }
    }

    for (const structure of room.find(FIND_MY_STRUCTURES)) {
        if (structure.structureType === STRUCTURE_EXTENSION) {
            const extensionDemand = getStructureDemand(roomName, structure);

            if (extensionDemand > 0) {
                targets.push({
                    action: "transfer",
                    demand: extensionDemand,
                    id: structure.id,
                    object: structure,
                    priority: constants.priorities.TRANSFER_URGENT,
                    type: "extension",
                });
            }
        }

        if (structure.structureType === STRUCTURE_TOWER) {
            const towerDemand = getStructureDemand(roomName, structure);

            if (towerDemand > 0) {
                targets.push({
                    action: "transfer",
                    demand: towerDemand,
                    id: structure.id,
                    object: structure,
                    priority: context.isUnderAttack
                        ? constants.priorities.TRANSFER_URGENT
                        : constants.priorities.BUILD,
                    type: "tower",
                });
            }
        }
    }

    targets.sort(function (left, right) {
        if (right.priority !== left.priority) {
            return right.priority - left.priority;
        }

        return right.demand - left.demand;
    });

    return targets;
}

function getStructureDemand(roomName, structure) {
    const capacity = getFreeEnergyCapacity(structure);
    const reserved = store.getReservedAmount(roomName, "incoming", structure.id, RESOURCE_ENERGY);
    return Math.max(0, capacity - reserved);
}

function buildTransferTask(roomName, room, parentIntentId, targetEntry) {
    const targetObject = targetEntry.object;
    const amount = Math.max(0, Math.min(targetEntry.demand, getUpgradeTaskAmount(room)));
    const sourceSelection = selectEnergySource(roomName, room, amount, targetObject);

    if (!sourceSelection || sourceSelection.amount <= 0) {
        markReservationFailure(roomName);
        return null;
    }

    const taskId = store.nextTaskId(constants.taskTypes.TRANSFER_ENERGY);
    const reservations = [
        {
            amount: sourceSelection.amount,
            direction: "outgoing",
            objectId: sourceSelection.source.id,
            resourceType: RESOURCE_ENERGY,
        },
    ];

    if (targetEntry.type !== "controller") {
        reservations.push({
            amount: sourceSelection.amount,
            direction: "incoming",
            objectId: targetEntry.id,
            resourceType: RESOURCE_ENERGY,
        });
    }

    store.replaceTaskReservations(roomName, taskId, reservations);

    return {
        createdAt: Game.time,
        data: {
            amount: sourceSelection.amount,
            collectRemainingAmount: sourceSelection.amount,
            remainingAmount: sourceSelection.amount,
            roomName: roomName,
            sourceId: sourceSelection.source.id,
            sourceKind: sourceSelection.kind,
            stage: constants.transferStages.COLLECT,
            targetId: targetEntry.id,
            targetType: targetEntry.type,
        },
        expiresAt: Game.time + constants.reservations.DEFAULT_TTL,
        id: taskId,
        parentIntentId: parentIntentId,
        priority: targetEntry.priority,
        role: constants.roles.UNIVERSAL,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: [constants.transferStages.COLLECT, constants.transferStages.DELIVER],
        type: constants.taskTypes.TRANSFER_ENERGY,
        updatedAt: Game.time,
    };
}

function buildBuildTask(roomName, room, site) {
    const remainingWork = Math.max(0, site.progressTotal - site.progress);
    const amount = Math.max(0, Math.min(remainingWork, getUpgradeTaskAmount(room)));
    const sourceSelection = selectEnergySource(roomName, room, amount, site);

    if (!sourceSelection || sourceSelection.amount <= 0) {
        markReservationFailure(roomName);
        return null;
    }

    const taskId = store.nextTaskId(constants.taskTypes.BUILD);

    store.replaceTaskReservations(roomName, taskId, [
        {
            amount: sourceSelection.amount,
            direction: "outgoing",
            objectId: sourceSelection.source.id,
            resourceType: RESOURCE_ENERGY,
        },
        {
            amount: sourceSelection.amount,
            direction: "incoming",
            objectId: site.id,
            resourceType: RESOURCE_ENERGY,
        },
    ]);

    return {
        createdAt: Game.time,
        data: {
            amount: sourceSelection.amount,
            collectRemainingAmount: sourceSelection.amount,
            remainingAmount: sourceSelection.amount,
            roomName: roomName,
            sourceId: sourceSelection.source.id,
            sourceKind: sourceSelection.kind,
            stage: constants.buildStages.COLLECT,
            targetId: site.id,
        },
        expiresAt: Game.time + constants.reservations.DEFAULT_TTL,
        id: taskId,
        parentIntentId: buildIntentId(roomName, "build"),
        priority: constants.priorities.BUILD,
        role: constants.roles.UNIVERSAL,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: [constants.buildStages.COLLECT, constants.buildStages.BUILD],
        type: constants.taskTypes.BUILD,
        updatedAt: Game.time,
    };
}

function selectEnergySource(roomName, room, requestedAmount, targetObject) {
    const sources = [];

    for (const pile of room.find(FIND_DROPPED_RESOURCES, {
        filter: function (resource) {
            return resource.resourceType === RESOURCE_ENERGY && resource.amount > 0;
        },
    })) {
        sources.push({
            amount: Math.max(
                0,
                pile.amount - store.getReservedAmount(roomName, "outgoing", pile.id, RESOURCE_ENERGY)
            ),
            kind: "pile",
            source: pile,
            weight: 3,
        });
    }

    for (const structure of room.find(FIND_STRUCTURES)) {
        if (
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_STORAGE
        ) {
            continue;
        }

        const usedEnergy = census.getUsedEnergy(structure);

        sources.push({
            amount: Math.max(
                0,
                usedEnergy - store.getReservedAmount(roomName, "outgoing", structure.id, RESOURCE_ENERGY)
            ),
            kind: "container",
            source: structure,
            weight: 2,
        });
    }

    for (const source of room.find(FIND_SOURCES)) {
        sources.push({
            amount: Math.max(
                0,
                source.energy - store.getReservedAmount(roomName, "outgoing", source.id, RESOURCE_ENERGY)
            ),
            kind: "source",
            source: source,
            weight: 1,
        });
    }

    sources.sort(function (left, right) {
        if (right.weight !== left.weight) {
            return right.weight - left.weight;
        }

        if (right.amount !== left.amount) {
            return right.amount - left.amount;
        }

        return left.source.pos.getRangeTo(targetObject) - right.source.pos.getRangeTo(targetObject);
    });

    for (const entry of sources) {
        if (entry.amount <= 0) {
            continue;
        }

        return {
            amount: Math.min(requestedAmount, entry.amount),
            kind: entry.kind,
            source: entry.source,
        };
    }

    return null;
}

function buildMineTask(roomName, sourceSpec) {
    return {
        createdAt: Game.time,
        data: {
            minerPos: sourceSpec.minerPos,
            roomName: roomName,
            sourceId: sourceSpec.id,
        },
        id: store.nextTaskId(constants.taskTypes.MINE),
        parentIntentId: buildIntentId(roomName, "mine"),
        priority: constants.priorities.MINE,
        role: constants.roles.MINER,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: ["move", "harvest"],
        type: constants.taskTypes.MINE,
        updatedAt: Game.time,
    };
}

function buildDefendTask(roomName) {
    return {
        createdAt: Game.time,
        data: {
            roomName: roomName,
        },
        id: store.nextTaskId(constants.taskTypes.DEFEND_ROOM),
        parentIntentId: buildIntentId(roomName, "defend"),
        priority: constants.priorities.DEFENSE,
        role: constants.roles.ATTACKER,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: ["move", "attack"],
        type: constants.taskTypes.DEFEND_ROOM,
        updatedAt: Game.time,
    };
}

function buildScoutTask(roomName, intent) {
    return {
        createdAt: Game.time,
        data: {
            originRoomName: roomName,
            targetRoomName: intent.targetRoomName,
        },
        id: store.nextTaskId(constants.taskTypes.SCOUT_ROOM),
        parentIntentId: intent.id,
        priority: constants.priorities.SCOUT,
        role: constants.roles.SCOUT,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: ["move"],
        type: constants.taskTypes.SCOUT_ROOM,
        updatedAt: Game.time,
    };
}

function buildClaimTask(roomName, intent) {
    return {
        createdAt: Game.time,
        data: {
            originRoomName: roomName,
            targetRoomName: intent.targetRoomName,
        },
        id: store.nextTaskId(constants.taskTypes.CLAIM_ROOM),
        parentIntentId: intent.id,
        priority: constants.priorities.CLAIM,
        role: constants.roles.CLAIMER,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: ["move", "claim"],
        type: constants.taskTypes.CLAIM_ROOM,
        updatedAt: Game.time,
    };
}

function buildBootstrapTask(roomName, intent) {
    return {
        createdAt: Game.time,
        data: {
            originRoomName: roomName,
            stage: "move",
            targetPos: null,
            targetRoomName: intent.targetRoomName,
        },
        id: store.nextTaskId(constants.taskTypes.BOOTSTRAP_SPAWN),
        parentIntentId: intent.id,
        priority: constants.priorities.BOOTSTRAP,
        role: constants.roles.UNIVERSAL,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: ["move", "collect", "build"],
        type: constants.taskTypes.BOOTSTRAP_SPAWN,
        updatedAt: Game.time,
    };
}

function reconcileRoleSpawnDemand(roomName, room, role, desiredCount, context) {
    const aliveCount = census.getOriginRoleCount(roomName, role);
    const queuedTasks = store.listRoomTasks(roomName, function (task) {
        return task.type === constants.taskTypes.SPAWN_CREEP && task.data.role === role;
    });
    const queuedCount = queuedTasks.length;
    const missingCount = Math.max(0, desiredCount - aliveCount - queuedCount);

    if (aliveCount + queuedCount > desiredCount) {
        trimExcessSpawnTasks(roomName, role, Math.max(0, desiredCount - aliveCount));
    }

    for (let index = 0; index < missingCount; index += 1) {
        const spawnTask = buildSpawnTask(roomName, room, role, context);

        if (!spawnTask) {
            break;
        }

        store.addTask(spawnTask);
    }
}

function trimExcessSpawnTasks(roomName, role, allowedQueuedCount) {
    const queuedTasks = store
        .listRoomTasks(roomName, function (task) {
            return (
                task.type === constants.taskTypes.SPAWN_CREEP &&
                task.data.role === role &&
                task.status === constants.taskStatuses.PENDING
            );
        })
        .sort(function (left, right) {
            return (right.createdAt || 0) - (left.createdAt || 0);
        });

    for (let index = allowedQueuedCount; index < queuedTasks.length; index += 1) {
        store.removeTask(roomName, queuedTasks[index].id, {
            clearAssignments: true,
        });
    }
}

function buildSpawnTask(roomName, room, role, context) {
    const body = buildRoleBody(role, room);

    if (body.length === 0) {
        return null;
    }

    const memory = {
        originRoomName: roomName,
        role: role,
    };

    if (role === constants.roles.SCOUT && context.scoutIntents[0]) {
        memory.targetRoomName = context.scoutIntents[0].targetRoomName;
    }

    if (role === constants.roles.CLAIMER && context.claimIntents[0]) {
        memory.targetRoomName = context.claimIntents[0].targetRoomName;
    }

    return {
        createdAt: Game.time,
        data: {
            body: body,
            memory: memory,
            role: role,
        },
        expiresAt: Game.time + 300,
        id: store.nextTaskId(constants.taskTypes.SPAWN_CREEP),
        parentIntentId: buildIntentId(roomName, "spawn"),
        priority: constants.priorities.SPAWN,
        role: constants.roles.SPAWNER,
        roomName: roomName,
        status: constants.taskStatuses.PENDING,
        steps: ["spawn"],
        type: constants.taskTypes.SPAWN_CREEP,
        updatedAt: Game.time,
    };
}

function buildRoleBody(role, room) {
    if (role === constants.roles.UNIVERSAL) {
        return buildUniversalBody(room, false);
    }

    if (role === constants.roles.MINER) {
        return buildMinerBody(room);
    }

    if (role === constants.roles.ATTACKER) {
        return buildRepeatedBody(room.energyCapacityAvailable, [MOVE, ATTACK]);
    }

    if (role === constants.roles.SCOUT) {
        return [MOVE];
    }

    if (role === constants.roles.CLAIMER) {
        return room.energyCapacityAvailable >= 650
            ? [CLAIM, MOVE]
            : [];
    }

    return [];
}

function buildUniversalBody(room, useAvailableEnergy) {
    const budget = useAvailableEnergy
        ? room.energyAvailable
        : room.energyCapacityAvailable;
    const partSet = [MOVE, WORK, CARRY];
    const body = [];
    let cost = 0;

    while (body.length + partSet.length <= MAX_CREEP_SIZE) {
        const nextCost = getBodyCost(partSet);

        if (cost + nextCost > budget) {
            break;
        }

        body.push(partSet[0], partSet[1], partSet[2]);
        cost += nextCost;
    }

    return body.length > 0 ? body : partSet.slice();
}

function buildMinerBody(room) {
    const budget = room.energyCapacityAvailable;
    const body = [];
    let workParts = 0;
    let cost = 0;

    while (body.length + 3 <= MAX_CREEP_SIZE && workParts < 5) {
        if (cost + BODYPART_COST[WORK] * 2 + BODYPART_COST[MOVE] > budget) {
            break;
        }

        body.push(WORK, WORK, MOVE);
        workParts += 2;
        cost += BODYPART_COST[WORK] * 2 + BODYPART_COST[MOVE];
    }

    return body.length > 0 ? body : [WORK, WORK, MOVE];
}

function buildRepeatedBody(budget, partSet) {
    const body = [];
    let cost = 0;
    const partCost = getBodyCost(partSet);

    while (body.length + partSet.length <= MAX_CREEP_SIZE) {
        if (cost + partCost > budget) {
            break;
        }

        for (const part of partSet) {
            body.push(part);
        }

        cost += partCost;
    }

    return body.length > 0 ? body : partSet.slice();
}

function getBodyCost(body) {
    let total = 0;

    for (const part of body) {
        total += BODYPART_COST[part] || 0;
    }

    return total;
}

function getSpawnIntentProgress(roomName, targetUniversals, sourceCount) {
    const target = Math.max(1, targetUniversals + sourceCount);
    const current =
        census.getOriginRoleCount(roomName, constants.roles.UNIVERSAL) +
        census.getOriginRoleCount(roomName, constants.roles.MINER);

    return Math.min(1, current / target);
}

function calculateConstructionProgress(constructionSites) {
    if (constructionSites.length === 0) {
        return 1;
    }

    let progress = 0;
    let total = 0;

    for (const site of constructionSites) {
        progress += site.progress || 0;
        total += site.progressTotal || 0;
    }

    if (total <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(1, progress / total));
}

function getUpgradeIntentProgress(room) {
    if (!room.controller.progressTotal) {
        return 0;
    }

    return Math.max(0, Math.min(1, room.controller.progress / room.controller.progressTotal));
}

function getUpgradeTaskAmount(room) {
    return Math.max(50, Math.min(200, room.energyCapacityAvailable || 200));
}

function hasSourceSpec(sourceSpecs, sourceId) {
    return sourceSpecs.some(function (sourceSpec) {
        return sourceSpec.id === sourceId;
    });
}

function hasTaskForTarget(roomName, taskType, targetRef) {
    return store.countRoomTasks(roomName, function (task) {
        return Boolean(
            task.type === taskType &&
            (
                task.data.targetId === targetRef ||
                task.data.targetRoomName === targetRef
            )
        );
    }) > 0;
}

function hasMatchingScoutIntent(scoutIntents, task) {
    return scoutIntents.some(function (intent) {
        return intent.targetRoomName === task.data.targetRoomName;
    });
}

function hasMatchingClaimIntent(claimIntents, task) {
    return claimIntents.some(function (intent) {
        return intent.targetRoomName === task.data.targetRoomName;
    });
}

function hasMatchingBootstrapIntent(bootstrapIntents, task) {
    return bootstrapIntents.some(function (intent) {
        return intent.targetRoomName === task.data.targetRoomName;
    });
}

function upsertRoomIntent(roomName, suffix, data) {
    const intentId = buildIntentId(roomName, suffix);
    return store.upsertIntent(roomName, Object.assign({}, data, {
        id: intentId,
        roomName: roomName,
    }));
}

function buildIntentId(roomName, suffix) {
    return `${roomName}:${suffix}`;
}

function markReservationFailure(roomName) {
    const planner = store.getRoomPlanner(roomName);
    planner.stats.lastReservationFailureTick = Game.time;
}

function hasAvailableClaimSlot() {
    const ownedRooms = roomScope.getOwnedRoomNames().length;
    return ownedRooms < Game.gcl.level;
}

function findExpansionOpportunity(expansion) {
    const ownedRooms = buildRoomSet(roomScope.getOwnedRoomNames());

    for (const originRoomName of roomScope.getOperationalRoomNames()) {
        const opportunity = walkExpansionFrontier(originRoomName, expansion.roomIntel, ownedRooms);

        if (opportunity) {
            return opportunity;
        }
    }

    return null;
}

function walkExpansionFrontier(originRoomName, roomIntel, ownedRooms) {
    const frontier = [{
        depth: 0,
        roomName: originRoomName,
    }];
    const visited = {};

    while (frontier.length > 0) {
        const current = frontier.shift();

        if (current.depth >= constants.expansion.SEARCH_DEPTH) {
            continue;
        }

        const exits = Game.map.describeExits(current.roomName) || {};
        const nextRoomNames = Object.values(exits).sort();

        for (const nextRoomName of nextRoomNames) {
            if (ownedRooms[nextRoomName] || visited[nextRoomName]) {
                continue;
            }

            visited[nextRoomName] = true;

            const intel = roomIntel[nextRoomName];

            if (!isFreshIntel(intel)) {
                return {
                    originRoomName: originRoomName,
                    targetRoomName: nextRoomName,
                    type: constants.taskTypes.SCOUT_ROOM,
                };
            }

            if (intel.claimable) {
                return {
                    originRoomName: originRoomName,
                    targetRoomName: nextRoomName,
                    type: constants.taskTypes.CLAIM_ROOM,
                };
            }

            frontier.push({
                depth: current.depth + 1,
                roomName: nextRoomName,
            });
        }
    }

    return null;
}

function isFreshIntel(intel) {
    return intel && Game.time - intel.scoutedAt <= constants.expansion.INTEL_TTL;
}

function reconcileActiveScout(expansion) {
    if (!expansion.activeScout) {
        return;
    }

    const visibleRoom = Game.rooms[expansion.activeScout.targetRoomName];

    if (!visibleRoom) {
        return;
    }

    observer.recordRoomIntel(visibleRoom);
    store.markRoomDirty(expansion.activeScout.originRoomName, "scoutResolved");
    expansion.activeScout = null;
}

function reconcileActiveCandidate(expansion) {
    if (!expansion.activeCandidate) {
        return;
    }

    if (hasAvailableClaimSlot() && expansion.activeCandidate.status === "waitingForGcl") {
        expansion.activeCandidate.status = "claiming";
    }

    const visibleRoom = Game.rooms[expansion.activeCandidate.targetRoomName];

    if (!visibleRoom) {
        return;
    }

    const intel = observer.recordRoomIntel(visibleRoom);

    if (visibleRoom.controller && visibleRoom.controller.my) {
        expansion.bootstrapRequests[visibleRoom.name] = {
            createdAt: Game.time,
            originRoomName: expansion.activeCandidate.originRoomName,
            targetRoomName: visibleRoom.name,
        };
        store.markRoomDirty(expansion.activeCandidate.originRoomName, "bootstrapRequest");
        expansion.activeCandidate = null;
        return;
    }

    if (!intel.claimable) {
        store.markRoomDirty(expansion.activeCandidate.originRoomName, "claimInvalid");
        expansion.activeCandidate = null;
        return;
    }

    if (!hasAvailableClaimSlot()) {
        expansion.activeCandidate.status = "waitingForGcl";
        return;
    }

    expansion.activeCandidate.status = "claiming";
}

function cleanupBootstrapRequests(expansion) {
    for (const targetRoomName in expansion.bootstrapRequests) {
        if (census.getSpawnCount(targetRoomName) > 0) {
            delete expansion.bootstrapRequests[targetRoomName];
        }
    }
}

function syncGlobalIntents(expansion) {
    const nextIds = {};

    if (expansion.activeScout) {
        const scoutIntentId = buildGlobalIntentId("scout", expansion.activeScout.originRoomName, expansion.activeScout.targetRoomName);
        nextIds[scoutIntentId] = true;
        store.upsertGlobalIntent({
            id: scoutIntentId,
            originRoomName: expansion.activeScout.originRoomName,
            priority: constants.priorities.SCOUT,
            scope: "global",
            status: constants.intentStatuses.ACTIVE,
            targetRoomName: expansion.activeScout.targetRoomName,
            type: constants.taskTypes.SCOUT_ROOM,
        });
    }

    if (expansion.activeCandidate) {
        const claimIntentId = buildGlobalIntentId("claim", expansion.activeCandidate.originRoomName, expansion.activeCandidate.targetRoomName);
        nextIds[claimIntentId] = true;
        store.upsertGlobalIntent({
            id: claimIntentId,
            originRoomName: expansion.activeCandidate.originRoomName,
            priority: constants.priorities.CLAIM,
            scope: "global",
            status: expansion.activeCandidate.status === "waitingForGcl"
                ? constants.intentStatuses.BLOCKED
                : constants.intentStatuses.ACTIVE,
            targetRoomName: expansion.activeCandidate.targetRoomName,
            type: constants.taskTypes.CLAIM_ROOM,
        });
    }

    for (const targetRoomName in expansion.bootstrapRequests) {
        const request = expansion.bootstrapRequests[targetRoomName];
        const bootstrapIntentId = buildGlobalIntentId("bootstrap", request.originRoomName, targetRoomName);
        nextIds[bootstrapIntentId] = true;
        store.upsertGlobalIntent({
            id: bootstrapIntentId,
            originRoomName: request.originRoomName,
            priority: constants.priorities.BOOTSTRAP,
            scope: "global",
            status: constants.intentStatuses.ACTIVE,
            targetRoomName: targetRoomName,
            type: constants.taskTypes.BOOTSTRAP_SPAWN,
        });
    }

    const currentIntents = store.getGlobalIntents();

    for (const intentId in currentIntents) {
        if (!nextIds[intentId]) {
            store.removeGlobalIntent(intentId);
        }
    }
}

function buildGlobalIntentId(prefix, originRoomName, targetRoomName) {
    return `${prefix}:${originRoomName}:${targetRoomName}`;
}

function buildRoomSet(roomNames) {
    const set = {};

    for (const roomName of roomNames) {
        set[roomName] = true;
    }

    return set;
}

function isScoutIntent(intent) {
    return intent.type === constants.taskTypes.SCOUT_ROOM;
}

function isClaimIntent(intent) {
    return intent.type === constants.taskTypes.CLAIM_ROOM;
}

function isBootstrapIntent(intent) {
    return intent.type === constants.taskTypes.BOOTSTRAP_SPAWN;
}

module.exports = {
    reconcileDirtyRooms,
    reconcileExpansion,
};
