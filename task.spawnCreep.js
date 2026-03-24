const colonyManager = require("./colony.manager");
const constants = require("./constants");
const memoryAccess = require("./memory.access");
const resourceManager = require("./resource.manager");
const sourceManager = require("./source.manager");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");
const taskHelpers = require("./task.helpers");

function run(spawn, task) {
    if (!isValidSpawnTask(task) || typeof spawn.spawnCreep !== "function") {
        return true;
    }

    if (shouldDiscardAttackerSpawnTask(spawn, task)) {
        return true;
    }

    const creepName = task.data.creepName || buildCreepName(task);
    const spawnMemory = Object.assign({}, task.data.memory, { role: task.data.role });
    const body = resolveSpawnBody(spawn, task);
    const result = spawn.spawnCreep(body, creepName, {
        memory: spawnMemory,
    });

    if (result === OK) {
        resourceManager.invalidateResourcePlanCache();
        return true;
    }

    if (result === ERR_BUSY || result === ERR_NOT_ENOUGH_ENERGY || result === ERR_NAME_EXISTS) {
        return false;
    }

    cleanupLinkedTasks(task);
    return true;
}

function ensureAttackerSpawnTask(spawn) {
    if (!spawn || !spawn.room) {
        return;
    }

    const roomName = spawn.room.name;
    const hostileCreeps = spawn.room.find(FIND_HOSTILE_CREEPS);

    if (!hostileCreeps || hostileCreeps.length === 0) {
        cleanupAttackerSpawnTasks(roomName);
        return;
    }

    if (
        countAliveAttackers(roomName) + countQueuedAttackers(roomName) >= constants.attackers.MAX_PER_ROOM
    ) {
        return;
    }

    const taskId = taskHelpers.nextSpawnTaskId(constants.roles.ATTACKER);
    taskHelpers.addTask({
        id: taskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildAttackerBody(spawn),
            memory: {
                role: constants.roles.ATTACKER,
                originRoomName: roomName,
            },
            role: constants.roles.ATTACKER,
            roomName: roomName,
            stage: constants.spawnTaskStages.WAITING,
        },
    });
}

function ensureUniversalSpawnTask(spawn) {
    if (!spawn || !spawn.room) {
        return;
    }

    const roomName = spawn.room.name;
    const targetUniversals = colonyManager.getTargetUniversalsForRoom(roomName);
    const aliveUniversals = countAliveUniversals(roomName);
    const queuedUniversals = countQueuedUniversals(roomName);

    if (aliveUniversals + queuedUniversals >= targetUniversals) {
        return;
    }

    const taskId = taskHelpers.nextSpawnTaskId(constants.roles.UNIVERSAL);
    taskHelpers.addTask({
        id: taskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildUniversalBody(spawn, shouldUseEmergencyUniversalBody(spawn)),
            memory: {
                role: constants.roles.UNIVERSAL,
                originRoomName: roomName,
            },
            role: constants.roles.UNIVERSAL,
            roomName: roomName,
            stage: constants.spawnTaskStages.WAITING,
        },
    });
}

function ensureClaimerSpawnTask(spawn) {
    const activeCandidate = memoryAccess.getExpansionActiveCandidate();

    if (
        !activeCandidate ||
        activeCandidate.originRoomName !== spawn.room.name ||
        activeCandidate.status === "waitingForGcl"
    ) {
        return;
    }

    if (countAliveByRole(constants.roles.CLAIMER) + countQueuedByRole(constants.roles.CLAIMER) >= 1) {
        return;
    }

    const taskId = taskHelpers.nextSpawnTaskId(constants.roles.CLAIMER);
    taskHelpers.addTask({
        id: taskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildClaimerBody(),
            memory: {
                role: constants.roles.CLAIMER,
                originRoomName: activeCandidate.originRoomName,
            },
            originRoomName: activeCandidate.originRoomName,
            role: constants.roles.CLAIMER,
            roomName: activeCandidate.originRoomName,
            stage: constants.spawnTaskStages.WAITING,
            targetRoomName: activeCandidate.targetRoomName,
        },
    });
}

