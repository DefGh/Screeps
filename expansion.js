const constants = require("./constants");
const dispatcherCleanup = require("./dispatcher.cleanup");
const firstSpawnPlanner = require("./planner.first_spawn");

const STAGES = {
    SCOUT: "scout",
    CLAIM: "claim",
    SIEGE_CLEAR: "siege_clear",
    SIEGE_CONTROLLER: "siege_controller",
    BOOTSTRAP_SPAWN: "bootstrap_spawn",
};

const STRATEGIES = {
    PEACEFUL: "peaceful",
    MILITARY: "military",
};

const MAX_SCOUT_DEPTH = 5;
const MAX_SCOUTS = 2;
const MAX_COLONIZERS = 2;
const MAX_SIEGE_STALL = 1500;
const SCOUT_RETRY_DELAY = 500;
const HOSTILE_ROOM_MEMORY_TTL = SCOUT_RETRY_DELAY;
const INVALID_FOREVER_TICK = 9007199254740991;
const EXPANSION_ROLES = {};
const SIEGE_ROLES = [
    constants.roles.ATTACKER,
    constants.roles.HEALER,
    constants.roles.DISMANTLER,
];
const MILITARY_ROLES = SIEGE_ROLES.concat([
    constants.roles.LIBERATOR,
]);

EXPANSION_ROLES[constants.roles.SCOUT] = true;
EXPANSION_ROLES[constants.roles.CLAIMER] = true;
EXPANSION_ROLES[constants.roles.COLONIZER] = true;
EXPANSION_ROLES[constants.roles.ATTACKER] = true;
EXPANSION_ROLES[constants.roles.HEALER] = true;
EXPANSION_ROLES[constants.roles.DISMANTLER] = true;
EXPANSION_ROLES[constants.roles.LIBERATOR] = true;

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
    applyPendingScoutReset(store, campaign);
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
    else if (campaign.stage === STAGES.SIEGE_CLEAR) {
        reconcileSiegeClearStage(store, campaign, ctx, ownedRoomNames);
    }
    else if (campaign.stage === STAGES.SIEGE_CONTROLLER) {
        reconcileSiegeControllerStage(store, campaign, ctx, ownedRoomNames);
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
    const combat = getCombatState(room);
    const classification = classifyRoom(room, combat);

    return setScoutedRoomState(
        store,
        roomName,
        {
            combat: combat,
            controllerState: getControllerState(room.controller),
            exits: listRoomExits(roomName),
            hostileUntil: classification.hostileUntil,
            lastSeen: Game.time,
            status: classification.status,
            statusReason: classification.statusReason,
        },
        scoutData
    );
}

function rememberScoutRoomSnapshot(creep, action) {
    if (!creep || !creep.memory || !action || !action.data) {
        return false;
    }

    const roomName = action.data.roomName;

    if (!roomName || creep.pos.roomName !== roomName) {
        return false;
    }

    const room = Game.rooms[roomName];

    if (!room) {
        return false;
    }

    creep.memory.scoutRoomSnapshot = createScoutRoomSnapshot(room, action.data);
    return true;
}

function recordScoutDeath(event, action) {
    const creepMemory = event && event.data && Memory.creeps
        ? Memory.creeps[event.data.name]
        : null;
    const snapshot = getMatchingScoutRoomSnapshot(creepMemory, action);
    let recorded = false;

    if (snapshot) {
        recorded = recordScoutRoomSnapshot(snapshot);
    }

    if (!recorded) {
        recorded = recordSyntheticScoutRoom(action);
    }

    if (creepMemory && creepMemory.scoutRoomSnapshot) {
        delete creepMemory.scoutRoomSnapshot;
    }

    blockScoutDirection(action);
    return recorded;
}

function createScoutRoomSnapshot(room, scoutData) {
    const combat = getCombatState(room);
    const classification = classifyRoom(room, combat);
    const depth = Number.isFinite(scoutData && scoutData.depth)
        ? scoutData.depth
        : null;

    return {
        combat: combat,
        controllerState: getControllerState(room.controller),
        depth: depth,
        exits: listRoomExits(room.name),
        firstHopRoomName: scoutData && scoutData.firstHopRoomName
            ? scoutData.firstHopRoomName
            : (depth === 1 ? room.name : null),
        hostileUntil: classification.hostileUntil,
        lastSeen: Game.time,
        roomName: room.name,
        sourceRoomName: scoutData && scoutData.sourceRoomName
            ? scoutData.sourceRoomName
            : null,
        status: classification.status,
        statusReason: classification.statusReason,
        tick: Game.time,
    };
}

function getMatchingScoutRoomSnapshot(creepMemory, action) {
    if (
        !creepMemory ||
        !creepMemory.scoutRoomSnapshot ||
        !action ||
        !action.data
    ) {
        return null;
    }

    const snapshot = creepMemory.scoutRoomSnapshot;
    const firstHopRoomName = action.data.firstHopRoomName
        || (action.data.depth === 1 ? action.data.roomName : null);

    if (snapshot.roomName !== action.data.roomName) {
        return null;
    }

    if ((snapshot.sourceRoomName || null) !== (action.data.sourceRoomName || null)) {
        return null;
    }

    if ((snapshot.firstHopRoomName || null) !== (firstHopRoomName || null)) {
        return null;
    }

    if (
        Number.isFinite(action.createdAt) &&
        Number.isFinite(snapshot.tick) &&
        snapshot.tick < action.createdAt
    ) {
        return null;
    }

    return snapshot;
}

