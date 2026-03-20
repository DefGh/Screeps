const constants = require("./constants");
const resourceManager = require("./resource.manager");
const mineTask = require("./task.mine");
const spawnCreepTask = require("./task.spawnCreep");
const taxiTask = require("./task.taxi");
const transferEnergyTask = require("./task.transferEnergy");

const taskModulesByType = {
    [constants.taskTypes.MINE]: mineTask,
    [constants.taskTypes.SPAWN_CREEP]: spawnCreepTask,
    [constants.taskTypes.TAXI]: taxiTask,
    [constants.taskTypes.TRANSFER_ENERGY]: transferEnergyTask,
};

function executeTask(executor, task) {
    const taskModule = taskModulesByType[task && task.type];

    if (!taskModule || typeof taskModule.run !== "function") {
        discardTask(executor, task && task.id);
        return;
    }

    const isCompleted = taskModule.run(executor, task) === true;

    if (isCompleted) {
        discardTask(executor, task && task.id);
    }
}

function canExecuteTask(executor, task) {
    const taskModule = taskModulesByType[task && task.type];

    if (!taskModule) {
        return false;
    }

    if (typeof taskModule.canExecute !== "function") {
        return true;
    }

    return taskModule.canExecute(executor, task) !== false;
}

function discardTask(executor, taskId) {
    if (taskId && Memory.tasks[taskId]) {
        delete Memory.tasks[taskId];
        resourceManager.invalidateResourcePlanCache();
    }

    delete executor.memory.taskId;
}

module.exports = {
    canExecuteTask,
    executeTask,
};
