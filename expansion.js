const constants = require("./constants");
const dispatcherCleanup = require("./dispatcher.cleanup");
const firstSpawnPlanner = require("./planner.first_spawn");

const STAGES = {
    SCOUT: "scout",
    CLAIM: "claim",
    BOOTSTRAP_SPAWN: "bootstrap_spawn",
};

const MAX_SCOUT_DEPTH = 5;
const MAX_SCOUTS = 2;
const MAX_COLONIZERS = 2;
const EXPANSION_ROLES = {};

EXPANSION_ROLES[constants.roles.SCOUT] = true;
EXPANSION_ROLES[constants.roles.CLAIMER] = true;
EXPANSION_ROLES[constants.roles.COLONIZER] = true;

function reconcile(room, ctx) {
    const store = getStore();
    const ownedRoomNames = getOwnedRoomNames();
    const coordinatorRoomName = ownedRoomNames[0] || null;

    if (!coordinatorRoomName || room.name !== coordinatorRoomName) {
        return;
    }

    if (!store.activeCampaign) {
        if (!hasFreeGclSlot(ownedRoomNames.length)) {
            cleanupInactiveExpansion(ctx);
            clearDiscoveryState(store);
            return;
        }

        store.activeCampaign = createCampaign(store, coordinatorRoomName);
        ctx.log(`[expansion] start ${store.activeCampaign.campaignId} from ${coordinatorRoomName}`);
    }

    let campaign = store.activeCampaign;

    if (!campaign) {
        cleanupInactiveExpansion(ctx);
        return;
    }

    normalizeCampaignState(campaign);
    campaign.coordinatorRoomName = coordinatorRoomName;
    primeOwnedRooms(store, ownedRoomNames, campaign);
    normalizeFrontierQueue(store, campaign);

    if (
        !hasFreeGclSlot(ownedRoomNames.length) &&
        !canContinueWithoutFreeSlot(campaign)
    ) {
        ctx.log(`[expansion] abort ${campaign.campaignId} (no free GCL slot)`);
        clearCampaign(store);
        cleanupInactiveExpansion(ctx);
        return;
    }

    if (campaign.stage === STAGES.SCOUT) {
        reconcileScoutStage(store, campaign, ctx, ownedRoomNames);
    }
    else if (campaign.stage === STAGES.CLAIM) {
        reconcileClaimStage(store, campaign, ctx, ownedRoomNames);
    }
    else if (campaign.stage === STAGES.BOOTSTRAP_SPAWN) {
        reconcileBootstrapStage(store, campaign, ctx, ownedRoomNames);
    }

    campaign = store.activeCampaign;

    if (!campaign) {
        cleanupInactiveExpansion(ctx);
        return;
    }

    syncExpansionTasks(ctx, campaign);
    syncSpawnTasks(ctx, store, campaign);
}

function getStore() {
    if (!Memory.Expansion) {
        Memory.Expansion = {
            activeCampaign: null,
            candidateRooms: [],
            enemyRooms: [],
            frontierQueue: [],
            scoutedRooms: {},
            sequence: 0,
            spawnSite: null,
        };
    }

    if (!Memory.Expansion.scoutedRooms) {
        Memory.Expansion.scoutedRooms = {};
    }

    if (!Array.isArray(Memory.Expansion.frontierQueue)) {
        Memory.Expansion.frontierQueue = [];
    }

    if (!Array.isArray(Memory.Expansion.enemyRooms)) {
        Memory.Expansion.enemyRooms = [];
    }

    if (!Array.isArray(Memory.Expansion.candidateRooms)) {
        Memory.Expansion.candidateRooms = [];
    }

    if (Memory.Expansion.sequence === undefined) {
        Memory.Expansion.sequence = 0;
    }

    normalizeCampaignState(Memory.Expansion.activeCampaign);
    normalizeDiscoveryState(Memory.Expansion);
    normalizeFrontierQueue(Memory.Expansion, Memory.Expansion.activeCampaign);

    return Memory.Expansion;
}

function getActiveCampaign() {
    return getStore().activeCampaign || null;
}

function getEnemyDistanceHeatmap() {
    const store = getStore();
    const distances = store.enemyRooms.length > 0
        ? computeGraphDistances(store.scoutedRooms, store.enemyRooms, {
            maxDepth: MAX_SCOUT_DEPTH,
            stopAtEnemy: true,
        })
        : {};
    let maxDistance = 0;

    for (const roomName in store.scoutedRooms) {
        if (!Number.isFinite(distances[roomName])) {
            continue;
        }

        maxDistance = Math.max(maxDistance, distances[roomName]);
    }

    return {
        distances: distances,
        enemyRooms: store.enemyRooms.slice(),
        maxDistance: maxDistance,
        scoutedRooms: store.scoutedRooms,
    };
}

function isExpansionRole(roleName) {
    return !!EXPANSION_ROLES[roleName];
}

function pickNextScoutRoom(task) {
    const store = getStore();
    const campaign = store.activeCampaign;
    const assignedRoomNames = getAssignedScoutRooms(task);
    const queue = store.frontierQueue.slice().sort(compareFrontierEntries);

    for (const entry of queue) {
        if (!entry || !entry.roomName) {
            continue;
        }

        if (store.scoutedRooms[entry.roomName]) {
            continue;
        }

        if (assignedRoomNames[entry.roomName]) {
            continue;
        }

        if (
            campaign &&
            isBlockedScoutDirection(
                campaign,
                entry.sourceRoomName || null,
                entry.firstHopRoomName || null
            )
        ) {
            continue;
        }

        return entry;
    }

    return null;
}