function recordScoutRoomSnapshot(snapshot) {
    if (!snapshot || !snapshot.roomName) {
        return false;
    }

    return setScoutedRoomState(
        getStore(),
        snapshot.roomName,
        {
            combat: snapshot.combat,
            controllerState: snapshot.controllerState,
            exits: snapshot.exits,
            hostileUntil: snapshot.hostileUntil,
            lastSeen: snapshot.lastSeen,
            status: snapshot.status,
            statusReason: snapshot.statusReason,
        },
        snapshot
    );
}

function recordSyntheticScoutRoom(action) {
    if (!action || !action.data || !action.data.roomName) {
        return false;
    }

    const roomName = action.data.roomName;
    const firstHopRoomName = action.data.firstHopRoomName
        || (action.data.depth === 1 ? roomName : null);

    if (firstHopRoomName !== roomName) {
        return false;
    }

    return setScoutedRoomState(
        getStore(),
        roomName,
        {
            combat: {
                armedHostileCreepCount: 1,
                lastCombatSeen: Game.time,
                owner: null,
                rampartCoverCount: 0,
                safeModeUntil: null,
                spawnCount: 0,
                towerCount: 0,
            },
            controllerState: getControllerState(null),
            exits: listRoomExits(roomName),
            hostileUntil: Game.time + HOSTILE_ROOM_MEMORY_TTL,
            lastSeen: Game.time,
            status: "enemy",
            statusReason: "synthetic_blocked_scout",
        },
        action.data
    );
}

function setScoutedRoomState(store, roomName, roomState, scoutData) {
    const routeState = getScoutRouteState(store, roomName, scoutData);
    const controllerState = normalizeControllerState(roomState && roomState.controllerState);
    const nextState = {
        combat: inferStoredCombatState({
            combat: roomState ? roomState.combat : null,
            controllerState: controllerState,
            lastSeen: roomState && roomState.lastSeen,
        }),
        controllerState: controllerState,
        depth: routeState.depth,
        exits: Array.isArray(roomState && roomState.exits)
            ? roomState.exits.slice().sort()
            : listRoomExits(roomName),
        hostileUntil: Number.isFinite(roomState && roomState.hostileUntil) &&
            roomState.hostileUntil > Game.time
            ? roomState.hostileUntil
            : null,
        lastSeen: Number.isFinite(roomState && roomState.lastSeen)
            ? roomState.lastSeen
            : Game.time,
        status: roomState && roomState.status
            ? roomState.status
            : null,
        statusReason: roomState && roomState.statusReason
            ? roomState.statusReason
            : null,
    };

    normalizeStoredTemporaryHostility(nextState);

    if (!nextState.status) {
        nextState.status = inferStoredRoomStatus(roomName, nextState);
    }

    store.scoutedRooms[roomName] = nextState;
    store.frontierQueue = store.frontierQueue.filter(function (entry) {
        return entry.roomName !== roomName;
    });

    refreshDiscoveryIndexes(store);

    if (nextState.status !== "enemy" && routeState.depth < MAX_SCOUT_DEPTH) {
        for (const exitRoomName of nextState.exits) {
            enqueueFrontierRoom(
                store,
                exitRoomName,
                routeState.depth + 1,
                routeState.sourceRoomName,
                routeState.firstHopRoomName,
                store.activeCampaign
            );
        }
    }

    return true;
}

function getScoutRouteState(store, roomName, scoutData) {
    const depth = Number.isFinite(scoutData && scoutData.depth)
        ? scoutData.depth
        : getQueuedDepth(store.frontierQueue, roomName);
    const existing = store.scoutedRooms[roomName];
    const nextDepth = pickKnownDepth(existing, depth);

    return {
        depth: nextDepth,
        firstHopRoomName: scoutData && scoutData.firstHopRoomName
            ? scoutData.firstHopRoomName
            : (nextDepth === 1 ? roomName : null),
        sourceRoomName: scoutData && scoutData.sourceRoomName
            ? scoutData.sourceRoomName
            : null,
    };
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

    if (
        isScoutCoolingDown(campaign) ||
        !campaign.scoutSearchComplete
    ) {
        return;
    }

    const peacefulSelection = selectTargetRoom(store, campaign, ownedRoomNames);

    if (peacefulSelection) {
        campaign.stage = STAGES.CLAIM;
        campaign.strategy = STRATEGIES.PEACEFUL;
        campaign.originRoomName = peacefulSelection.originRoomName;
        campaign.scoutResetPending = false;
        campaign.targetRoomName = peacefulSelection.targetRoomName;
        campaign.stagingRoomNames = [];
        campaign.siegeStartedAt = null;
        campaign.scoutCooldownUntil = null;
        store.spawnSite = null;

        cleanupRoleActions(constants.roles.SCOUT, campaign.campaignId, "expansion-stage-claim");
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.SCOUT);

        ctx.log(
            `[expansion] target ${peacefulSelection.targetRoomName} from ${peacefulSelection.originRoomName} (enemy distance=${formatEnemyDistance(peacefulSelection.enemyDistance)})`
        );
        return;
    }

    const militarySelection = selectMilitaryTargetRoom(store, campaign, ownedRoomNames);

    if (militarySelection) {
        campaign.originRoomName = militarySelection.originRoomName;
        campaign.scoutResetPending = false;
        campaign.scoutCooldownUntil = null;
        campaign.siegeStartedAt = Game.time;
        campaign.stage = STAGES.SIEGE_CLEAR;
        campaign.stagingRoomNames = militarySelection.stagingRoomNames;
        campaign.strategy = STRATEGIES.MILITARY;
        campaign.targetRoomName = militarySelection.targetRoomName;
        store.spawnSite = null;

        ctx.log(
            `[expansion] military target ${militarySelection.targetRoomName} from ${militarySelection.stagingRoomNames.join(",")}`
        );
        return;
    }

    scheduleScoutRetry(
        store,
        campaign,
        ctx,
        `no viable peaceful or military targets`,
        SCOUT_RETRY_DELAY
    );
}

