taskManager = require('task.manager');;
common = require('common');

module.exports.loop = function () {

    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        runCreep(creep);
    }

    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        runSpawn(spawn);
    }    
}

runCreep = function (creep) {
    let task = creep.memory.task;
    if (task) {
        runTask(task);
    } else {
        let newTask = taskManager.getTask(creep.memory.role);
        if (newTask) {
            creep.memory.task = newTask;
        }
    }
}
runSpawn = function (spawn) {
    let role = common.roles.SPAWNER;
    let task = spawn.memory.task;
    if (task) {
        runTask(task);
    } else {
        let newTask = taskManager.getTask(role);
        if (newTask) {
            spawn.memory.task = newTask;
        }
    }
}

runTask = function (task) {
    return;
}