function ensureScoutSpawnTask(spawn) {
    const activeBranch = memoryAccess.getExpansionActiveBranch();

    if (!activeBranch || activeBranch.originRoomName !== spawn.room.name) {
        return;
    }

    if (countAliveByRole(constants.roles.SCOUT) + countQueuedByRole(constants.roles.SCOUT) >= 1) {
        return;
    }

    const taskId = taskHelpers.nextSpawnTaskId(constants.roles.SCOUT);
    taskHelpers.addTask({
        id: taskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildScoutBody(),
            memory: {
                role: constants.roles.SCOUT,
                originRoomName: activeBranch.originRoomName,
            },
            originRoomName: activeBranch.originRoomName,
            role: constants.roles.SCOUT,
            roomName: activeBranch.originRoomName,
            rootRoomName: activeBranch.rootRoomName,
            stage: constants.spawnTaskStages.WAITING,
        },
    });
}

function ensureMinerSpawnTask(spawn) {
    if (!spawn || !spawn.room) {
        return;
    }

    const roomName = spawn.room.name;
    const targetUniversals = colonyManager.getTargetUniversalsForRoom(roomName);
    const aliveUniversals = countAliveUniversals(roomName);

    if (aliveUniversals < targetUniversals) {
        return;
    }

    const minerSources = sourceManager.getMinerSourcesForRoom(roomName);

    for (const sourceData of minerSources) {
        if (hasMineTaskForSource(sourceData.sourceId)) {
            continue;
        }

        createMinerTaskSet(spawn, sourceData.sourceId, sourceData.minerPos);
    }
}

function countAliveAttackers(roomName) {
    let count = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (!creep.memory || creep.memory.role !== constants.roles.ATTACKER) {
            continue;
        }

        if (creep.memory.originRoomName !== roomName) {
            continue;
        }

        count += 1;
    }

    return count;
}

function countAliveCreeps() {
    return Object.keys(Game.creeps).length;
}

function countAliveUniversals(roomName) {
    let count = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (!creep.memory || creep.memory.role !== constants.roles.UNIVERSAL) {
            continue;
        }

        if (roomName && creep.memory.originRoomName !== roomName) {
            continue;
        }

        count += 1;
    }

    return count;
}

function countQueuedAttackers(roomName) {
    return taskIndex.getQueuedSpawnTasksByRoleAndRoom(constants.roles.ATTACKER, roomName).length;
}

function countQueuedUniversals(roomName) {
    return taskIndex.getQueuedSpawnTasksByRoleAndRoom(constants.roles.UNIVERSAL, roomName).length;
}

function countAliveByRole(role, roomName) {
    let count = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (!creep.memory || creep.memory.role !== role) {
            continue;
        }

        if (roomName && (!creep.room || creep.room.name !== roomName)) {
            continue;
        }

        count += 1;
    }

    return count;
}

function countQueuedByRole(role, roomName) {
    return taskIndex.getQueuedSpawnTasksByRoleAndRoom(role, roomName).length;
}

function buildUniversalBody(spawn, useAvailableEnergy) {
    const partSet = [MOVE, WORK, CARRY] ;
    const minimumCost = BODYPART_COST[WORK];
    const capacity = spawn.room && typeof getRoomEnergyBudget(spawn.room, useAvailableEnergy) === "number"
        ? getRoomEnergyBudget(spawn.room, useAvailableEnergy)
        : minimumCost;

    if (capacity < 200) {
        return [MOVE, WORK, CARRY];
    }

    const body = [];
    let remainingEnergy = capacity;
    let nextPartIndex = 0;

    while (body.length < MAX_CREEP_SIZE) {
        nextPartIndex =  body.length % partSet.length;
        
        const nextPart = partSet[nextPartIndex];
        const nextPartCost = BODYPART_COST[nextPart];

        if (remainingEnergy < nextPartCost) {
            break;
        }

        body.push(nextPart);
        remainingEnergy -= nextPartCost;
    }

    return body;
}