function reconcileClaimStage(store, campaign, ctx, ownedRoomNames) {
    if (isEnemyOwnedRoomName(campaign.targetRoomName)) {
        restartScoutStage(
            store,
            campaign,
            ctx,
            `target ${campaign.targetRoomName} became enemy-owned`,
            Game.time + SCOUT_RETRY_DELAY
        );
        return;
    }

    if (isRoomClaimedByMe(campaign.targetRoomName)) {
        enterBootstrapStage(store, campaign, ctx, ownedRoomNames, "claimed");
        return;
    }

    campaign.originRoomName = pickOriginSpawnRoom(store, ownedRoomNames, campaign.targetRoomName, campaign)
        || campaign.originRoomName
        || campaign.coordinatorRoomName;
}

function reconcileSiegeClearStage(store, campaign, ctx, ownedRoomNames) {
    if (!refreshMilitaryCampaign(store, campaign, ctx, ownedRoomNames)) {
        return;
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (targetRoom && targetRoom.controller && targetRoom.controller.my) {
        enterBootstrapStage(store, campaign, ctx, ownedRoomNames, "seized");
        return;
    }

    if (!targetRoom) {
        return;
    }

    if (!findSiegeTarget(targetRoom)) {
        campaign.stage = STAGES.SIEGE_CONTROLLER;
        ctx.log(`[expansion] cleared defenses in ${campaign.targetRoomName}`);
    }
}

function reconcileSiegeControllerStage(store, campaign, ctx, ownedRoomNames) {
    if (!refreshMilitaryCampaign(store, campaign, ctx, ownedRoomNames)) {
        return;
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (targetRoom && targetRoom.controller && targetRoom.controller.my) {
        enterBootstrapStage(store, campaign, ctx, ownedRoomNames, "seized");
        return;
    }

    if (!targetRoom) {
        return;
    }

    if (findSiegeTarget(targetRoom)) {
        campaign.stage = STAGES.SIEGE_CLEAR;
        ctx.log(`[expansion] threat returned in ${campaign.targetRoomName}, resuming siege clear`);
    }
}

function reconcileBootstrapStage(store, campaign, ctx, ownedRoomNames) {
    if (isEnemyOwnedRoomName(campaign.targetRoomName)) {
        restartScoutStage(
            store,
            campaign,
            ctx,
            `target ${campaign.targetRoomName} lost before spawn`,
            Game.time + SCOUT_RETRY_DELAY
        );
        return;
    }

    if (!isRoomClaimedByMe(campaign.targetRoomName)) {
        campaign.stage = campaign.strategy === STRATEGIES.MILITARY
            ? STAGES.SIEGE_CONTROLLER
            : STAGES.CLAIM;
        if (campaign.strategy === STRATEGIES.MILITARY) {
            campaign.siegeStartedAt = Game.time;
        }
        store.spawnSite = null;
        ctx.log(
            campaign.strategy === STRATEGIES.MILITARY
                ? `[expansion] lost claim on ${campaign.targetRoomName}, back to siege controller`
                : `[expansion] lost claim on ${campaign.targetRoomName}, back to claim`
        );
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
                INVALID_FOREVER_TICK
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
    retireLiveExpansionCreeps(campaignId, [
        constants.roles.SCOUT,
        constants.roles.CLAIMER,
        constants.roles.ATTACKER,
        constants.roles.HEALER,
        constants.roles.DISMANTLER,
        constants.roles.LIBERATOR,
    ]);
    convertColonizers(campaignId, targetRoomName);
    ensureRoomStartupTasks(targetRoomName, ctx);
    clearCampaign(store);

    ctx.log(`[expansion] completed ${campaignId} into ${targetRoomName}`);
}

function restartScoutStage(store, campaign, ctx, reason, invalidUntilTick) {
    if (campaign.targetRoomName && Number.isFinite(invalidUntilTick)) {
        setInvalidTargetUntil(campaign, campaign.targetRoomName, invalidUntilTick);
    }

    cleanupRoleActions(constants.roles.SCOUT, campaign.campaignId, "expansion-restart");
    cleanupRoleActions(constants.roles.CLAIMER, campaign.campaignId, "expansion-restart");
    cleanupRoleActions(constants.roles.COLONIZER, campaign.campaignId, "expansion-restart");

    for (const role of MILITARY_ROLES) {
        cleanupRoleActions(role, campaign.campaignId, "expansion-restart");
    }

    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.SCOUT);
    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);

    for (const role of MILITARY_ROLES) {
        removeQueuedSpawnTasks(ctx, campaign.campaignId, role);
    }

    retireLiveExpansionCreeps(campaign.campaignId, [
        constants.roles.CLAIMER,
        constants.roles.COLONIZER,
        constants.roles.ATTACKER,
        constants.roles.HEALER,
        constants.roles.DISMANTLER,
        constants.roles.LIBERATOR,
    ]);

    campaign.stage = STAGES.SCOUT;
    campaign.strategy = STRATEGIES.PEACEFUL;
    campaign.originRoomName = null;
    campaign.scoutResetPending = false;
    campaign.scoutCooldownUntil = null;
    campaign.scoutSearchComplete = false;
    campaign.siegeStartedAt = null;
    campaign.stagingRoomNames = [];
    campaign.targetRoomName = null;
    store.spawnSite = null;

    ctx.log(`[expansion] restart scouting (${reason})`);
}

function scheduleScoutRetry(store, campaign, ctx, reason, delay) {
    campaign.originRoomName = null;
    campaign.scoutResetPending = true;
    campaign.scoutCooldownUntil = Game.time + delay;
    campaign.scoutSearchComplete = false;
    campaign.siegeStartedAt = null;
    campaign.stage = STAGES.SCOUT;
    campaign.stagingRoomNames = [];
    campaign.strategy = STRATEGIES.PEACEFUL;
    campaign.targetRoomName = null;
    store.spawnSite = null;

    ctx.log(`[expansion] rescan scheduled in ${delay} ticks (${reason})`);
}

function enterBootstrapStage(store, campaign, ctx, ownedRoomNames, reason) {
    if (campaign.strategy === STRATEGIES.MILITARY) {
        cleanupRoleActions(constants.roles.SCOUT, campaign.campaignId, "expansion-stage-bootstrap");
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.SCOUT);

        for (const role of MILITARY_ROLES) {
            cleanupRoleActions(role, campaign.campaignId, "expansion-stage-bootstrap");
            removeQueuedSpawnTasks(ctx, campaign.campaignId, role);
        }

        retireLiveExpansionCreeps(campaign.campaignId, [
            constants.roles.SCOUT,
            constants.roles.ATTACKER,
            constants.roles.HEALER,
            constants.roles.DISMANTLER,
            constants.roles.LIBERATOR,
        ]);
    }
    else {
        cleanupRoleActions(constants.roles.CLAIMER, campaign.campaignId, "expansion-stage-bootstrap");
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
    }

    campaign.stage = STAGES.BOOTSTRAP_SPAWN;
    campaign.originRoomName = pickOriginSpawnRoom(store, ownedRoomNames, campaign.targetRoomName, campaign)
        || campaign.originRoomName
        || campaign.coordinatorRoomName;
    campaign.siegeStartedAt = null;
    campaign.stagingRoomNames = [];
    store.spawnSite = null;

    ctx.log(`[expansion] ${reason} ${campaign.targetRoomName}, bootstrap from ${campaign.originRoomName}`);
}

