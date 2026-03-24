const constants = require("./constants");
const taskIndex = require("./task.index");
const taskStore = require("./task.store");

function cleanupDeadCreeps() {
    for (const name in Memory.creeps) {
        if (Game.creeps[name]) {
            continue;
        }

        const creepMemory = Memory.creeps[name];

        if (creepMemory && typeof creepMemory.taskId === "string") {
            cleanupTaskOnCreepDeath(name, creepMemory.taskId);
        }

        delete Memory.creeps[name];
    }
}

function cleanupTaskOnCreepDeath(creepName, taskId) {
    const task = taskStore.getTask(taskId);

    if (!task) {
        return;
    }

    if (
        task.type === constants.taskTypes.TAXI ||
        task.type === constants.taskTypes.BOOTSTRAP_SPAWN
    ) {
        taskStore.requeueTask(taskId, {
            clearAssignments: true,
        });
        return;
    }

    if (task.type === constants.taskTypes.MINE) {
        cleanupTaxiTasksForMiner(creepName, task.data && task.data.sourceId);
    }

    taskStore.removeTask(taskId, {
        clearAssignments: true,
    });
}

function cleanupTaxiTasksForMiner(creepName, sourceId) {
    const removedTaskIds = [];

    for (const task of taskIndex.getTasksByType(constants.taskTypes.TAXI)) {
        if (
            task.data.minerName === creepName ||
            (
                typeof sourceId === "string" &&
                task.data.sourceId === sourceId
            )
        ) {
            removedTaskIds.push(task.id);
        }
    }

    if (removedTaskIds.length > 0) {
        taskStore.removeTasks(removedTaskIds, {
            clearAssignments: true,
        });
    }
}

module.exports = {
    cleanupDeadCreeps,
};
