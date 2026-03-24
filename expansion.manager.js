const constants = require("./constants");
const roomScope = require("./room.scope");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");

const BRANCH_DECISION_CLAIMED = "claimed";
const BRANCH_DECISION_INVALID = "invalid";
const BRANCH_DECISION_VALID = "valid";
const CANDIDATE_STATUS_CLAIMING = "claiming";
const CANDIDATE_STATUS_CLAIM_PENDING = "claimPending";
const CANDIDATE_STATUS_WAITING_FOR_GCL = "waitingForGcl";

function refreshExpansion() {
    ensureExpansionMemory();
    recordVisibleRoomIntel();
    normalizeExpansionState();

    if (Memory.expansion.activeCandidate) {
        refreshActiveCandidate();
        return;
    }

    if (!Memory.expansion.activeBranch) {
        seedNextBranch();

        if (Memory.expansion.activeCandidate) {
            refreshActiveCandidate();
            return;
        }
    }

    if (Memory.expansion.activeBranch) {
        refreshActiveBranch();

        if (Memory.expansion.activeCandidate) {
            refreshActiveCandidate();
        }
    }
}

function recordRoomIntel(room) {
    if (!room || typeof room.name !== "string") {
        return null;
    }

    const controller = room.controller || null;
    const exits = getSortedNeighborRoomNames(room.name);
    const intel = getRoomIntelMemory(room.name);

    intel.scoutedAt = Game.time;
    intel.exits = exits;
    intel.controllerExists = Boolean(controller);
    intel.ownerUsername =
        controller && controller.owner && typeof controller.owner.username === "string"
            ? controller.owner.username
            : null;
    intel.reservationUsername =
        controller && controller.reservation && typeof controller.reservation.username === "string"
            ? controller.reservation.username
            : null;
    intel.sourceCount = typeof room.find === "function" ? room.find(FIND_SOURCES).length : 0;
    intel.claimable = isClaimableRoom(controller);

    return intel;
}

function normalizeExpansionState() {
    pruneStaleIntel();

    if (!isValidActiveBranch(Memory.expansion.activeBranch)) {
        Memory.expansion.activeBranch = null;
    }

    if (!isValidActiveCandidate(Memory.expansion.activeCandidate)) {
        Memory.expansion.activeCandidate = null;
    }

    const activeCandidate = Memory.expansion.activeCandidate;

    if (activeCandidate && isOwnedRoomName(activeCandidate.targetRoomName)) {
        setBranchDecision(
            activeCandidate.originRoomName,
            activeCandidate.targetRoomName,
            BRANCH_DECISION_CLAIMED,
            activeCandidate.branchRooms
        );
        Memory.expansion.activeCandidate = null;
    }

    if (!Memory.expansion.activeBranch) {
        cleanupExpansionTasks(constants.taskTypes.SCOUT_ROOM);
        cleanupExpansionSpawnTasks(constants.roles.SCOUT);
    }

    if (!Memory.expansion.activeCandidate) {
        cleanupExpansionTasks(constants.taskTypes.CLAIM_ROOM);
        cleanupExpansionSpawnTasks(constants.roles.CLAIMER);
    }
}

function refreshActiveBranch() {
    const branch = Memory.expansion.activeBranch;

    if (!branch) {
        return;
    }

    while (branch.frontier.length > 0) {
        const currentEntry = branch.frontier[branch.frontier.length - 1];
        const intel = getFreshRoomIntel(currentEntry.roomName);

        if (!intel) {
            ensureScoutRoomTask(branch, currentEntry);
            return;
        }

        cleanupExpansionTasks(constants.taskTypes.SCOUT_ROOM);
        branch.frontier.pop();
        branch.visited[currentEntry.roomName] = {
            parentRoomName: currentEntry.parentRoomName,
            depth: currentEntry.depth,
        };

        if (!intel.claimable) {
            rejectActiveBranch(BRANCH_DECISION_INVALID);
            return;
        }

        const forwardNeighbors = getForwardNeighbors(intel.exits, currentEntry.parentRoomName);

        if (hasBranchCycle(branch, forwardNeighbors)) {
            rejectActiveBranch(BRANCH_DECISION_INVALID);
            return;
        }

        if (currentEntry.depth >= constants.expansion.SEARCH_DEPTH) {
            if (forwardNeighbors.length > 0) {
                rejectActiveBranch(BRANCH_DECISION_INVALID);
                return;
            }

            branch.leafRoomName = currentEntry.roomName;
            continue;
        }

        if (forwardNeighbors.length > 1) {
            rejectActiveBranch(BRANCH_DECISION_INVALID);
            return;
        }

        if (forwardNeighbors.length === 0) {
            branch.leafRoomName = currentEntry.roomName;
            continue;
        }

        branch.frontier.push({
            roomName: forwardNeighbors[0],
            parentRoomName: currentEntry.roomName,
            depth: currentEntry.depth + 1,
        });
    }

    finalizeActiveBranch();
}

