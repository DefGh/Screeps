const constants = require("./constants");
const roomCensus = require("./room.census");
const roomScope = require("./room.scope");

const domains = constants.reactivity.domains;
const ROLE_DOMAIN_MAP = {
    [domains.ECONOMY]: [constants.roles.UNIVERSAL],
    [domains.CONSTRUCTION]: [constants.roles.UNIVERSAL],
    [domains.SPAWN_DEMAND]: [constants.roles.SPAWNER],
    [domains.SOURCES]: [constants.roles.SPAWNER],
    [domains.THREAT]: [constants.roles.SPAWNER, constants.roles.ATTACKER],
    [domains.EXPANSION]: [constants.roles.SPAWNER],
};
const GLOBAL_SCOPE_KEY = "*";

let capturedTick = null;

function captureWorldSignals() {
    if (capturedTick === Game.time) {
        return;
    }

    capturedTick = Game.time;
    ensureMemory();

    const visibleRoomNames = {};
    const snapshots = Memory.reactivity.roomSnapshots;

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        const nextSnapshot = buildSnapshot(room);
        const previousSnapshot = snapshots[roomName] || null;

        visibleRoomNames[roomName] = true;

        if (!areSnapshotsEqual(previousSnapshot, nextSnapshot)) {
            handleSnapshotChange(previousSnapshot, nextSnapshot);
            snapshots[roomName] = nextSnapshot;
        }
    }

    for (const roomName in snapshots) {
        if (visibleRoomNames[roomName]) {
            continue;
        }

        const previousSnapshot = snapshots[roomName];

        if (!previousSnapshot || previousSnapshot.visible === false) {
            continue;
        }

        const nextSnapshot = {
            roomName: roomName,
            visible: false,
        };

        handleSnapshotChange(previousSnapshot, nextSnapshot);
        snapshots[roomName] = nextSnapshot;
    }
}

function markRoomDirty(roomName, domain, options) {
    if (typeof roomName !== "string" || typeof domain !== "string") {
        return 0;
    }

    ensureMemory();

    const stamp = getNextStamp();

    if (!Memory.reactivity.roomDomains[roomName]) {
        Memory.reactivity.roomDomains[roomName] = {};
    }

    Memory.reactivity.roomDomains[roomName][domain] = stamp;

    if (!options || options.wakeDispatch !== false) {
        wakeRolesForDomain(domain, roomName, stamp);
    }

    return stamp;
}

function markRoleDirty(role, roomName, options) {
    if (typeof role !== "string") {
        return 0;
    }

    ensureMemory();

    const roomKey = normalizeRoomKey(roomName);
    const stamp = options && typeof options.stamp === "number"
        ? options.stamp
        : getNextStamp();

    if (!Memory.reactivity.roleDispatch[role]) {
        Memory.reactivity.roleDispatch[role] = {};
    }

    Memory.reactivity.roleDispatch[role][roomKey] = stamp;
    return stamp;
}

function markAllOperationalRoomsDirty(domain, options) {
    for (const roomName of roomScope.getOperationalRoomNames()) {
        markRoomDirty(roomName, domain, options);
    }
}

function markGlobalDirty(domain, options) {
    if (typeof domain !== "string") {
        return 0;
    }

    ensureMemory();

    const stamp = getNextStamp();
    Memory.reactivity.globalDomains[domain] = stamp;

    if (!options || options.wakeDispatch !== false) {
        wakeRolesForDomain(domain, GLOBAL_SCOPE_KEY, stamp);
    }

    return stamp;
}

function consumeDirty(role, executor) {
    if (typeof role !== "string" || !executor || !executor.memory) {
        return false;
    }

    if (!isReactiveRole(role)) {
        return true;
    }

    ensureMemory();

    const roomKey = resolveExecutorRoomKey(role, executor);
    const dispatchMemory = getExecutorDispatchMemory(executor);
    const currentStamp = getCurrentDispatchStamp(role, roomKey);
    const sweepInterval = constants.reactivity.DISPATCH_SWEEP_INTERVAL;

    if (
        dispatchMemory.roomKey !== roomKey ||
        typeof dispatchMemory.lastStamp !== "number" ||
        typeof dispatchMemory.nextSweepTick !== "number"
    ) {
        dispatchMemory.roomKey = roomKey;
        dispatchMemory.lastStamp = currentStamp;
        dispatchMemory.nextSweepTick = Game.time + sweepInterval;
        return true;
    }

    if (currentStamp > dispatchMemory.lastStamp) {
        dispatchMemory.lastStamp = currentStamp;
        dispatchMemory.nextSweepTick = Game.time + sweepInterval;
        return true;
    }

    if (Game.time >= dispatchMemory.nextSweepTick) {
        dispatchMemory.lastStamp = currentStamp;
        dispatchMemory.nextSweepTick = Game.time + sweepInterval;
        return true;
    }

    return false;
}

