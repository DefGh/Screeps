const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const target = Game.getObjectById(action.data.targetId);

    if (!target) {
        return true;
    }

    const result = creep.attack(target);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return false;
    }

    return (
        result === OK ||
        result === ERR_INVALID_TARGET ||
        result === ERR_NO_BODYPART ||
        result === ERR_NOT_OWNER ||
        result === ERR_BUSY
    );
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