function recordScoutedRoom(roomName, scoutData) {
    const room = Game.rooms[roomName];

    if (!room) {
        return false;
    }

    const store = getStore();
    const depth = Number.isFinite(scoutData && scoutData.depth)
        ? scoutData.depth
        : getQueuedDepth(store.frontierQueue, roomName);
    const existing = store.scoutedRooms[roomName];
    const nextDepth = pickKnownDepth(existing, depth);
    const classification = classifyRoom(room);
    const exits = listRoomExits(roomName);
    const sourceRoomName = scoutData && scoutData.sourceRoomName
        ? scoutData.sourceRoomName
        : null;
    const firstHopRoomName = scoutData && scoutData.firstHopRoomName
        ? scoutData.firstHopRoomName
        : (nextDepth === 1 ? roomName : null);

    store.scoutedRooms[roomName] = {
        controllerState: getControllerState(room.controller),
        depth: nextDepth,
        exits: exits,
        lastSeen: Game.time,
        status: classification.status,
    };

    store.frontierQueue = store.frontierQueue.filter(function (entry) {
        return entry.roomName !== roomName;
    });

    refreshDiscoveryIndexes(store);

    if (classification.status !== "enemy" && nextDepth < MAX_SCOUT_DEPTH) {
        for (const exitRoomName of exits) {
            enqueueFrontierRoom(
                store,
                exitRoomName,
                nextDepth + 1,
                sourceRoomName,
                firstHopRoomName,
                store.activeCampaign
            );
        }
    }

    return true;
}

function getSpawnSitePlan(targetRoomName) {
    const store = getStore();

    if (
        store.spawnSite &&
        store.spawnSite.roomName === targetRoomName
    ) {
        return store.spawnSite;
    }

    return null;
}

function getSpawnSiteObject(targetRoomName) {
    const room = Game.rooms[targetRoomName];

    if (!room) {
        return null;
    }

    const sites = room.find(FIND_MY_CONSTRUCTION_SITES).filter(function (site) {
        return site.structureType === STRUCTURE_SPAWN;
    });

    if (sites.length === 0) {
        return null;
    }

    sites.sort(function (left, right) {
        if (left.pos.x !== right.pos.x) {
            return left.pos.x - right.pos.x;
        }

        if (left.pos.y !== right.pos.y) {
            return left.pos.y - right.pos.y;
        }

        return String(left.id).localeCompare(String(right.id));
    });

    return sites[0];
}

function reconcileScoutStage(store, campaign, ctx, ownedRoomNames) {
    campaign.scoutSearchComplete = isScoutSearchComplete(store, campaign);

    if (!campaign.scoutSearchComplete) {
        return;
    }

    const selection = selectTargetRoom(store, campaign, ownedRoomNames);

    if (!selection) {
        return;
    }

    campaign.stage = STAGES.CLAIM;
    campaign.originRoomName = selection.originRoomName;
    campaign.targetRoomName = selection.targetRoomName;
    store.spawnSite = null;

    cleanupRoleActions(constants.roles.SCOUT, campaign.campaignId, "expansion-stage-claim");
    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.SCOUT);

    ctx.log(
        `[expansion] target ${selection.targetRoomName} from ${selection.originRoomName} (enemy distance=${formatEnemyDistance(selection.enemyDistance)})`
    );
}

function reconcileClaimStage(store, campaign, ctx, ownedRoomNames) {
    if (isEnemyOwnedRoomName(campaign.targetRoomName)) {
        restartScoutStage(store, campaign, ctx, `target ${campaign.targetRoomName} became enemy-owned`, true);
        return;
    }

    if (isRoomClaimedByMe(campaign.targetRoomName)) {
        campaign.stage = STAGES.BOOTSTRAP_SPAWN;
        campaign.originRoomName = pickOriginSpawnRoom(store, ownedRoomNames, campaign.targetRoomName, campaign)
            || campaign.originRoomName
            || campaign.coordinatorRoomName;
        cleanupRoleActions(constants.roles.CLAIMER, campaign.campaignId, "expansion-stage-bootstrap");
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
        ctx.log(`[expansion] claimed ${campaign.targetRoomName}, bootstrap from ${campaign.originRoomName}`);
        return;
    }

    campaign.originRoomName = pickOriginSpawnRoom(store, ownedRoomNames, campaign.targetRoomName, campaign)
        || campaign.originRoomName
        || campaign.coordinatorRoomName;
}

function reconcileBootstrapStage(store, campaign, ctx, ownedRoomNames) {
    if (isEnemyOwnedRoomName(campaign.targetRoomName)) {
        restartScoutStage(store, campaign, ctx, `target ${campaign.targetRoomName} lost before spawn`, true);
        return;
    }

    if (!isRoomClaimedByMe(campaign.targetRoomName)) {
        campaign.stage = STAGES.CLAIM;
        store.spawnSite = null;
        ctx.log(`[expansion] lost claim on ${campaign.targetRoomName}, back to claim`);
        return;
    }

    campaign.originRoomName = pickOriginSpawnRoom(store, ownedRoomNames, campaign.targetRoomName, campaign)
        || campaign.originRoomName
        || campaign.coordinatorRoomName;

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (!targetRoom) {
        return;
    }

    if (getOwnedSpawn(targetRoom)) {
        completeCampaign(store, campaign, ctx);
        return;
    }

    const site = getSpawnSiteObject(campaign.targetRoomName);

    if (site) {
        store.spawnSite = {
            roomName: campaign.targetRoomName,
            x: site.pos.x,
            y: site.pos.y,
        };
        return;
    }

    if (!store.spawnSite || store.spawnSite.roomName !== campaign.targetRoomName) {
        const position = firstSpawnPlanner.findFirstSpawnPosition(targetRoom);

        if (!position) {
            restartScoutStage(
                store,
                campaign,
                ctx,
                `no valid spawn tile in ${campaign.targetRoomName}`,
                true
            );
            return;
        }

        store.spawnSite = {
            roomName: campaign.targetRoomName,
            x: position.x,
            y: position.y,
        };
        ctx.log(`[expansion] planned first spawn at ${campaign.targetRoomName}:${position.x}:${position.y}`);
    }
}