function shouldProcessRoom(roomName, domain, sweepInterval) {
    if (typeof roomName !== "string" || typeof domain !== "string") {
        return false;
    }

    ensureMemory();

    const state = getRoomProcessState(domain, roomName);

    if (
        typeof state.lastStamp !== "number" ||
        typeof state.nextSweepTick !== "number"
    ) {
        return true;
    }

    return (
        getRoomDomainStamp(roomName, domain) > state.lastStamp ||
        Game.time >= state.nextSweepTick
    );
}

function markRoomProcessed(roomName, domain, sweepInterval) {
    if (typeof roomName !== "string" || typeof domain !== "string") {
        return;
    }

    ensureMemory();

    const state = getRoomProcessState(domain, roomName);
    state.lastStamp = getRoomDomainStamp(roomName, domain);
    state.nextSweepTick = Game.time + normalizeSweepInterval(
        sweepInterval,
        constants.reactivity.ROOM_SWEEP_INTERVAL
    );
}

function shouldProcessGlobalDomain(domain, sweepInterval) {
    if (typeof domain !== "string") {
        return false;
    }

    ensureMemory();

    const state = getGlobalProcessState(domain);

    if (
        typeof state.lastStamp !== "number" ||
        typeof state.nextSweepTick !== "number"
    ) {
        return true;
    }

    return (
        getGlobalDomainStamp(domain) > state.lastStamp ||
        Game.time >= state.nextSweepTick
    );
}

function markGlobalProcessed(domain, sweepInterval) {
    if (typeof domain !== "string") {
        return;
    }

    ensureMemory();

    const state = getGlobalProcessState(domain);
    state.lastStamp = getGlobalDomainStamp(domain);
    state.nextSweepTick = Game.time + normalizeSweepInterval(
        sweepInterval,
        constants.reactivity.EXPANSION_SWEEP_INTERVAL
    );
}

function handleTaskMutation(task, action) {
    if (!task || !task.data || typeof action !== "string") {
        return;
    }

    if (action === "touch") {
        return;
    }

    const taskRoomName = getTaskOwnerRoom(task);
    const taskType = task.type;

    if (
        taskType === constants.taskTypes.BUILD ||
        taskType === constants.taskTypes.REPAIR ||
        taskType === constants.taskTypes.TRANSFER_ENERGY
    ) {
        if (taskRoomName) {
            markRoomDirty(taskRoomName, domains.ECONOMY);
        }
        return;
    }

    if (
        taskType === constants.taskTypes.SPAWN_CREEP ||
        taskType === constants.taskTypes.MINE ||
        taskType === constants.taskTypes.TAXI ||
        taskType === constants.taskTypes.BOOTSTRAP_SPAWN
    ) {
        if (taskRoomName) {
            markRoomDirty(taskRoomName, domains.SPAWN_DEMAND);
        }
        return;
    }

    if (taskType === constants.taskTypes.DEFEND_ROOM) {
        if (taskRoomName) {
            markRoomDirty(taskRoomName, domains.THREAT);
        }
        return;
    }

    if (
        taskType === constants.taskTypes.SCOUT_ROOM ||
        taskType === constants.taskTypes.CLAIM_ROOM
    ) {
        markGlobalDirty(domains.EXPANSION);
    }
}

function handleCreepDeath(creepName, creepMemory) {
    if (!creepMemory || typeof creepMemory !== "object") {
        return;
    }

    const originRoomName =
        typeof creepMemory.originRoomName === "string"
            ? creepMemory.originRoomName
            : null;
    const currentRoomName =
        typeof creepMemory.roomName === "string"
            ? creepMemory.roomName
            : originRoomName;

    if (originRoomName) {
        markRoomDirty(originRoomName, domains.ECONOMY, {
            wakeDispatch: false,
        });
        markRoomDirty(originRoomName, domains.SPAWN_DEMAND);
    }

    if (creepMemory.role === constants.roles.UNIVERSAL && originRoomName) {
        markRoomDirty(originRoomName, domains.CONSTRUCTION);
    }

    if (creepMemory.role === constants.roles.ATTACKER && currentRoomName) {
        markRoomDirty(currentRoomName, domains.THREAT);
    }
}

function handleSpawnSuccess(roomName, role, originRoomName) {
    const targetRoomName = typeof originRoomName === "string" ? originRoomName : roomName;

    if (typeof targetRoomName === "string") {
        markRoomDirty(targetRoomName, domains.ECONOMY, {
            wakeDispatch: false,
        });
        markRoomDirty(targetRoomName, domains.SPAWN_DEMAND);
    }

    if (role === constants.roles.UNIVERSAL && typeof targetRoomName === "string") {
        markRoomDirty(targetRoomName, domains.CONSTRUCTION);
    }
}

