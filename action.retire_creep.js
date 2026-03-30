const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    return creep.suicide() === OK;
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