function syncExpansionTasks(ctx, campaign) {
    const desiredRooms = {};
    const liveScouts = countLiveExpansionCreeps(campaign.campaignId, constants.roles.SCOUT);
    const liveClaimers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.CLAIMER);
    const liveColonizers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.COLONIZER);
    const liveAttackers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.ATTACKER);
    const liveHealers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.HEALER);
    const liveDismantlers = countLiveExpansionCreeps(campaign.campaignId, constants.roles.DISMANTLER);
    const liveLiberators = countLiveExpansionCreeps(campaign.campaignId, constants.roles.LIBERATOR);

    if (
        campaign.stage === STAGES.SCOUT ||
        (
            campaign.strategy === STRATEGIES.MILITARY &&
            (
                campaign.stage === STAGES.SIEGE_CLEAR ||
                campaign.stage === STAGES.SIEGE_CONTROLLER
            )
        ) ||
        liveScouts > 0
    ) {
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

    if (
        campaign.stagingRoomNames &&
        (
            campaign.stage === STAGES.SIEGE_CLEAR ||
            campaign.stage === STAGES.SIEGE_CONTROLLER ||
            liveAttackers > 0 ||
            liveHealers > 0 ||
            liveDismantlers > 0 ||
            liveLiberators > 0
        )
    ) {
        for (const roomName of campaign.stagingRoomNames) {
            desiredRooms[roomName] = true;
        }
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
            campaign.scoutSearchComplete || isScoutCoolingDown(campaign) ? 0 : MAX_SCOUTS,
            campaign.coordinatorRoomName
        );
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);
        for (const role of MILITARY_ROLES) {
            removeQueuedSpawnTasks(ctx, campaign.campaignId, role);
        }
        return;
    }

    if (
        campaign.strategy === STRATEGIES.MILITARY &&
        (
            campaign.stage === STAGES.SIEGE_CLEAR ||
            campaign.stage === STAGES.SIEGE_CONTROLLER
        )
    ) {
        syncRoleSpawnTasks(
            ctx,
            campaign,
            constants.roles.SCOUT,
            1,
            campaign.coordinatorRoomName
        );
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);
        syncRoleSpawnTasksByRoom(
            ctx,
            campaign,
            constants.roles.ATTACKER,
            1,
            campaign.stagingRoomNames
        );
        syncRoleSpawnTasksByRoom(
            ctx,
            campaign,
            constants.roles.HEALER,
            1,
            campaign.stagingRoomNames
        );
        syncRoleSpawnTasksByRoom(
            ctx,
            campaign,
            constants.roles.DISMANTLER,
            1,
            campaign.stagingRoomNames
        );
        syncRoleSpawnTasks(
            ctx,
            campaign,
            constants.roles.LIBERATOR,
            campaign.stage === STAGES.SIEGE_CONTROLLER ? 1 : 0,
            campaign.originRoomName
        );
        return;
    }

    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.SCOUT);
    for (const role of MILITARY_ROLES) {
        removeQueuedSpawnTasks(ctx, campaign.campaignId, role);
    }

    if (campaign.stage === STAGES.CLAIM) {
        syncRoleSpawnTasks(ctx, campaign, constants.roles.CLAIMER, 1, campaign.originRoomName);
        removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.COLONIZER);
        return;
    }

    removeQueuedSpawnTasks(ctx, campaign.campaignId, constants.roles.CLAIMER);
    syncRoleSpawnTasks(ctx, campaign, constants.roles.COLONIZER, MAX_COLONIZERS, campaign.originRoomName);
}