function getRoomDomainStamp(roomName, domain) {
    if (
        typeof roomName !== "string" ||
        typeof domain !== "string" ||
        !Memory.reactivity.roomDomains[roomName] ||
        typeof Memory.reactivity.roomDomains[roomName][domain] !== "number"
    ) {
        return 0;
    }

    return Memory.reactivity.roomDomains[roomName][domain];
}

function getGlobalDomainStamp(domain) {
    return typeof Memory.reactivity.globalDomains[domain] === "number"
        ? Memory.reactivity.globalDomains[domain]
        : 0;
}

function ensureMemory() {
    if (!Memory.reactivity || typeof Memory.reactivity !== "object") {
        Memory.reactivity = {};
    }

    if (typeof Memory.reactivity.sequence !== "number") {
        Memory.reactivity.sequence = 0;
    }

    if (!Memory.reactivity.roomDomains || typeof Memory.reactivity.roomDomains !== "object") {
        Memory.reactivity.roomDomains = {};
    }

    if (!Memory.reactivity.roleDispatch || typeof Memory.reactivity.roleDispatch !== "object") {
        Memory.reactivity.roleDispatch = {};
    }

    if (!Memory.reactivity.roomSnapshots || typeof Memory.reactivity.roomSnapshots !== "object") {
        Memory.reactivity.roomSnapshots = {};
    }

    if (!Memory.reactivity.globalDomains || typeof Memory.reactivity.globalDomains !== "object") {
        Memory.reactivity.globalDomains = {};
    }

    if (!Memory.reactivity.processState || typeof Memory.reactivity.processState !== "object") {
        Memory.reactivity.processState = {};
    }

    if (!Memory.reactivity.processState.rooms || typeof Memory.reactivity.processState.rooms !== "object") {
        Memory.reactivity.processState.rooms = {};
    }

    if (!Memory.reactivity.processState.globals || typeof Memory.reactivity.processState.globals !== "object") {
        Memory.reactivity.processState.globals = {};
    }
}

function buildSnapshot(room) {
    const summary = roomCensus.getVisibleRoomSummary(room);

    return {
        controllerMy: summary.controllerMy,
        controllerLevel: summary.controllerLevel,
        hostileCount: summary.hostileCount,
        myConstructionSiteCount: summary.myConstructionSiteCount,
        ownerUsername: summary.ownerUsername,
        reservationUsername: summary.reservationUsername,
        roomName: summary.roomName,
        sourceCount: summary.sourceCount,
        structureCounts: summary.structureCounts,
        visible: true,
    };
}

function handleSnapshotChange(previousSnapshot, nextSnapshot) {
    const roomName = nextSnapshot && nextSnapshot.visible
        ? nextSnapshot.roomName
        : previousSnapshot && previousSnapshot.visible
            ? previousSnapshot.roomName
            : null;
    const wasOwned = Boolean(previousSnapshot && previousSnapshot.controllerMy);
    const isOwned = Boolean(nextSnapshot && nextSnapshot.controllerMy);
    const ownedRoomName = isOwned ? nextSnapshot.roomName : wasOwned ? previousSnapshot.roomName : null;

    if (ownedRoomName) {
        if (
            !previousSnapshot ||
            !nextSnapshot ||
            previousSnapshot.controllerLevel !== nextSnapshot.controllerLevel ||
            previousSnapshot.myConstructionSiteCount !== nextSnapshot.myConstructionSiteCount ||
            !areStructureCountsEqual(previousSnapshot.structureCounts, nextSnapshot.structureCounts)
        ) {
            markRoomDirty(ownedRoomName, domains.CONSTRUCTION);
            markRoomDirty(ownedRoomName, domains.SPAWN_DEMAND);
            markRoomDirty(ownedRoomName, domains.ECONOMY);
            markRoomDirty(ownedRoomName, domains.SOURCES, {
                wakeDispatch: false,
            });
        }

        if (
            !previousSnapshot ||
            !nextSnapshot ||
            previousSnapshot.hostileCount !== nextSnapshot.hostileCount
        ) {
            markRoomDirty(ownedRoomName, domains.THREAT);
            markRoomDirty(ownedRoomName, domains.SOURCES, {
                wakeDispatch: false,
            });
        }
    }

    if (
        !previousSnapshot ||
        !nextSnapshot ||
        previousSnapshot.visible !== nextSnapshot.visible ||
        previousSnapshot.ownerUsername !== nextSnapshot.ownerUsername ||
        previousSnapshot.reservationUsername !== nextSnapshot.reservationUsername ||
        previousSnapshot.sourceCount !== nextSnapshot.sourceCount ||
        previousSnapshot.controllerLevel !== nextSnapshot.controllerLevel
    ) {
        markGlobalDirty(domains.EXPANSION);
    }
}

