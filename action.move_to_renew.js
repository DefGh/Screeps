const tasks = require("./tasks");
const constants = require("./constants");
const renewUniversal = require("./renew.universal");

function execute(creep, action) {
    const task = tasks.getTask(action.taskId);

    if (!task || task.type !== constants.taskTypes.RENEW_UNIVERSAL) {
        return true;
    }

    if (
        creep.name !== task.data.targetCreepName ||
        !renewUniversal.isUniversalOfRoom(creep, task.room) ||
        !renewUniversal.isGenerationCurrent(creep, task.room) ||
        renewUniversal.isComplete(creep, task.data.renewUntil)
    ) {
        return true;
    }

    const spawn = Game.spawns[action.data.spawnName || task.data.spawnName];

    if (!spawn || spawn.room.name !== task.room) {
        return true;
    }

    if (!creep.pos.inRangeTo(spawn, 1)) {
        creep.moveTo(spawn, {
            range: 1,
        });
    }

    return false;
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