function completeCampaign(store, campaign, ctx) {
    const targetRoomName = campaign.targetRoomName;
    const campaignId = campaign.campaignId;

    removeExpansionTasks(ctx, campaignId);
    removeQueuedSpawnTasks(ctx, campaignId);
    retireLiveExpansionCreeps(campaignId, [constants.roles.SCOUT, constants.roles.CLAIMER]);
    convertColonizers(campaignId, targetRoomName);
    ensureRoomStartupTasks(targetRoomName, ctx);
    clearCampaign(store);

    ctx.log(`[expansion] completed ${campaignId} into ${targetRoomName}`);
}

function restartScoutStage(store, campaign, ctx, reason, markTargetInvalid) {
    if (markTargetInvalid && campaign.targetRoomName) {
        if (!campaign.invalidTargetRoomNames) {
            campaign.invalidTargetRoomNames = {};
        }

        campaign.invalidTargetRoomNames[campaign.targetRoomName] = true;
    }

    cleanupRoleActions(constants.roles.CLAIMER, campaign.campaignId, "expansion-restart");
    cleanupRoleActions(constants.roles.COLONIZER, campaign.campaignId, "expansion-restart");
    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);
    retireLiveExpansionCreeps(campaign.campaignId, [
        constants.roles.CLAIMER,
        constants.roles.COLONIZER,
    ]);

    campaign.stage = STAGES.SCOUT;
    campaign.originRoomName = null;
    campaign.scoutSearchComplete = false;
    campaign.targetRoomName = null;
    store.spawnSite = null;

    ctx.log(`[expansion] restart scouting (${reason})`);
}

function syncExpansionTasks(ctx, campaign) {
    const desiredRooms = {};
    const liveScouts = countLiveExpansionCreeps(campaign.campaignId, constants.roles.SCOUT);
    const liveClaimers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.CLAIMER);
    const liveColonizers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.COLONIZER);

    if (campaign.stage === STAGES.SCOUT || liveScouts > 0) {
        desiredRooms[campaign.coordinatorRoomName] = true;
    }

    if (
        campaign.originRoomName &&
        (
            campaign.stage === STAGES.CLAIM ||
            campaign.stage === STAGES.BOOTSTRAP_SPAWN ||
            liveClaimers > 0 ||
            liveColonizers > 0
        )
    ) {
        desiredRooms[campaign.originRoomName] = true;
    }

    const allTasks = ctx.listTasks();

    for (const task of allTasks) {
        if (task.type !== constants.taskTypes.EXPANSION) {
            continue;
        }

        if (task.data.campaignId !== campaign.campaignId || !desiredRooms[task.room]) {
            ctx.removeTask(task.id);
        }
    }

    for (const roomName in desiredRooms) {
        const hasTask = ctx.listTasks(roomName).some(function (task) {
            return (
                task.type === constants.taskTypes.EXPANSION &&
                task.data.campaignId === campaign.campaignId
            );
        });

        if (!hasTask) {
            ctx.addTask(constants.taskTypes.EXPANSION, roomName, {
                campaignId: campaign.campaignId,
            });
        }
    }
}

function syncSpawnTasks(ctx, store, campaign) {
    if (campaign.stage === STAGES.SCOUT) {
        syncRoleSpawnTasks(
            ctx,
            campaign,
            constants.roles.SCOUT,
            campaign.scoutSearchComplete ? 0 : MAX_SCOUTS,
            campaign.coordinatorRoomName
        );
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);
        return;
    }

    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.SCOUT);

    if (campaign.stage === STAGES.CLAIM) {
        syncRoleSpawnTasks(ctx, campaign, constants.roles.CLAIMER, 1, campaign.originRoomName);
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);
        return;
    }

    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
    syncRoleSpawnTasks(ctx, campaign, constants.roles.COLONIZER, MAX_COLONIZERS, campaign.originRoomName);
}

function syncRoleSpawnTasks(ctx, campaign, role, desiredCount, roomName) {
    const allTasks = ctx.listTasks();
    const matchingTasks = [];
    let existingCount = countLiveExpansionCreeps(campaign.campaignId, role);

    for (const task of allTasks) {
        if (!isMatchingExpansionSpawnTask(task, campaign.campaignId, role)) {
            continue;
        }

        if (task.room !== roomName) {
            ctx.removeTask(task.id);
            continue;
        }

        matchingTasks.push(task);
    }

    existingCount += matchingTasks.length;

    while (existingCount > desiredCount && matchingTasks.length > 0) {
        const task = matchingTasks.pop();
        ctx.removeTask(task.id);
        existingCount -= 1;
    }

    while (existingCount < desiredCount) {
        ctx.addTask(constants.taskTypes.SPAWN_CREEP, roomName, {
            memory: {
                expansionCampaignId: campaign.campaignId,
                expansionTargetRoomName: campaign.targetRoomName || null,
            },
            role: role,
        });
        existingCount += 1;
    }
}