function syncRoleSpawnTasks(ctx, campaign, role, desiredCount, roomName) {
    if (!roomName) {
        removeQueuedSpawnTasks(ctx, campaign.campaignId, role);
        return;
    }

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

function syncRoleSpawnTasksByRoom(ctx, campaign, role, desiredCountPerRoom, roomNames) {
    const desiredRoomNames = Array.isArray(roomNames)
        ? roomNames.filter(Boolean)
        : [];
    const allTasks = ctx.listTasks();
    const queuedByRoom = {};

    for (const task of allTasks) {
        if (!isMatchingExpansionSpawnTask(task, campaign.campaignId, role)) {
            continue;
        }

        if (!desiredRoomNames.includes(task.room)) {
            ctx.removeTask(task.id);
            continue;
        }

        if (!queuedByRoom[task.room]) {
            queuedByRoom[task.room] = [];
        }

        queuedByRoom[task.room].push(task);
    }

    for (const roomName of desiredRoomNames) {
        const matchingTasks = queuedByRoom[roomName] || [];
        let existingCount = countLiveExpansionCreeps(campaign.campaignId, role, roomName) + matchingTasks.length;

        while (existingCount > desiredCountPerRoom && matchingTasks.length > 0) {
            const task = matchingTasks.pop();
            ctx.removeTask(task.id);
            existingCount -= 1;
        }

        while (existingCount < desiredCountPerRoom) {
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
        constants.roles.ATTACKER,
        constants.roles.HEALER,
        constants.roles.DISMANTLER,
        constants.roles.LIBERATOR,
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
        scoutResetPending: false,
        scoutSearchComplete: false,
        scoutCooldownUntil: null,
        siegeStartedAt: null,
        stage: STAGES.SCOUT,
        stagingRoomNames: [],
        strategy: STRATEGIES.PEACEFUL,
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

function applyPendingScoutReset(store, campaign) {
    if (
        !store ||
        !campaign ||
        !campaign.scoutResetPending
    ) {
        return;
    }

    if (
        Number.isFinite(campaign.scoutCooldownUntil) &&
        campaign.scoutCooldownUntil > Game.time
    ) {
        return;
    }

    clearDiscoveryState(store);
    campaign.blockedScoutDirections = {};
    campaign.scoutCooldownUntil = null;
    campaign.scoutResetPending = false;
    campaign.scoutSearchComplete = false;
}

function primeOwnedRooms(store, ownedRoomNames, campaign) {
    const skipFrontierExpansion = !!(
        campaign &&
        Number.isFinite(campaign.scoutCooldownUntil) &&
        campaign.scoutCooldownUntil > Game.time
    );

    for (const roomName of ownedRoomNames) {
        const room = Game.rooms[roomName];

        if (!room || !room.controller || !room.controller.my) {
            continue;
        }

        const existing = store.scoutedRooms[roomName];

        store.scoutedRooms[roomName] = {
            combat: getCombatState(room),
            controllerState: getControllerState(room.controller),
            depth: 0,
            exits: listRoomExits(roomName),
            lastSeen: Game.time,
            status: "owned",
        };

        if (!skipFrontierExpansion && (!existing || existing.status !== "enemy")) {
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
            !isTargetInvalid(campaign, roomName) &&
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

function selectMilitaryTargetRoom(store, campaign, ownedRoomNames) {
    const stagingRoomNames = getSpawnedOwnedRoomNames(ownedRoomNames);

    if (stagingRoomNames.length === 0) {
        return null;
    }

    const distances = computeGraphDistances(store.scoutedRooms, stagingRoomNames, {
        blockedScoutDirections: campaign.blockedScoutDirections,
        maxDepth: MAX_SCOUT_DEPTH,
        sourceRoomNames: stagingRoomNames,
        stopAtEnemy: true,
    });
    let bestSelection = null;

    for (const roomName of store.enemyRooms) {
        if (
            isTargetInvalid(campaign, roomName) ||
            !Number.isFinite(distances[roomName])
        ) {
            continue;
        }

        const roomState = store.scoutedRooms[roomName];
        const controllerOwner = roomState &&
            roomState.controllerState &&
            roomState.controllerState.owner;

        if (!controllerOwner || controllerOwner === getMyUsername()) {
            continue;
        }

        const combat = roomState.combat || {};

        if (
            Number.isFinite(combat.safeModeUntil) &&
            combat.safeModeUntil > Game.time
        ) {
            continue;
        }

        const reachableStagingRoomNames = getMilitaryStagingRoomNames(
            store,
            stagingRoomNames,
            roomName,
            campaign
        );

        if (reachableStagingRoomNames.length === 0) {
            continue;
        }

        const selection = {
            armedHostileCreepCount: combat.armedHostileCreepCount || 0,
            originDistance: distances[roomName],
            originRoomName: reachableStagingRoomNames[0],
            spawnCount: combat.spawnCount || 0,
            stagingRoomNames: reachableStagingRoomNames,
            targetRoomName: roomName,
            towerCount: combat.towerCount || 0,
        };

        if (
            !bestSelection ||
            compareMilitarySelection(selection, bestSelection) < 0
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

function getSpawnedOwnedRoomNames(ownedRoomNames) {
    return ownedRoomNames.filter(function (roomName) {
        return roomHasOwnedSpawn(roomName);
    });
}

function getMilitaryStagingRoomNames(store, stagedRoomNames, targetRoomName, campaign) {
    const entries = [];

    for (const roomName of stagedRoomNames) {
        if (roomName === targetRoomName) {
            continue;
        }

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

        entries.push({
            distance: distance,
            roomName: roomName,
        });
    }

    entries.sort(function (left, right) {
        if (left.distance !== right.distance) {
            return left.distance - right.distance;
        }

        return left.roomName.localeCompare(right.roomName);
    });

    return entries.map(function (entry) {
        return entry.roomName;
    });
}

function compareMilitarySelection(left, right) {
    if (left.towerCount !== right.towerCount) {
        return left.towerCount - right.towerCount;
    }

    if (left.armedHostileCreepCount !== right.armedHostileCreepCount) {
        return left.armedHostileCreepCount - right.armedHostileCreepCount;
    }

    if (left.spawnCount !== right.spawnCount) {
        return left.spawnCount - right.spawnCount;
    }

    if (left.originDistance !== right.originDistance) {
        return left.originDistance - right.originDistance;
    }

    return left.targetRoomName.localeCompare(right.targetRoomName);
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
            const combat = getCombatState(visibleRoom);
            const classification = classifyRoom(visibleRoom, combat);

            roomState.status = classification.status;
            roomState.combat = combat;
            roomState.controllerState = getControllerState(visibleRoom.controller);
            roomState.hostileUntil = classification.hostileUntil;
            roomState.lastSeen = Game.time;
            roomState.statusReason = classification.statusReason;
            continue;
        }

        roomState.controllerState = normalizeControllerState(roomState.controllerState);
        roomState.combat = inferStoredCombatState(roomState);
        normalizeStoredTemporaryHostility(roomState);
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
    else {
        for (const roomName in campaign.invalidTargetRoomNames) {
            const value = campaign.invalidTargetRoomNames[roomName];

            if (value === true) {
                campaign.invalidTargetRoomNames[roomName] = INVALID_FOREVER_TICK;
                continue;
            }

            if (!Number.isFinite(value)) {
                delete campaign.invalidTargetRoomNames[roomName];
                continue;
            }

            if (value <= Game.time) {
                delete campaign.invalidTargetRoomNames[roomName];
            }
        }
    }

    if (!campaign.blockedScoutDirections) {
        campaign.blockedScoutDirections = {};
    }

    if (campaign.scoutSearchComplete === undefined) {
        campaign.scoutSearchComplete = false;
    }

    if (campaign.scoutResetPending === undefined) {
        campaign.scoutResetPending = false;
    }

    if (!Array.isArray(campaign.stagingRoomNames)) {
        campaign.stagingRoomNames = [];
    }

    if (!campaign.strategy) {
        campaign.strategy = STRATEGIES.PEACEFUL;
    }

    if (campaign.siegeStartedAt === undefined) {
        campaign.siegeStartedAt = null;
    }

    if (campaign.scoutCooldownUntil === undefined) {
        campaign.scoutCooldownUntil = null;
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

function classifyRoom(room, combatState) {
    const controller = room.controller;
    const combat = combatState || getCombatState(room);

    if (controller && controller.my) {
        return {
            hostileUntil: null,
            status: "owned",
            statusReason: null,
        };
    }

    if (hasHostileStructures(room)) {
        return {
            hostileUntil: null,
            status: "enemy",
            statusReason: null,
        };
    }

    if (controller && controller.owner && !controller.my) {
        return {
            hostileUntil: null,
            status: "enemy",
            statusReason: null,
        };
    }

    const reservation = controller ? controller.reservation : null;
    const myUsername = getMyUsername();

    if (
        reservation &&
        reservation.username &&
        isInvaderUsername(reservation.username)
    ) {
        return {
            hostileUntil: null,
            status: "enemy",
            statusReason: null,
        };
    }

    if (combat.armedHostileCreepCount > 0) {
        return {
            hostileUntil: Game.time + HOSTILE_ROOM_MEMORY_TTL,
            status: "enemy",
            statusReason: "armed_hostile_creeps",
        };
    }

    if (!controller) {
        return {
            hostileUntil: null,
            status: "transit",
            statusReason: null,
        };
    }

    if (
        reservation &&
        reservation.username &&
        reservation.username !== myUsername
    ) {
        return {
            hostileUntil: null,
            status: "transit",
            statusReason: null,
        };
    }

    if (isHighwayRoom(room.name) || isSourceKeeperRoom(room.name)) {
        return {
            hostileUntil: null,
            status: "transit",
            statusReason: null,
        };
    }

    return {
        hostileUntil: null,
        status: "candidate",
        statusReason: null,
    };
}

function inferStoredRoomStatus(roomName, roomState) {
    const controllerState = normalizeControllerState(roomState && roomState.controllerState);
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
        Number.isFinite(roomState && roomState.hostileUntil) &&
        roomState.hostileUntil > Game.time
    ) {
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
    if (!room) {
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

function normalizeControllerState(controllerState) {
    if (!controllerState) {
        return getControllerState(null);
    }

    return {
        level: controllerState.level === undefined
            ? null
            : controllerState.level,
        owner: controllerState.owner || null,
        reservation: controllerState.reservation || null,
    };
}

function inferStoredCombatState(roomState) {
    const controllerState = roomState && roomState.controllerState
        ? roomState.controllerState
        : {};
    const combat = roomState && roomState.combat
        ? roomState.combat
        : {};

    return {
        armedHostileCreepCount: combat.armedHostileCreepCount || 0,
        lastCombatSeen: combat.lastCombatSeen || roomState.lastSeen || null,
        owner: combat.owner || controllerState.owner || null,
        rampartCoverCount: combat.rampartCoverCount || 0,
        safeModeUntil: Number.isFinite(combat.safeModeUntil) && combat.safeModeUntil > Game.time
            ? combat.safeModeUntil
            : null,
        spawnCount: combat.spawnCount || 0,
        towerCount: combat.towerCount || 0,
    };
}

function normalizeStoredTemporaryHostility(roomState) {
    if (!roomState) {
        return;
    }

    if (
        Number.isFinite(roomState.hostileUntil) &&
        roomState.hostileUntil > Game.time
    ) {
        return;
    }

    roomState.hostileUntil = null;

    if (!isTemporaryHostilityReason(roomState.statusReason)) {
        return;
    }

    roomState.statusReason = null;

    if (roomState.combat) {
        roomState.combat.armedHostileCreepCount = 0;
    }
}

function isTemporaryHostilityReason(statusReason) {
    return (
        statusReason === "armed_hostile_creeps" ||
        statusReason === "synthetic_blocked_scout"
    );
}

function getCombatState(room) {
    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    const controller = room.controller;

    return {
        armedHostileCreepCount: countArmedHostileCreeps(room),
        lastCombatSeen: Game.time,
        owner: controller && controller.owner ? controller.owner.username : null,
        rampartCoverCount: countRampartsCoveringCriticalStructures(hostileStructures),
        safeModeUntil: controller && controller.safeMode
            ? Game.time + controller.safeMode
            : null,
        spawnCount: countHostileStructuresByType(hostileStructures, STRUCTURE_SPAWN),
        towerCount: countHostileStructuresByType(hostileStructures, STRUCTURE_TOWER),
    };
}

function countArmedHostileCreeps(room) {
    let count = 0;

    for (const creep of room.find(FIND_HOSTILE_CREEPS)) {
        if (isIgnoredScoutHostileCreep(creep)) {
            continue;
        }

        if (isArmedHostileCreep(creep)) {
            count += 1;
        }
    }

    return count;
}

function isIgnoredScoutHostileCreep(creep) {
    return !!(
        creep &&
        creep.owner &&
        creep.owner.username === "Source Keeper"
    );
}

function isArmedHostileCreep(creep) {
    return (
        creep.getActiveBodyparts(ATTACK) > 0 ||
        creep.getActiveBodyparts(RANGED_ATTACK) > 0 ||
        creep.getActiveBodyparts(HEAL) > 0
    );
}

function countHostileStructuresByType(hostileStructures, structureType) {
    let count = 0;

    for (const structure of hostileStructures) {
        if (structure.structureType === structureType) {
            count += 1;
        }
    }

    return count;
}

function countRampartsCoveringCriticalStructures(hostileStructures) {
    const coveredKeys = {};

    for (const structure of hostileStructures) {
        if (
            structure.structureType !== STRUCTURE_TOWER &&
            structure.structureType !== STRUCTURE_SPAWN
        ) {
            continue;
        }

        const structuresAtPosition = structure.room.lookForAt(
            LOOK_STRUCTURES,
            structure.pos.x,
            structure.pos.y
        );
        const hasRampart = structuresAtPosition.some(function (otherStructure) {
            return otherStructure.structureType === STRUCTURE_RAMPART;
        });

        if (hasRampart) {
            coveredKeys[`${structure.pos.x}:${structure.pos.y}`] = true;
        }
    }

    return Object.keys(coveredKeys).length;
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

function countLiveExpansionCreeps(campaignId, role, originRoomName) {
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

        if (originRoomName && creep.memory.originRoomName !== originRoomName) {
            continue;
        }

        count += 1;
    }

    return count;
}

function refreshMilitaryCampaign(store, campaign, ctx, ownedRoomNames) {
    const targetRoomName = campaign.targetRoomName;
    const roomState = targetRoomName ? store.scoutedRooms[targetRoomName] : null;
    const safeModeUntil = getSafeModeUntil(roomState);
    const invalidUntilTick = Math.max(
        Number.isFinite(safeModeUntil) ? safeModeUntil : 0,
        Game.time + MAX_SIEGE_STALL
    );

    if (!targetRoomName) {
        restartScoutStage(store, campaign, ctx, "missing military target", Game.time + SCOUT_RETRY_DELAY);
        return false;
    }

    if (
        Number.isFinite(campaign.siegeStartedAt) &&
        Game.time - campaign.siegeStartedAt >= MAX_SIEGE_STALL
    ) {
        restartScoutStage(store, campaign, ctx, `siege stalled in ${targetRoomName}`, invalidUntilTick);
        return false;
    }

    if (safeModeUntil && safeModeUntil > Game.time) {
        restartScoutStage(store, campaign, ctx, `target ${targetRoomName} entered safe mode`, invalidUntilTick);
        return false;
    }

    const stagingRoomNames = getMilitaryStagingRoomNames(
        store,
        getSpawnedOwnedRoomNames(ownedRoomNames),
        targetRoomName,
        campaign
    );

    if (stagingRoomNames.length === 0) {
        restartScoutStage(store, campaign, ctx, `target ${targetRoomName} became unreachable`, invalidUntilTick);
        return false;
    }

    campaign.originRoomName = stagingRoomNames[0];
    campaign.stagingRoomNames = stagingRoomNames;
    return true;
}

function isTargetInvalid(campaign, roomName) {
    if (!campaign || !campaign.invalidTargetRoomNames) {
        return false;
    }

    const invalidUntilTick = campaign.invalidTargetRoomNames[roomName];

    return Number.isFinite(invalidUntilTick) && invalidUntilTick > Game.time;
}

function setInvalidTargetUntil(campaign, roomName, untilTick) {
    if (
        !campaign ||
        !roomName ||
        !Number.isFinite(untilTick)
    ) {
        return;
    }

    if (!campaign.invalidTargetRoomNames) {
        campaign.invalidTargetRoomNames = {};
    }

    campaign.invalidTargetRoomNames[roomName] = Math.max(
        campaign.invalidTargetRoomNames[roomName] || 0,
        untilTick
    );
}

function getSafeModeUntil(roomState) {
    const combat = roomState && roomState.combat
        ? roomState.combat
        : null;

    if (
        combat &&
        Number.isFinite(combat.safeModeUntil) &&
        combat.safeModeUntil > Game.time
    ) {
        return combat.safeModeUntil;
    }

    return null;
}

function findSiegeTarget(room) {
    return (
        findPriorityHostileCreep(room) ||
        findCoveredCriticalRampart(room) ||
        findPriorityHostileStructure(room)
    );
}

function findPriorityHostileCreep(room) {
    const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);

    if (hostileCreeps.length === 0) {
        return null;
    }

    const healers = hostileCreeps.filter(function (creep) {
        return creep.getActiveBodyparts(HEAL) > 0;
    });

    if (healers.length > 0) {
        return pickCombatTargetByRange(room, healers);
    }

    return pickCombatTargetByRange(room, hostileCreeps);
}

function findCoveredCriticalRampart(room) {
    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    const ramparts = [];

    for (const structure of hostileStructures) {
        if (
            structure.structureType !== STRUCTURE_TOWER &&
            structure.structureType !== STRUCTURE_SPAWN
        ) {
            continue;
        }

        const structuresAtPosition = room.lookForAt(LOOK_STRUCTURES, structure.pos.x, structure.pos.y);

        for (const otherStructure of structuresAtPosition) {
            if (otherStructure.structureType === STRUCTURE_RAMPART) {
                ramparts.push(otherStructure);
            }
        }
    }

    if (ramparts.length === 0) {
        return null;
    }

    return pickCombatTargetByRange(room, ramparts);
}

function findPriorityHostileStructure(room) {
    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES).filter(function (structure) {
        return structure.structureType !== STRUCTURE_CONTROLLER;
    });
    const towers = hostileStructures.filter(function (structure) {
        return structure.structureType === STRUCTURE_TOWER;
    });
    const spawns = hostileStructures.filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    });
    const others = hostileStructures.filter(function (structure) {
        return (
            structure.structureType !== STRUCTURE_TOWER &&
            structure.structureType !== STRUCTURE_SPAWN
        );
    });

    return (
        pickCombatTargetByRange(room, towers) ||
        pickCombatTargetByRange(room, spawns) ||
        pickCombatTargetByRange(room, others)
    );
}

function pickCombatTargetByRange(room, targets) {
    if (!targets || targets.length === 0) {
        return null;
    }

    targets.sort(function (left, right) {
        const leftRange = room.controller
            ? room.controller.pos.getRangeTo(left)
            : getRangeToCenter(left);
        const rightRange = room.controller
            ? room.controller.pos.getRangeTo(right)
            : getRangeToCenter(right);

        if (leftRange !== rightRange) {
            return leftRange - rightRange;
        }

        if (left.pos.x !== right.pos.x) {
            return left.pos.x - right.pos.x;
        }

        if (left.pos.y !== right.pos.y) {
            return left.pos.y - right.pos.y;
        }

        return String(left.id || left.name || "").localeCompare(String(right.id || right.name || ""));
    });

    return targets[0];
}

function getRangeToCenter(target) {
    return Math.max(
        Math.abs(target.pos.x - 25),
        Math.abs(target.pos.y - 25)
    );
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

    if (campaign && campaign.scoutResetPending) {
        return false;
    }

    return store.frontierQueue.length === 0 || !store.frontierQueue;
}

function isScoutCoolingDown(campaign) {
    return !!(
        campaign &&
        Number.isFinite(campaign.scoutCooldownUntil) &&
        campaign.scoutCooldownUntil > Game.time
    );
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
    STRATEGIES,
    getActiveCampaign,
    getEnemyDistanceHeatmap,
    getSpawnSiteObject,
    getSpawnSitePlan,
    isExpansionRole,
    pickNextScoutRoom,
    recordScoutDeath,
    recordScoutedRoom,
    rememberScoutRoomSnapshot,
    reconcile,
};
