const constants = require("./constants");
const resourceManager = require("./resource.manager");

function cleanupLegacyTransferTasks() {
    const removedTaskIds = {};

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!isLegacyContainerTransferTask(task)) {
            continue;
        }

        removedTaskIds[taskId] = true;
        delete Memory.tasks[taskId];
    }

    if (Object.keys(removedTaskIds).length === 0) {
        return;
    }

    cleanupExecutorTaskAssignments(removedTaskIds);
    resourceManager.invalidateResourcePlanCache();
}

function cleanupDeadCreeps() {
    for (const name in Memory.creeps) {
        if (Game.creeps[name]) {
            continue;
        }

        const creepMemory = Memory.creeps[name];

        if (creepMemory && creepMemory.taskId && Memory.tasks[creepMemory.taskId]) {
            cleanupTaskOnCreepDeath(name, creepMemory.taskId);
        }

        delete Memory.creeps[name];
    }
}

function cleanupTaskOnCreepDeath(creepName, taskId) {
    const task = Memory.tasks[taskId];

    if (!task) {
        return;
    }

    if (task.type === constants.taskTypes.TAXI) {
        task.status = constants.taskStatuses.PENDING;
        return;
    }

    if (task.type === constants.taskTypes.MINE) {
        cleanupTaxiTasksForMiner(creepName, task.data && task.data.sourceId);
    }

    delete Memory.tasks[taskId];
}

function cleanupTaxiTasksForMiner(creepName, sourceId) {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!task || task.type !== constants.taskTypes.TAXI || !task.data) {
            continue;
        }

        if (task.data.minerName === creepName || task.data.sourceId === sourceId) {
            delete Memory.tasks[taskId];
        }
    }
}

function cleanupExecutorTaskAssignments(removedTaskIds) {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];

        if (creep && creep.memory && removedTaskIds[creep.memory.taskId]) {
            delete creep.memory.taskId;
        }
    }
}

function isLegacyContainerTransferTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.TRANSFER_ENERGY &&
        task.data &&
        task.data.targetType === constants.transferEnergyTargetTypes.CONTAINER
    );
}

module.exports = {
    cleanupLegacyTransferTasks,
    cleanupDeadCreeps,
};