function removeQueuedSpawnTasks(ctx, campaignId, role) {
    const allTasks = ctx.listTasks();

    for (const task of allTasks) {
        if (!isMatchingExpansionSpawnTask(task, campaignId, role)) {
            continue;
        }

        ctx.removeTask(task.id);
    }
}

function removeExpansionTasks(ctx, campaignId) {
    const allTasks = ctx.listTasks();

    for (const task of allTasks) {
        if (
            task.type === constants.taskTypes.EXPANSION &&
            task.data.campaignId === campaignId
        ) {
            ctx.removeTask(task.id);
        }
    }
}

function cleanupInactiveExpansion(ctx) {
    const allTasks = ctx.listTasks();

    for (const task of allTasks) {
        if (
            task.type === constants.taskTypes.EXPANSION ||
            isMatchingExpansionSpawnTask(task)
        ) {
            ctx.removeTask(task.id);
        }
    }

    retireLiveExpansionCreeps(null, [
        constants.roles.SCOUT,
        constants.roles.CLAIMER,
        constants.roles.COLONIZER,
    ]);
}

function ensureRoomStartupTasks(roomName, ctx) {
    const roomTasks = ctx.listTasks(roomName);
    const room = Game.rooms[roomName];

    ensureTask(roomTasks, constants.taskTypes.CHECKER, function () {
        return {
            nextCheckIndex: 0,
            nextRunTick: Game.time,
        };
    }, ctx, roomName);

    ensureTask(roomTasks, constants.taskTypes.BUILD, function () {
        return {};
    }, ctx, roomName);

    if (
        room &&
        room.controller &&
        room.controller.my &&
        Number.isFinite(room.controller.progressTotal) &&
        room.controller.progressTotal > 0
    ) {
        ensureTask(roomTasks, constants.taskTypes.UPGRADE_CONTROLLER, function () {
            return {
                total: room.controller.progressTotal,
            };
        }, ctx, roomName);
    }

    const existingUniversalSpawnTasks = roomTasks.filter(function (task) {
        return (
            task.type === constants.taskTypes.SPAWN_CREEP &&
            task.data.role === constants.roles.UNIVERSAL
        );
    }).length;

    for (let index = existingUniversalSpawnTasks; index < 3; index += 1) {
        ctx.addTask(constants.taskTypes.SPAWN_CREEP, roomName, {
            role: constants.roles.UNIVERSAL,
        });
    }
}

function ensureTask(roomTasks, taskType, createData, ctx, roomName) {
    const hasTask = roomTasks.some(function (task) {
        return task.type === taskType;
    });

    if (!hasTask) {
        ctx.addTask(taskType, roomName, createData());
    }
}

function convertColonizers(campaignId, targetRoomName) {
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role !== constants.roles.COLONIZER ||
            creep.memory.expansionCampaignId !== campaignId
        ) {
            continue;
        }

        creep.memory.role = constants.roles.UNIVERSAL;
        creep.memory.originRoomName = targetRoomName;
        creep.memory.actionIds = [];
        delete creep.memory.expansionCampaignId;
        delete creep.memory.expansionTargetRoomName;
    }
}

function retireLiveExpansionCreeps(campaignId, roles) {
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            !roles.includes(creep.memory.role) ||
            !isExpansionRole(creep.memory.role)
        ) {
            continue;
        }

        if (
            campaignId &&
            creep.memory.expansionCampaignId !== campaignId
        ) {
            continue;
        }

        creep.suicide();
    }
}

function cleanupRoleActions(role, campaignId, reason) {
    const actionIds = Object.keys(Memory.Dispatcher.actionsById || {});

    for (const actionId of actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (!action || action.executorType !== role) {
            continue;
        }

        const memory = getExecutorMemory(action.executorName);

        if (
            campaignId &&
            (!memory || memory.expansionCampaignId !== campaignId)
        ) {
            continue;
        }

        dispatcherCleanup.cleanupAssignedAction(action, {
            invokeCancel: true,
            reason: reason || "expansion-transition",
        });
    }
}

function getExecutorMemory(creepName) {
    if (Game.creeps[creepName]) {
        return Game.creeps[creepName].memory;
    }

    if (Memory.creeps && Memory.creeps[creepName]) {
        return Memory.creeps[creepName];
    }

    return null;
}

function createCampaign(store, coordinatorRoomName) {
    store.sequence += 1;

    return {
        blockedScoutDirections: {},
        campaignId: `expansion:${store.sequence}`,
        coordinatorRoomName: coordinatorRoomName,
        invalidTargetRoomNames: {},
        originRoomName: null,
        scoutSearchComplete: false,
        stage: STAGES.SCOUT,
        targetRoomName: null,
    };
}

function clearCampaign(store) {
    store.activeCampaign = null;
    store.spawnSite = null;
    clearDiscoveryState(store);
}

function clearDiscoveryState(store) {
    store.candidateRooms = [];
    store.enemyRooms = [];
    store.frontierQueue = [];
    store.scoutedRooms = {};
}