function refreshActiveCandidate() {
    const candidate = Memory.expansion.activeCandidate;

    if (!candidate) {
        return;
    }

    if (!isOperationalOriginRoom(candidate.originRoomName)) {
        clearActiveCandidate();
        return;
    }

    if (isOwnedRoomName(candidate.targetRoomName)) {
        setBranchDecision(
            candidate.originRoomName,
            candidate.targetRoomName,
            BRANCH_DECISION_CLAIMED,
            candidate.branchRooms
        );
        clearActiveCandidate();
        return;
    }

    const targetRoom = Game.rooms[candidate.targetRoomName];

    if (targetRoom) {
        const intel = recordRoomIntel(targetRoom);

        if (!intel || !intel.claimable) {
            setBranchDecision(
                candidate.originRoomName,
                candidate.targetRoomName,
                BRANCH_DECISION_INVALID,
                candidate.branchRooms
            );
            clearActiveCandidate();
            return;
        }
    }

    if (!hasAvailableClaimSlot()) {
        candidate.status = CANDIDATE_STATUS_WAITING_FOR_GCL;
        cleanupExpansionTasks(constants.taskTypes.CLAIM_ROOM);
        cleanupExpansionSpawnTasks(constants.roles.CLAIMER);
        return;
    }

    ensureClaimRoomTask(candidate);
}

function seedNextBranch() {
    const operationalRoomNames = roomScope.getOperationalRoomNames();
    const ownedRoomNames = buildRoomNameSet(roomScope.getOwnedRoomNames());

    for (const originRoomName of operationalRoomNames) {
        for (const neighborRoomName of getSortedNeighborRoomNames(originRoomName)) {
            if (ownedRoomNames[neighborRoomName]) {
                continue;
            }

            const branchDecision = getFreshBranchDecision(originRoomName, neighborRoomName);

            if (branchDecision) {
                if (branchDecision.status === BRANCH_DECISION_VALID) {
                    activateCandidate(
                        originRoomName,
                        neighborRoomName,
                        branchDecision.branchRooms,
                        hasAvailableClaimSlot()
                            ? CANDIDATE_STATUS_CLAIM_PENDING
                            : CANDIDATE_STATUS_WAITING_FOR_GCL
                    );
                    return;
                }

                continue;
            }

            Memory.expansion.activeBranch = {
                originRoomName: originRoomName,
                rootRoomName: neighborRoomName,
                frontier: [
                    {
                        roomName: neighborRoomName,
                        parentRoomName: originRoomName,
                        depth: 1,
                    },
                ],
                visited: {},
                status: "scouting",
            };
            return;
        }
    }
}

function finalizeActiveBranch() {
    const branch = Memory.expansion.activeBranch;

    if (!branch || !branch.leafRoomName) {
        rejectActiveBranch(BRANCH_DECISION_INVALID);
        return;
    }

    const branchRooms = getOrderedBranchRooms(branch);

    if (branchRooms.length === 0) {
        rejectActiveBranch(BRANCH_DECISION_INVALID);
        return;
    }

    setBranchDecision(
        branch.originRoomName,
        branch.rootRoomName,
        BRANCH_DECISION_VALID,
        branchRooms
    );

    activateCandidate(
        branch.originRoomName,
        branch.rootRoomName,
        branchRooms,
        hasAvailableClaimSlot()
            ? CANDIDATE_STATUS_CLAIM_PENDING
            : CANDIDATE_STATUS_WAITING_FOR_GCL
    );

    Memory.expansion.activeBranch = null;
    cleanupExpansionTasks(constants.taskTypes.SCOUT_ROOM);
    cleanupExpansionSpawnTasks(constants.roles.SCOUT);
}

function rejectActiveBranch(status) {
    const branch = Memory.expansion.activeBranch;

    if (branch) {
        setBranchDecision(branch.originRoomName, branch.rootRoomName, status, null);
    }

    Memory.expansion.activeBranch = null;
    cleanupExpansionTasks(constants.taskTypes.SCOUT_ROOM);
    cleanupExpansionSpawnTasks(constants.roles.SCOUT);
}

function activateCandidate(originRoomName, targetRoomName, branchRooms, status) {
    Memory.expansion.activeCandidate = {
        originRoomName: originRoomName,
        targetRoomName: targetRoomName,
        branchRooms: Array.isArray(branchRooms) && branchRooms.length > 0 ? branchRooms : [targetRoomName],
        status: status,
    };
}

function clearActiveCandidate() {
    Memory.expansion.activeCandidate = null;
    cleanupExpansionTasks(constants.taskTypes.CLAIM_ROOM);
    cleanupExpansionSpawnTasks(constants.roles.CLAIMER);
}

