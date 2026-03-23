const constants = require("./constants");
const resourceManager = require("./resource.manager");
const sourceManager = require("./source.manager");

function run(spawn, task) {
    if (!isValidSpawnTask(task) || typeof spawn.spawnCreep !== "function") {
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

function ensureUniversalSpawnTask(spawn) {
    const targetUniversals = Memory.colony.targetUniversals;
    const aliveUniversals = countAliveUniversals();
    const queuedUniversals = countQueuedUniversals();

    if (aliveUniversals + queuedUniversals >= targetUniversals) {
        return;
    }

    const taskId = nextSpawnTaskId(constants.roles.UNIVERSAL);
    addTask({
        id: taskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildUniversalBody(spawn, shouldUseEmergencyUniversalBody(spawn)),
            memory: {
                role: constants.roles.UNIVERSAL,
            },
            role: constants.roles.UNIVERSAL,
            stage: constants.spawnTaskStages.WAITING,
        },
    });
}

function ensureClaimerSpawnTask(spawn) {
    const activeCandidate = Memory.expansion && Memory.expansion.activeCandidate;

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

    const taskId = nextSpawnTaskId(constants.roles.CLAIMER);
    addTask({
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
    const activeBranch = Memory.expansion && Memory.expansion.activeBranch;

    if (!activeBranch || activeBranch.originRoomName !== spawn.room.name) {
        return;
    }

    if (countAliveByRole(constants.roles.SCOUT) + countQueuedByRole(constants.roles.SCOUT) >= 1) {
        return;
    }

    const taskId = nextSpawnTaskId(constants.roles.SCOUT);
    addTask({
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
    const targetUniversals = Memory.colony.targetUniversals;
    const aliveUniversals = countAliveUniversals();

    if (aliveUniversals < targetUniversals) {
        return;
    }

    const roomName = spawn.room.name;
    const minerSources = sourceManager.getMinerSourcesForRoom(roomName);

    for (const sourceData of minerSources) {
        if (hasMineTaskForSource(sourceData.sourceId)) {
            continue;
        }

        createMinerTaskSet(spawn, sourceData.sourceId, sourceData.minerPos);
    }
}

function countAliveUniversals() {
    return countAliveByRole(constants.roles.UNIVERSAL);
}

function countAliveCreeps() {
    return Object.keys(Game.creeps).length;
}

function countQueuedUniversals() {
    return countQueuedByRole(constants.roles.UNIVERSAL);
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
    let count = 0;

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task) {
            continue;
        }

        if (task.type !== constants.taskTypes.SPAWN_CREEP) {
            continue;
        }

        if (!task.data || task.data.role !== role) {
            continue;
        }

        if (roomName && task.data.roomName && task.data.roomName !== roomName) {
            continue;
        }

        if (
            task.status === constants.taskStatuses.PENDING ||
            task.status === constants.taskStatuses.IN_PROGRESS
        ) {
            count += 1;
        }
    }

    return count;
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
    const mineTaskId = nextTaskId(constants.taskTypes.MINE);
    const taxiTaskId = nextTaskId(constants.taskTypes.TAXI);
    const spawnTaskId = nextSpawnTaskId(constants.roles.MINER);
    const creepName = buildPlannedCreepName(constants.roles.MINER, mineTaskId);

    addTask({
        id: mineTaskId,
        type: constants.taskTypes.MINE,
        status: constants.taskStatuses.IN_PROGRESS,
        canExecute: [constants.roles.MINER],
        data: {
            sourceId: sourceId,
        },
    });

    addTask({
        id: taxiTaskId,
        type: constants.taskTypes.TAXI,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: {
            minerName: creepName,
            sourceId: sourceId,
            minerPos: minerPos,
        },
    });

    addTask({
        id: spawnTaskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildMinerBody(spawn),
            creepName: creepName,
            memory: {
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

function nextTaskId(type) {
    Memory.taskSequence += 1;
    return type + ":" + Memory.taskSequence;
}

function nextSpawnTaskId(role) {
    Memory.taskSequence += 1;
    return "spawn:" + role + ":" + Memory.taskSequence;
}

function hasMineTaskForSource(sourceId) {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task || task.type !== constants.taskTypes.MINE || !task.data) {
            continue;
        }

        if (task.data.sourceId === sourceId) {
            return true;
        }
    }

    return false;
}

function cleanupLinkedTasks(task) {
    if (!task || !task.data) {
        return;
    }

    if (task.data.mineTaskId && Memory.tasks[task.data.mineTaskId]) {
        delete Memory.tasks[task.data.mineTaskId];
    }

    if (task.data.taxiTaskId && Memory.tasks[task.data.taxiTaskId]) {
        delete Memory.tasks[task.data.taxiTaskId];
    }
}

function addTask(task) {
    Memory.tasks[task.id] = task;
    //console.log(`task added ${task.id}`);
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
        typeof task.data.stage === "string"
    );
}

function canExecute(executor, task) {
    return (
        isValidSpawnTask(task) &&
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
        return true;
    }

    return Boolean(executor && executor.room && executor.room.name === task.data.roomName);
}

module.exports = {
    canExecute,
    ensureClaimerSpawnTask,
    ensureMinerSpawnTask,
    ensureScoutSpawnTask,
    ensureUniversalSpawnTask,
    run,
};