function primeOwnedRooms(store, ownedRoomNames, campaign) {
    for (const roomName of ownedRoomNames) {
        const room = Game.rooms[roomName];

        if (!room || !room.controller || !room.controller.my) {
            continue;
        }

        const existing = store.scoutedRooms[roomName];

        store.scoutedRooms[roomName] = {
            controllerState: getControllerState(room.controller),
            depth: 0,
            exits: listRoomExits(roomName),
            lastSeen: Game.time,
            status: "owned",
        };

        if (!existing || existing.status !== "enemy") {
            for (const exitRoomName of store.scoutedRooms[roomName].exits) {
                enqueueFrontierRoom(
                    store,
                    exitRoomName,
                    1,
                    roomName,
                    exitRoomName,
                    campaign
                );
            }
        }
    }

    refreshDiscoveryIndexes(store);
}

function enqueueFrontierRoom(
    store,
    roomName,
    depth,
    sourceRoomName,
    firstHopRoomName,
    campaign
) {
    if (!roomName || store.scoutedRooms[roomName]) {
        return;
    }

    if (!Number.isFinite(depth) || depth < 1 || depth > MAX_SCOUT_DEPTH) {
        return;
    }

    const normalizedSourceRoomName = sourceRoomName || null;
    const normalizedFirstHopRoomName = firstHopRoomName || (depth === 1 ? roomName : null);

    if (
        campaign &&
        isBlockedScoutDirection(
            campaign,
            normalizedSourceRoomName,
            normalizedFirstHopRoomName
        )
    ) {
        return;
    }

    const existingDepth = getQueuedDepth(
        store.frontierQueue,
        roomName,
        normalizedSourceRoomName,
        normalizedFirstHopRoomName
    );

    if (existingDepth !== null && existingDepth <= depth) {
        return;
    }

    store.frontierQueue = store.frontierQueue.filter(function (entry) {
        return !isSameFrontierEntry(
            entry,
            roomName,
            normalizedSourceRoomName,
            normalizedFirstHopRoomName
        );
    });

    store.frontierQueue.push({
        depth: depth,
        firstHopRoomName: normalizedFirstHopRoomName,
        roomName: roomName,
        sourceRoomName: normalizedSourceRoomName,
    });
}

function selectTargetRoom(store, campaign, ownedRoomNames) {
    const ownedDistances = computeGraphDistances(store.scoutedRooms, ownedRoomNames, {
        blockedScoutDirections: campaign.blockedScoutDirections,
        maxDepth: MAX_SCOUT_DEPTH,
        sourceRoomNames: ownedRoomNames,
        stopAtEnemy: true,
    });
    const validCandidateRoomNames = store.candidateRooms.filter(function (roomName) {
        return (
            !campaign.invalidTargetRoomNames[roomName] &&
            Number.isFinite(ownedDistances[roomName])
        );
    });

    if (validCandidateRoomNames.length === 0) {
        return null;
    }

    const enemyDistances = store.enemyRooms.length > 0
        ? computeGraphDistances(store.scoutedRooms, store.enemyRooms, {
            maxDepth: MAX_SCOUT_DEPTH,
            stopAtEnemy: true,
        })
        : {};
    let bestSelection = null;

    for (const roomName of validCandidateRoomNames) {
        const enemyDistance = Number.isFinite(enemyDistances[roomName])
            ? enemyDistances[roomName]
            : Infinity;
        const originDistance = ownedDistances[roomName];
        const originRoomName = pickOriginSpawnRoom(store, ownedRoomNames, roomName, campaign);

        if (
            !Number.isFinite(originDistance) ||
            !originRoomName
        ) {
            continue;
        }

        const selection = {
            enemyDistance: enemyDistance,
            originDistance: originDistance,
            originRoomName: originRoomName,
            targetRoomName: roomName,
        };

        if (
            !bestSelection ||
            selection.enemyDistance > bestSelection.enemyDistance ||
            (
                selection.enemyDistance === bestSelection.enemyDistance &&
                selection.originDistance < bestSelection.originDistance
            ) ||
            (
                selection.enemyDistance === bestSelection.enemyDistance &&
                selection.originDistance === bestSelection.originDistance &&
                selection.targetRoomName.localeCompare(bestSelection.targetRoomName) < 0
            )
        ) {
            bestSelection = selection;
        }
    }

    return bestSelection;
}

function pickOriginRoom(store, ownedRoomNames, targetRoomName, campaign) {
    let bestRoomName = null;
    let bestDistance = Infinity;

    for (const roomName of ownedRoomNames) {
        const distances = computeGraphDistances(store.scoutedRooms, [roomName], {
            blockedScoutDirections: campaign ? campaign.blockedScoutDirections : null,
            maxDepth: MAX_SCOUT_DEPTH,
            sourceRoomNames: [roomName],
            stopAtEnemy: true,
        });
        const distance = distances[targetRoomName];

        if (!Number.isFinite(distance)) {
            continue;
        }

        if (
            distance < bestDistance ||
            (distance === bestDistance && roomName.localeCompare(bestRoomName || "") < 0)
        ) {
            bestDistance = distance;
            bestRoomName = roomName;
        }
    }

    return bestRoomName;
}

function pickOriginSpawnRoom(store, ownedRoomNames, targetRoomName, campaign) {
    const spawnedRoomNames = ownedRoomNames.filter(function (roomName) {
        return roomName !== targetRoomName && roomHasOwnedSpawn(roomName);
    });

    if (spawnedRoomNames.length > 0) {
        return pickOriginRoom(store, spawnedRoomNames, targetRoomName, campaign);
    }

    const nonTargetRoomNames = ownedRoomNames.filter(function (roomName) {
        return roomName !== targetRoomName;
    });

    return pickOriginRoom(store, nonTargetRoomNames, targetRoomName, campaign);
}

