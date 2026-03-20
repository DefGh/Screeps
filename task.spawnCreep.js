const constants = require("./constants");

function run(spawn, task) {
    if (!isValidSpawnTask(task) || typeof spawn.spawnCreep !== "function") {
        return true;
    }

    const creepName = buildCreepName(task);
    const spawnMemory = Object.assign({}, task.data.memory, { role: task.data.role });
    const result = spawn.spawnCreep(task.data.body, creepName, {
        memory: spawnMemory,
    });

    if (result === OK) {
        return true;
    }

    if (result === ERR_BUSY || result === ERR_NOT_ENOUGH_ENERGY || result === ERR_NAME_EXISTS) {
        return false;
    }

    return true;
}

function ensureUniversalSpawnTask(spawn) {
    const targetUniversals = Memory.colony.targetUniversals;
    const aliveUniversals = countAliveUniversals();
    const queuedUniversals = countQueuedUniversals();

    if (aliveUniversals + queuedUniversals >= targetUniversals) {
        return;
    }

    const taskId = nextTaskId(constants.taskTypes.SPAWN_CREEP);
    Memory.tasks[taskId] = {
        id: taskId,
        type: constants.taskTypes.SPAWN_CREEP,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.SPAWNER],
        data: {
            body: buildUniversalBody(spawn),
            memory: {
                role: constants.roles.UNIVERSAL,
            },
            role: constants.roles.UNIVERSAL,
            stage: constants.spawnTaskStages.WAITING,
        },
    };
}

function countAliveUniversals() {
    let count = 0;

    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (creep.memory && creep.memory.role === constants.roles.UNIVERSAL) {
            count += 1;
        }
    }

    return count;
}

function countQueuedUniversals() {
    let count = 0;

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task) {
            continue;
        }

        if (task.type !== constants.taskTypes.SPAWN_CREEP) {
            continue;
        }

        if (!task.data || task.data.role !== constants.roles.UNIVERSAL) {
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

function buildUniversalBody(spawn) {
    const partSet = [WORK, CARRY, MOVE];
    const minimumCost = BODYPART_COST[WORK];
    const capacity = spawn.room && typeof spawn.room.energyCapacityAvailable === "number"
        ? spawn.room.energyCapacityAvailable
        : minimumCost;

    if (capacity < minimumCost) {
        return [WORK];
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

function buildCreepName(task) {
    return task.data.role + "_" + Game.time;
}

function nextTaskId(type) {
    Memory.taskSequence += 1;
    return type + ":" + Memory.taskSequence;
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

module.exports = {
    ensureUniversalSpawnTask,
    run,
};