function wakeRolesForDomain(domain, roomName, stamp) {
    const roles = ROLE_DOMAIN_MAP[domain] || [];

    for (const role of roles) {
        markRoleDirty(role, roomName, {
            stamp: stamp,
        });
    }
}

function getTaskOwnerRoom(task) {
    const taskHandlers = require("./task.handlers");
    const roomName = taskHandlers.getTaskOwnerRoom(task);
    return typeof roomName === "string" ? roomName : null;
}

function getNextStamp() {
    Memory.reactivity.sequence += 1;
    return Memory.reactivity.sequence;
}

function getCurrentDispatchStamp(role, roomKey) {
    const dispatchByRole = Memory.reactivity.roleDispatch[role] || {};
    const roomStamp = typeof dispatchByRole[roomKey] === "number" ? dispatchByRole[roomKey] : 0;
    const globalStamp = typeof dispatchByRole[GLOBAL_SCOPE_KEY] === "number"
        ? dispatchByRole[GLOBAL_SCOPE_KEY]
        : 0;

    return Math.max(roomStamp, globalStamp);
}

function getExecutorDispatchMemory(executor) {
    if (!executor.memory.reactivity || typeof executor.memory.reactivity !== "object") {
        executor.memory.reactivity = {};
    }

    return executor.memory.reactivity;
}

function resolveExecutorRoomKey(role, executor) {
    if (role === constants.roles.UNIVERSAL) {
        if (executor.memory && typeof executor.memory.originRoomName === "string") {
            return executor.memory.originRoomName;
        }
    }

    if (executor.room && typeof executor.room.name === "string") {
        return executor.room.name;
    }

    if (executor.memory && typeof executor.memory.originRoomName === "string") {
        return executor.memory.originRoomName;
    }

    return GLOBAL_SCOPE_KEY;
}

function normalizeRoomKey(roomName) {
    return typeof roomName === "string" ? roomName : GLOBAL_SCOPE_KEY;
}

function getRoomProcessState(domain, roomName) {
    if (!Memory.reactivity.processState.rooms[domain]) {
        Memory.reactivity.processState.rooms[domain] = {};
    }

    if (!Memory.reactivity.processState.rooms[domain][roomName]) {
        Memory.reactivity.processState.rooms[domain][roomName] = {};
    }

    return Memory.reactivity.processState.rooms[domain][roomName];
}

function getGlobalProcessState(domain) {
    if (!Memory.reactivity.processState.globals[domain]) {
        Memory.reactivity.processState.globals[domain] = {};
    }

    return Memory.reactivity.processState.globals[domain];
}

function normalizeSweepInterval(value, fallback) {
    return typeof value === "number" && value > 0 ? value : fallback;
}

function isReactiveRole(role) {
    return (
        role === constants.roles.SPAWNER ||
        role === constants.roles.UNIVERSAL ||
        role === constants.roles.ATTACKER
    );
}

function areSnapshotsEqual(left, right) {
    if (left === right) {
        return true;
    }

    if (!left || !right) {
        return false;
    }

    return (
        left.visible === right.visible &&
        left.controllerMy === right.controllerMy &&
        left.controllerLevel === right.controllerLevel &&
        left.hostileCount === right.hostileCount &&
        left.myConstructionSiteCount === right.myConstructionSiteCount &&
        left.ownerUsername === right.ownerUsername &&
        left.reservationUsername === right.reservationUsername &&
        left.sourceCount === right.sourceCount &&
        areStructureCountsEqual(left.structureCounts, right.structureCounts)
    );
}

function areStructureCountsEqual(left, right) {
    const leftCounts = left || {};
    const rightCounts = right || {};
    const keys = {};

    for (const key in leftCounts) {
        keys[key] = true;
    }

    for (const key in rightCounts) {
        keys[key] = true;
    }

    for (const key in keys) {
        if ((leftCounts[key] || 0) !== (rightCounts[key] || 0)) {
            return false;
        }
    }

    return true;
}

module.exports = {
    captureWorldSignals,
    consumeDirty,
    domains,
    handleCreepDeath,
    handleSpawnSuccess,
    handleTaskMutation,
    markAllOperationalRoomsDirty,
    markGlobalDirty,
    markGlobalProcessed,
    markRoleDirty,
    markRoomDirty,
    markRoomProcessed,
    shouldProcessGlobalDomain,
    shouldProcessRoom,
};