function computeGraphDistances(scoutedRooms, sourceRoomNames, options) {
    const distances = {};
    const queue = [];
    const settings = options || {};
    const blockedScoutDirections = settings.blockedScoutDirections || null;
    const maxDepth = Number.isFinite(settings.maxDepth)
        ? settings.maxDepth
        : null;
    const sourceRoomNamesById = {};
    const stopAtEnemy = !!settings.stopAtEnemy;

    for (const roomName of sourceRoomNames) {
        if (!scoutedRooms[roomName] || distances[roomName] !== undefined) {
            continue;
        }

        sourceRoomNamesById[roomName] = true;
        distances[roomName] = 0;
        queue.push(roomName);
    }

    while (queue.length > 0) {
        const roomName = queue.shift();
        const roomState = scoutedRooms[roomName];
        const distance = distances[roomName];

        if (!roomState || !Array.isArray(roomState.exits)) {
            continue;
        }

        if (
            maxDepth !== null &&
            distance >= maxDepth
        ) {
            continue;
        }

        if (
            stopAtEnemy &&
            roomState.status === "enemy" &&
            distance > 0
        ) {
            continue;
        }

        for (const nextRoomName of roomState.exits) {
            if (!scoutedRooms[nextRoomName] || distances[nextRoomName] !== undefined) {
                continue;
            }

            if (
                blockedScoutDirections &&
                sourceRoomNamesById[roomName] &&
                isBlockedScoutDirectionState(
                    blockedScoutDirections,
                    roomName,
                    nextRoomName
                )
            ) {
                continue;
            }

            distances[nextRoomName] = distance + 1;
            queue.push(nextRoomName);
        }
    }

    return distances;
}

function refreshDiscoveryIndexes(store) {
    const enemyRooms = [];
    const candidateRooms = [];

    for (const roomName in store.scoutedRooms) {
        const roomState = store.scoutedRooms[roomName];

        if (roomState.status === "enemy") {
            enemyRooms.push(roomName);
        }
        else if (roomState.status === "candidate") {
            candidateRooms.push(roomName);
        }
    }

    enemyRooms.sort();
    candidateRooms.sort();

    store.enemyRooms = enemyRooms;
    store.candidateRooms = candidateRooms;
}

function normalizeDiscoveryState(store) {
    if (!store || !store.scoutedRooms) {
        return;
    }

    for (const roomName in store.scoutedRooms) {
        const roomState = store.scoutedRooms[roomName];

        if (!roomState) {
            delete store.scoutedRooms[roomName];
            continue;
        }

        if (!Array.isArray(roomState.exits)) {
            roomState.exits = listRoomExits(roomName);
        }

        const visibleRoom = Game.rooms[roomName];

        if (visibleRoom) {
            roomState.status = classifyRoom(visibleRoom).status;
            roomState.controllerState = getControllerState(visibleRoom.controller);
            roomState.lastSeen = Game.time;
            continue;
        }

        roomState.status = inferStoredRoomStatus(roomName, roomState);
    }

    refreshDiscoveryIndexes(store);
}

function normalizeCampaignState(campaign) {
    if (!campaign) {
        return;
    }

    if (!campaign.invalidTargetRoomNames) {
        campaign.invalidTargetRoomNames = {};
    }

    if (!campaign.blockedScoutDirections) {
        campaign.blockedScoutDirections = {};
    }

    if (campaign.scoutSearchComplete === undefined) {
        campaign.scoutSearchComplete = false;
    }
}

function normalizeFrontierQueue(store, campaign) {
    if (!store || !Array.isArray(store.frontierQueue)) {
        return;
    }

    const bestEntriesByKey = {};

    for (const entry of store.frontierQueue) {
        const normalizedEntry = normalizeFrontierEntry(entry);

        if (
            !normalizedEntry ||
            store.scoutedRooms[normalizedEntry.roomName] ||
            (
                campaign &&
                isBlockedScoutDirection(
                    campaign,
                    normalizedEntry.sourceRoomName,
                    normalizedEntry.firstHopRoomName
                )
            )
        ) {
            continue;
        }

        const key = getFrontierEntryKey(
            normalizedEntry.roomName,
            normalizedEntry.sourceRoomName,
            normalizedEntry.firstHopRoomName
        );
        const existing = bestEntriesByKey[key];

        if (!existing || normalizedEntry.depth < existing.depth) {
            bestEntriesByKey[key] = normalizedEntry;
        }
    }

    store.frontierQueue = Object.values(bestEntriesByKey);
}

function normalizeFrontierEntry(entry) {
    if (!entry || !entry.roomName) {
        return null;
    }

    const depth = Number.isFinite(entry.depth)
        ? entry.depth
        : 1;

    if (depth < 1 || depth > MAX_SCOUT_DEPTH) {
        return null;
    }

    return {
        depth: depth,
        firstHopRoomName: entry.firstHopRoomName || (depth === 1 ? entry.roomName : null),
        roomName: entry.roomName,
        sourceRoomName: entry.sourceRoomName || null,
    };
}

function classifyRoom(room) {
    const controller = room.controller;

    if (controller && controller.my) {
        return {
            status: "owned",
        };
    }

    if (hasHostileStructures(room)) {
        return {
            status: "enemy",
        };
    }

    if (!controller) {
        return {
            status: "transit",
        };
    }

    if (controller.owner && !controller.my) {
        return {
            status: "enemy",
        };
    }

    const reservation = controller.reservation;
    const myUsername = getMyUsername();

    if (
        reservation &&
        reservation.username &&
        isInvaderUsername(reservation.username)
    ) {
        return {
            status: "enemy",
        };
    }

    if (
        reservation &&
        reservation.username &&
        reservation.username !== myUsername
    ) {
        return {
            status: "transit",
        };
    }

    if (isHighwayRoom(room.name) || isSourceKeeperRoom(room.name)) {
        return {
            status: "transit",
        };
    }

    return {
        status: "candidate",
    };
}