function buildAttackerBody(spawn) {
    const pairCost = BODYPART_COST[MOVE] + BODYPART_COST[ATTACK];
    const capacity = spawn.room && typeof spawn.room.energyCapacityAvailable === "number"
        ? spawn.room.energyCapacityAvailable
        : pairCost;

    if (capacity < pairCost) {
        return [MOVE, ATTACK];
    }

    const body = [];
    let remainingEnergy = capacity;

    while (body.length + 2 <= MAX_CREEP_SIZE && remainingEnergy >= pairCost) {
        body.push(MOVE, ATTACK);
        remainingEnergy -= pairCost;
    }

    return body.length > 0 ? body : [MOVE, ATTACK];
}

function buildScoutBody() {
    return [MOVE];
}

function buildClaimerBody() {
    return [MOVE, CLAIM];
}

function getRoomEnergyBudget(room, useAvailableEnergy) {
    if (!room) {
        return 0;
    }

    if (useAvailableEnergy && typeof room.energyAvailable === "number") {
        return room.energyAvailable;
    }

    if (typeof room.energyCapacityAvailable === "number") {
        return room.energyCapacityAvailable;
    }

    return 0;
}

function shouldUseEmergencyUniversalBody(spawn) {
    return countAliveCreeps() === 0;
}

function resolveSpawnBody(spawn, task) {
    if (
        task &&
        task.data &&
        task.data.role === constants.roles.UNIVERSAL &&
        shouldUseEmergencyUniversalBody(spawn)
    ) {
        const emergencyBody = buildUniversalBody(spawn, true);

        if (Array.isArray(emergencyBody) && emergencyBody.length > 0) {
            task.data.body = emergencyBody;
            return emergencyBody;
        }
    }

    return task.data.body;
}

function shouldDiscardAttackerSpawnTask(spawn, task) {
    if (!isAttackerSpawnTask(task) || !spawn || !spawn.room) {
        return false;
    }

    return spawn.room.find(FIND_HOSTILE_CREEPS).length === 0;
}

function buildMinerBody(spawn) {
    const minimumCost = BODYPART_COST[WORK];
    const capacity = spawn.room && typeof spawn.room.energyCapacityAvailable === "number"
        ? spawn.room.energyCapacityAvailable
        : minimumCost;

    if (capacity < minimumCost) {
        return [WORK];
    }

    const maxPartsByEnergy = Math.floor(capacity / minimumCost);
    const workParts = Math.max(
        1,
        Math.min(constants.miners.MAX_WORK_PARTS, maxPartsByEnergy, MAX_CREEP_SIZE)
    );

    const body = [];

    for (let index = 0; index < workParts; index += 1) {
        body.push(WORK);
    }

    return body;
}

function createMinerTaskSet(spawn, sourceId, minerPos) {
    const mineTaskId = taskHelpers.nextTaskId(constants.taskTypes.MINE);
    const taxiTaskId = taskHelpers.nextTaskId(constants.taskTypes.TAXI);
    const spawnTaskId = taskHelpers.nextSpawnTaskId(constants.roles.MINER);
    const creepName = buildPlannedCreepName(constants.roles.MINER, mineTaskId);

    taskHelpers.addTask({
        id: mineTaskId,
        type: constants.taskTypes.MINE,
        status: constants.taskStatuses.IN_PROGRESS,
        canExecute: [constants.roles.MINER],
        data: {
            roomName: minerPos.roomName,
            sourceId: sourceId,
        },
    });

    taskHelpers.addTask({
        id: taxiTaskId,
        type: constants.taskTypes.TAXI,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: {
            minerName: creepName,
            roomName: minerPos.roomName,
            sourceId: sourceId,
            minerPos: minerPos,
        },
    });

    taskHelpers.addTask({
        id: spawnTaskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildMinerBody(spawn),
            creepName: creepName,
            memory: {
                originRoomName: spawn.room.name,
                role: constants.roles.MINER,
                taskId: mineTaskId,
            },
            mineTaskId: mineTaskId,
            role: constants.roles.MINER,
            roomName: spawn.room.name,
            sourceId: sourceId,
            stage: constants.spawnTaskStages.WAITING,
            taxiTaskId: taxiTaskId,
        },
    });
}

