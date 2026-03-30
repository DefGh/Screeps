const constants = require("./constants");
const debug = require("./debug");
const tasks = require("./tasks");
const renewUniversal = require("./renew.universal");

function execute(spawn, action) {
    const task = tasks.getTask(action.taskId);

    if (!task || task.type !== constants.taskTypes.RENEW_UNIVERSAL) {
        return true;
    }

    const creep = Game.creeps[action.data.targetCreepName || task.data.targetCreepName];

    if (
        !creep ||
        !renewUniversal.isUniversalOfRoom(creep, task.room) ||
        !renewUniversal.isGenerationCurrent(creep, task.room) ||
        renewUniversal.isComplete(creep, task.data.renewUntil)
    ) {
        return true;
    }

    const result = spawn.renewCreep(creep);

    if (
        result !== OK &&
        result !== ERR_BUSY &&
        result !== ERR_NOT_ENOUGH_ENERGY &&
        result !== ERR_NOT_IN_RANGE &&
        result !== ERR_INVALID_TARGET &&
        (
            typeof ERR_FULL === "undefined" ||
            result !== ERR_FULL
        )
    ) {
        debug.log(`[runner] spawn ${spawn.name} failed ${action.type} with ${result}`);
    }

    return true;
}

function onCompleted(action) {
    const task = tasks.getTask(action.taskId);
    const creep = task ? Game.creeps[task.data.targetCreepName] : null;

    if (!task) {
        return;
    }

    if (renewUniversal.isComplete(creep, task.data.renewUntil)) {
        task.donePercent = 100;
        task.assignedPercent = 100;
        return;
    }

    task.donePercent = renewUniversal.getProgressPercent(creep, task.data.renewUntil);
    task.assignedPercent = task.donePercent;
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