function inferStoredRoomStatus(roomName, roomState) {
    const controllerState = roomState.controllerState || {};
    const myUsername = getMyUsername();

    if (controllerState.owner === myUsername) {
        return "owned";
    }

    if (controllerState.owner) {
        return "enemy";
    }

    if (isInvaderUsername(controllerState.reservation)) {
        return "enemy";
    }

    if (
        controllerState.reservation &&
        controllerState.reservation !== myUsername
    ) {
        return "transit";
    }

    if (controllerState.level !== null && controllerState.level !== undefined) {
        if (isHighwayRoom(roomName) || isSourceKeeperRoom(roomName)) {
            return "transit";
        }

        return "candidate";
    }

    return "transit";
}

function isInvaderUsername(username) {
    return username === "Invader";
}

function hasHostileStructures(room) {
    if (!room || typeof FIND_HOSTILE_STRUCTURES === "undefined") {
        return false;
    }

    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);

    return hostileStructures.length > 0;
}

function getControllerState(controller) {
    if (!controller) {
        return {
            level: null,
            owner: null,
            reservation: null,
        };
    }

    return {
        level: controller.level || null,
        owner: controller.owner ? controller.owner.username : null,
        reservation: controller.reservation ? controller.reservation.username : null,
    };
}

function getOwnedSpawn(room) {
    const spawns = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    });

    if (spawns.length === 0) {
        return null;
    }

    spawns.sort(function (left, right) {
        return left.name.localeCompare(right.name);
    });

    return spawns[0];
}

function roomHasOwnedSpawn(roomName) {
    const room = Game.rooms[roomName];

    return !!(room && getOwnedSpawn(room));
}

function isMatchingExpansionSpawnTask(task, campaignId, role) {
    if (
        !task ||
        task.type !== constants.taskTypes.SPAWN_CREEP ||
        !task.data ||
        !task.data.memory ||
        !task.data.memory.expansionCampaignId
    ) {
        return false;
    }

    if (campaignId && task.data.memory.expansionCampaignId !== campaignId) {
        return false;
    }

    if (role && task.data.role !== role) {
        return false;
    }

    return true;
}

function countLiveExpansionCreeps(campaignId, role) {
    let count = 0;

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (!isExpansionRole(creep.memory.role)) {
            continue;
        }

        if (campaignId && creep.memory.expansionCampaignId !== campaignId) {
            continue;
        }

        if (role && creep.memory.role !== role) {
            continue;
        }

        count += 1;
    }

    return count;
}

function blockScoutDirection(action) {
    if (!action || !action.data) {
        return false;
    }

    const campaign = getActiveCampaign();

    if (!campaign) {
        return false;
    }

    const task = Memory.Tasks && Memory.Tasks.byId
        ? Memory.Tasks.byId[action.taskId]
        : null;

    if (
        task &&
        task.data &&
        task.data.campaignId &&
        task.data.campaignId !== campaign.campaignId
    ) {
        return false;
    }

    normalizeCampaignState(campaign);

    const sourceRoomName = action.data.sourceRoomName || null;
    const firstHopRoomName = action.data.firstHopRoomName
        || (action.data.depth === 1 ? action.data.roomName : null);

    if (!sourceRoomName || !firstHopRoomName) {
        return false;
    }

    if (!campaign.blockedScoutDirections[sourceRoomName]) {
        campaign.blockedScoutDirections[sourceRoomName] = {};
    }

    campaign.blockedScoutDirections[sourceRoomName][firstHopRoomName] = true;

    const store = getStore();

    normalizeFrontierQueue(store, campaign);
    cancelScoutDirectionActions(
        campaign,
        sourceRoomName,
        firstHopRoomName,
        action.id
    );

    return true;
}

function cancelScoutDirectionActions(campaign, sourceRoomName, firstHopRoomName, excludedActionId) {
    for (const actionId in Memory.Dispatcher.actionsById) {
        const queuedAction = Memory.Dispatcher.actionsById[actionId];

        if (
            !queuedAction ||
            queuedAction.id === excludedActionId ||
            queuedAction.type !== constants.actionTypes.SCOUT_ROOM ||
            !queuedAction.data ||
            queuedAction.data.sourceRoomName !== sourceRoomName ||
            queuedAction.data.firstHopRoomName !== firstHopRoomName
        ) {
            continue;
        }

        const task = Memory.Tasks && Memory.Tasks.byId
            ? Memory.Tasks.byId[queuedAction.taskId]
            : null;

        if (
            !task ||
            !task.data ||
            task.data.campaignId !== campaign.campaignId
        ) {
            continue;
        }

        dispatcherCleanup.cleanupAssignedAction(queuedAction, {
            invokeCancel: true,
            reason: `blocked-scout-direction:${sourceRoomName}->${firstHopRoomName}`,
        });
    }
}

function getAssignedScoutRooms(task) {
    const assigned = {};

    for (const actionId of task.actionIds || []) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.SCOUT_ROOM &&
            action.status !== "done"
        ) {
            assigned[action.data.roomName] = true;
        }
    }

    return assigned;
}