function buildCreepName(task) {
    return task.data.role + "_" + Game.time;
}

function buildPlannedCreepName(role, taskId) {
    return role + "_" + String(taskId).replace(":", "_");
}

function hasMineTaskForSource(sourceId) {
    for (const task of taskIndex.getTasksByType(constants.taskTypes.MINE)) {
        if (task.data.sourceId === sourceId) {
            return true;
        }
    }

    return false;
}

function cleanupLinkedTasks(task) {
    const linkedTaskIds = [];

    if (!task || !task.data) {
        return;
    }

    if (task.data.mineTaskId && taskStore.getTask(task.data.mineTaskId)) {
        linkedTaskIds.push(task.data.mineTaskId);
    }

    if (task.data.taxiTaskId && taskStore.getTask(task.data.taxiTaskId)) {
        linkedTaskIds.push(task.data.taxiTaskId);
    }

    if (linkedTaskIds.length > 0) {
        taskStore.removeTasks(linkedTaskIds, {
            clearAssignments: true,
        });
    }
}

function cleanupAttackerSpawnTasks(roomName) {
    const taskIds = [];

    for (const task of taskIndex.getPendingSpawnTasksByRoleAndRoom(constants.roles.ATTACKER, roomName)) {
        if (task.data.roomName === roomName) {
            taskIds.push(task.id);
        }
    }

    if (taskIds.length > 0) {
        taskStore.removeTasks(taskIds, {
            clearAssignments: true,
        });
    }
}

function isAttackerSpawnTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.SPAWN_CREEP &&
        task.data &&
        task.data.role === constants.roles.ATTACKER
    );
}

function isUniversalSpawnTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.SPAWN_CREEP &&
        task.data &&
        task.data.role === constants.roles.UNIVERSAL
    );
}

function resolveUniversalSpawnTaskRoomName(task) {
    if (!isUniversalSpawnTask(task)) {
        return null;
    }

    if (typeof task.data.roomName === "string") {
        return task.data.roomName;
    }

    return task.data.memory && typeof task.data.memory.originRoomName === "string"
        ? task.data.memory.originRoomName
        : null;
}

function isValidSpawnTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.SPAWN_CREEP &&
        task.data &&
        Array.isArray(task.data.body) &&
        task.data.body.length > 0 &&
        task.data.memory &&
        typeof task.data.memory === "object" &&
        typeof task.data.role === "string" &&
        typeof task.data.roomName === "string" &&
        typeof task.data.stage === "string"
    );
}

function canExecute(executor, task) {
    return (
        validate(task) &&
        executor &&
        typeof executor.spawnCreep === "function" &&
        canSpawnTaskInRoom(executor, task)
    );
}

function canSpawnTaskInRoom(executor, task) {
    if (
        !task ||
        !task.data ||
        typeof task.data.roomName !== "string"
    ) {
        return false;
    }

    if (isAttackerSpawnTask(task) && executor.room.find(FIND_HOSTILE_CREEPS).length === 0) {
        return false;
    }

    return Boolean(executor && executor.room && executor.room.name === task.data.roomName);
}

function validate(task) {
    return isValidSpawnTask(task);
}

function getOwnerRoom(task) {
    return taskHelpers.getTaskOwnerRoom(task, validate, "roomName");
}

module.exports = {
    canExecute,
    ensureAttackerSpawnTask,
    ensureClaimerSpawnTask,
    ensureMinerSpawnTask,
    ensureScoutSpawnTask,
    ensureUniversalSpawnTask,
    getOwnerRoom,
    run,
    validate,
};