function ensureScoutRoomTask(branch, frontierEntry) {
    const existingTask = findMatchingExpansionTask(constants.taskTypes.SCOUT_ROOM, function (task) {
        return (
            task.data.targetRoomName === frontierEntry.roomName &&
            task.data.originRoomName === branch.originRoomName &&
            task.data.rootRoomName === branch.rootRoomName &&
            task.data.depth === frontierEntry.depth
        );
    });

    branch.status = "scouting";

    if (existingTask) {
        return;
    }

    cleanupExpansionTasks(constants.taskTypes.SCOUT_ROOM);

    taskStore.addTask({
        id: taskStore.nextTaskId(constants.taskTypes.SCOUT_ROOM),
        type: constants.taskTypes.SCOUT_ROOM,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SCOUT],
        data: {
            targetRoomName: frontierEntry.roomName,
            originRoomName: branch.originRoomName,
            rootRoomName: branch.rootRoomName,
            depth: frontierEntry.depth,
        },
    });
}

function ensureClaimRoomTask(candidate) {
    const existingTask = findMatchingExpansionTask(constants.taskTypes.CLAIM_ROOM, function (task) {
        return (
            task.data.targetRoomName === candidate.targetRoomName &&
            task.data.originRoomName === candidate.originRoomName
        );
    });

    if (existingTask) {
        candidate.status =
            existingTask.status === constants.taskStatuses.IN_PROGRESS
                ? CANDIDATE_STATUS_CLAIMING
                : CANDIDATE_STATUS_CLAIM_PENDING;
        return;
    }

    cleanupExpansionTasks(constants.taskTypes.CLAIM_ROOM);

    taskStore.addTask({
        id: taskStore.nextTaskId(constants.taskTypes.CLAIM_ROOM),
        type: constants.taskTypes.CLAIM_ROOM,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.CLAIMER],
        data: {
            targetRoomName: candidate.targetRoomName,
            originRoomName: candidate.originRoomName,
        },
    });

    candidate.status = CANDIDATE_STATUS_CLAIM_PENDING;
}

function hasAvailableClaimSlot() {
    if (!Game.gcl || typeof Game.gcl.level !== "number") {
        return true;
    }

    return roomScope.getOwnedRoomNames().length < Game.gcl.level;
}

function isClaimableRoom(controller) {
    if (!controller || controller.my) {
        return false;
    }

    if (controller.owner) {
        return false;
    }

    if (!controller.reservation) {
        return true;
    }

    const myUsername = roomScope.getMyUsername();

    return Boolean(
        myUsername &&
        typeof controller.reservation.username === "string" &&
        controller.reservation.username === myUsername
    );
}

function isOperationalOriginRoom(roomName) {
    return roomScope.getOperationalRoomNames().includes(roomName);
}

function isOwnedRoomName(roomName) {
    return roomScope.getOwnedRoomNames().includes(roomName);
}

function recordVisibleRoomIntel() {
    for (const roomName in Game.rooms) {
        recordRoomIntel(Game.rooms[roomName]);
    }
}

function getFreshRoomIntel(roomName) {
    const intel = Memory.expansion.roomIntel[roomName];

    if (!intel || typeof intel.scoutedAt !== "number") {
        return null;
    }

    if (Game.time - intel.scoutedAt > constants.expansion.INTEL_TTL) {
        return null;
    }

    return intel;
}

function getFreshBranchDecision(originRoomName, rootRoomName) {
    const branchIntel = Memory.expansion.branchIntel[getBranchKey(originRoomName, rootRoomName)];

    if (!branchIntel || typeof branchIntel.checkedAt !== "number") {
        return null;
    }

    if (Game.time - branchIntel.checkedAt > constants.expansion.INTEL_TTL) {
        return null;
    }

    return branchIntel;
}

function setBranchDecision(originRoomName, rootRoomName, status, branchRooms) {
    Memory.expansion.branchIntel[getBranchKey(originRoomName, rootRoomName)] = {
        checkedAt: Game.time,
        status: status,
        branchRooms: Array.isArray(branchRooms) ? branchRooms.slice() : [],
    };
}

function getOrderedBranchRooms(branch) {
    return Object.keys(branch.visited).sort(function (leftRoomName, rightRoomName) {
        const leftDepth = branch.visited[leftRoomName].depth;
        const rightDepth = branch.visited[rightRoomName].depth;

        if (leftDepth !== rightDepth) {
            return leftDepth - rightDepth;
        }

        return leftRoomName.localeCompare(rightRoomName);
    });
}

function hasBranchCycle(branch, forwardNeighbors) {
    for (const roomName of forwardNeighbors) {
        if (roomName === branch.originRoomName) {
            return true;
        }

        if (branch.visited[roomName]) {
            return true;
        }

        if (hasFrontierRoom(branch, roomName)) {
            return true;
        }
    }

    return false;
}