function compareFrontierEntries(left, right) {
    if (left.depth !== right.depth) {
        return left.depth - right.depth;
    }

    if (String(left.sourceRoomName || "").localeCompare(String(right.sourceRoomName || "")) !== 0) {
        return String(left.sourceRoomName || "").localeCompare(String(right.sourceRoomName || ""));
    }

    if (String(left.firstHopRoomName || "").localeCompare(String(right.firstHopRoomName || "")) !== 0) {
        return String(left.firstHopRoomName || "").localeCompare(String(right.firstHopRoomName || ""));
    }

    return String(left.roomName).localeCompare(String(right.roomName));
}

function getQueuedDepth(queue, roomName, sourceRoomName, firstHopRoomName) {
    let depth = null;

    for (const entry of queue) {
        if (
            !entry ||
            entry.roomName !== roomName ||
            (
                sourceRoomName !== undefined &&
                (
                    (entry.sourceRoomName || null) !== (sourceRoomName || null) ||
                    (entry.firstHopRoomName || null) !== (firstHopRoomName || null)
                )
            )
        ) {
            continue;
        }

        if (depth === null || entry.depth < depth) {
            depth = entry.depth;
        }
    }

    return depth;
}

function isSameFrontierEntry(entry, roomName, sourceRoomName, firstHopRoomName) {
    return !!(
        entry &&
        entry.roomName === roomName &&
        (entry.sourceRoomName || null) === (sourceRoomName || null) &&
        (entry.firstHopRoomName || null) === (firstHopRoomName || null)
    );
}

function getFrontierEntryKey(roomName, sourceRoomName, firstHopRoomName) {
    return [
        String(roomName || ""),
        String(sourceRoomName || ""),
        String(firstHopRoomName || ""),
    ].join("|");
}

function pickKnownDepth(existing, queuedDepth) {
    const depths = [];

    if (existing && Number.isFinite(existing.depth)) {
        depths.push(existing.depth);
    }

    if (Number.isFinite(queuedDepth)) {
        depths.push(queuedDepth);
    }

    if (depths.length === 0) {
        return 0;
    }

    return Math.min.apply(null, depths);
}

function isScoutSearchComplete(store, campaign) {
    normalizeFrontierQueue(store, campaign);
    return store.frontierQueue.length === 0;
}

function isBlockedScoutDirection(campaign, sourceRoomName, firstHopRoomName) {
    if (!campaign) {
        return false;
    }

    return isBlockedScoutDirectionState(
        campaign.blockedScoutDirections,
        sourceRoomName,
        firstHopRoomName
    );
}

function isBlockedScoutDirectionState(blockedScoutDirections, sourceRoomName, firstHopRoomName) {
    return !!(
        blockedScoutDirections &&
        sourceRoomName &&
        firstHopRoomName &&
        blockedScoutDirections[sourceRoomName] &&
        blockedScoutDirections[sourceRoomName][firstHopRoomName]
    );
}

function formatEnemyDistance(enemyDistance) {
    if (!Number.isFinite(enemyDistance)) {
        return "safe";
    }

    return String(enemyDistance);
}

function listRoomExits(roomName) {
    const exits = Game.map.describeExits(roomName) || {};

    return Object.values(exits).sort();
}

function canContinueWithoutFreeSlot(campaign) {
    return (
        campaign.stage === STAGES.BOOTSTRAP_SPAWN ||
        isRoomClaimedByMe(campaign.targetRoomName)
    );
}

function hasFreeGclSlot(ownedRoomsCount) {
    return !!(Game.gcl && Game.gcl.level > ownedRoomsCount);
}

function getOwnedRoomNames() {
    return Object.keys(Game.rooms).filter(function (roomName) {
        const room = Game.rooms[roomName];

        return !!(room && room.controller && room.controller.my);
    }).sort();
}

function isRoomClaimedByMe(roomName) {
    const room = Game.rooms[roomName];

    return !!(room && room.controller && room.controller.my);
}

function isEnemyOwnedRoomName(roomName) {
    const room = Game.rooms[roomName];

    return !!(
        room &&
        room.controller &&
        room.controller.owner &&
        !room.controller.my
    );
}

function isHighwayRoom(roomName) {
    const coords = parseRoomName(roomName);

    if (!coords) {
        return false;
    }

    return coords.x % 10 === 0 || coords.y % 10 === 0;
}

function isSourceKeeperRoom(roomName) {
    const coords = parseRoomName(roomName);

    if (!coords) {
        return false;
    }

    const xMod = coords.x % 10;
    const yMod = coords.y % 10;

    if (xMod === 5 && yMod === 5) {
        return false;
    }

    return (
        xMod >= 4 &&
        xMod <= 6 &&
        yMod >= 4 &&
        yMod <= 6
    );
}

function parseRoomName(roomName) {
    const match = /^([WE])(\d+)([NS])(\d+)$/.exec(roomName);

    if (!match) {
        return null;
    }

    return {
        x: Number(match[2]),
        y: Number(match[4]),
    };
}

function getMyUsername() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.owner && room.controller.my) {
            return room.controller.owner.username;
        }
    }

    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];

        if (spawn.owner && spawn.owner.username) {
            return spawn.owner.username;
        }
    }

    return null;
}

module.exports = {
    blockScoutDirection,
    STAGES,
    getActiveCampaign,
    getEnemyDistanceHeatmap,
    getSpawnSiteObject,
    getSpawnSitePlan,
    isExpansionRole,
    pickNextScoutRoom,
    recordScoutedRoom,
    reconcile,
};
