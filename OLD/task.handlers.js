const constants = require("./constants");
const bootstrapSpawnTask = require("./task.bootstrapSpawn");
const buildTask = require("./task.build");
const claimRoomTask = require("./task.claimRoom");
const defendRoomTask = require("./task.defendRoom");
const mineTask = require("./task.mine");
const repairTask = require("./task.repair");
const renewTtlTask = require("./task.renewTtl");
const scoutRoomTask = require("./task.scoutRoom");
const spawnCreepTask = require("./task.spawnCreep");
const taxiTask = require("./task.taxi");
const transferEnergyTask = require("./task.transferEnergy");

const taskModulesByType = {
    [constants.taskTypes.MINE]: mineTask,
    [constants.taskTypes.SPAWN_CREEP]: spawnCreepTask,
    [constants.taskTypes.BOOTSTRAP_SPAWN]: bootstrapSpawnTask,
    [constants.taskTypes.TAXI]: taxiTask,
    [constants.taskTypes.BUILD]: buildTask,
    [constants.taskTypes.REPAIR]: repairTask,
    [constants.taskTypes.DEFEND_ROOM]: defendRoomTask,
    [constants.taskTypes.SCOUT_ROOM]: scoutRoomTask,
    [constants.taskTypes.CLAIM_ROOM]: claimRoomTask,
    [constants.taskTypes.TRANSFER_ENERGY]: transferEnergyTask,
    [constants.taskTypes.RENEW_TTL]: renewTtlTask,
};

function getTaskModule(task) {
    if (!task || typeof task.type !== "string") {
        return null;
    }

    return taskModulesByType[task.type] || null;
}

function executeTask(executor, task) {
    const taskStore = require("./task.store");

    if (!validateTask(task)) {
        if (task && task.id) {
            taskStore.removeTask(task.id, {
                clearAssignments: true,
            });
        }
        else {
            taskStore.clearTaskAssignment(executor);
        }
        return;
    }

    const taskModule = getTaskModule(task);

    if (typeof taskModule.run !== "function") {
        taskStore.removeTask(task.id, {
            clearAssignments: true,
        });
        return;
    }

    const isCompleted = taskModule.run(executor, task) === true;

    if (isCompleted) {
        taskStore.removeTask(task.id, {
            clearAssignments: true,
        });
    }
}

function canExecuteTask(executor, task) {
    const taskModule = getTaskModule(task);

    if (!validateTask(task) || !taskModule) {
        return false;
    }

    if (typeof taskModule.canExecute !== "function") {
        return true;
    }

    return taskModule.canExecute(executor, task) !== false;
}

function validateTask(task) {
    const taskModule = getTaskModule(task);

    if (
        !taskModule ||
        !task ||
        typeof task.id !== "string" ||
        typeof task.type !== "string" ||
        (
            task.status !== constants.taskStatuses.PENDING &&
            task.status !== constants.taskStatuses.IN_PROGRESS
        ) ||
        !Array.isArray(task.canExecute) ||
        task.canExecute.length === 0 ||
        !task.data ||
        typeof task.data !== "object" ||
        typeof taskModule.validate !== "function"
    ) {
        return false;
    }

    return taskModule.validate(task) !== false;
}

function getTaskOwnerRoom(task) {
    if (!validateTask(task)) {
        return null;
    }

    const taskModule = getTaskModule(task);

    if (typeof taskModule.getOwnerRoom !== "function") {
        return null;
    }

    const ownerRoom = taskModule.getOwnerRoom(task);
    return typeof ownerRoom === "string" ? ownerRoom : null;
}

module.exports = {
    canExecuteTask,
    executeTask,
    getTaskModule,
    getTaskOwnerRoom,
    validateTask,
};