function hasFrontierRoom(branch, roomName) {
    for (const entry of branch.frontier) {
        if (entry.roomName === roomName) {
            return true;
        }
    }

    return false;
}

function getForwardNeighbors(exits, parentRoomName) {
    const forwardNeighbors = [];

    for (const roomName of exits) {
        if (roomName === parentRoomName) {
            continue;
        }

        forwardNeighbors.push(roomName);
    }

    return forwardNeighbors;
}

function getSortedNeighborRoomNames(roomName) {
    const exits = Game.map && typeof Game.map.describeExits === "function"
        ? Game.map.describeExits(roomName)
        : null;

    if (!exits) {
        return [];
    }

    return Object.values(exits).sort();
}

function ensureExpansionMemory() {
    if (!Memory.expansion || typeof Memory.expansion !== "object") {
        Memory.expansion = {};
    }

    if (!Memory.expansion.roomIntel || typeof Memory.expansion.roomIntel !== "object") {
        Memory.expansion.roomIntel = {};
    }

    if (!Memory.expansion.branchIntel || typeof Memory.expansion.branchIntel !== "object") {
        Memory.expansion.branchIntel = {};
    }

    if (!Memory.expansion.activeBranch || typeof Memory.expansion.activeBranch !== "object") {
        Memory.expansion.activeBranch = null;
    }

    if (!Memory.expansion.activeCandidate || typeof Memory.expansion.activeCandidate !== "object") {
        Memory.expansion.activeCandidate = null;
    }
}

function getRoomIntelMemory(roomName) {
    if (!Memory.expansion.roomIntel[roomName] || typeof Memory.expansion.roomIntel[roomName] !== "object") {
        Memory.expansion.roomIntel[roomName] = {};
    }

    return Memory.expansion.roomIntel[roomName];
}

function pruneStaleIntel() {
    const roomIntelCutoff = Game.time - constants.expansion.INTEL_TTL * 3;

    for (const roomName in Memory.expansion.roomIntel) {
        const intel = Memory.expansion.roomIntel[roomName];

        if (!intel || typeof intel.scoutedAt !== "number" || intel.scoutedAt < roomIntelCutoff) {
            delete Memory.expansion.roomIntel[roomName];
        }
    }

    const branchIntelCutoff = Game.time - constants.expansion.INTEL_TTL;

    for (const branchKey in Memory.expansion.branchIntel) {
        const intel = Memory.expansion.branchIntel[branchKey];

        if (!intel || typeof intel.checkedAt !== "number" || intel.checkedAt < branchIntelCutoff) {
            delete Memory.expansion.branchIntel[branchKey];
        }
    }
}

function isValidActiveBranch(branch) {
    return Boolean(
        branch &&
        typeof branch.originRoomName === "string" &&
        typeof branch.rootRoomName === "string" &&
        Array.isArray(branch.frontier) &&
        branch.visited &&
        typeof branch.visited === "object" &&
        typeof branch.status === "string"
    );
}

function isValidActiveCandidate(candidate) {
    return Boolean(
        candidate &&
        typeof candidate.originRoomName === "string" &&
        typeof candidate.targetRoomName === "string" &&
        Array.isArray(candidate.branchRooms) &&
        typeof candidate.status === "string"
    );
}

function buildRoomNameSet(roomNames) {
    const set = {};

    for (const roomName of roomNames) {
        set[roomName] = true;
    }

    return set;
}

function getBranchKey(originRoomName, rootRoomName) {
    return `${originRoomName}->${rootRoomName}`;
}

function findMatchingExpansionTask(taskType, predicate) {
    let matchedTask = null;
    const removedTaskIds = [];

    for (const task of taskIndex.getTasksByType(taskType)) {
        if (
            task.status !== constants.taskStatuses.PENDING &&
            task.status !== constants.taskStatuses.IN_PROGRESS
        ) {
            continue;
        }

        if (!matchedTask && predicate(task)) {
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

function cleanupExpansionTasks(taskType) {
    const removedTaskIds = taskIndex.getTasksByType(taskType).map(function (task) {
        return task.id;
    });

    if (removedTaskIds.length > 0) {
        taskStore.removeTasks(removedTaskIds, {
            clearAssignments: true,
        });
    }
}

function cleanupExpansionSpawnTasks(role) {
    const removedTaskIds = [];

    for (const task of taskIndex.getTasksByType(constants.taskTypes.SPAWN_CREEP)) {
        if (
            !task.data ||
            task.data.role !== role
        ) {
            continue;
        }

        removedTaskIds.push(task.id);
    }

    if (removedTaskIds.length > 0) {
        taskStore.removeTasks(removedTaskIds, {
            clearAssignments: true,
        });
    }
}

module.exports = {
    recordRoomIntel,
    refreshExpansion,
};
