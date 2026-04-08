const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const target = Game.getObjectById(action.data.targetId);

    if (!target) {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }

        return true;
    }

    if (creep.pos.isNearTo(target)) {
        creep.heal(target);
        return true;
    }

    if (creep.pos.inRangeTo(target, 3)) {
        creep.rangedHeal(target);
    }
    else if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }

    creep.moveTo(target);
    return false;
}

function onCompleted() {
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
