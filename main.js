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
        creep.memory.task = getTask(creep.memory.role);
    }
}
runSpawn = function (spawn) {
    let role = common.roles.SPAWNER;
    let task = spawn.memory.task;
    if (task) {
        runTask(task);
    } else {
        spawn.memory.task = getTask(role);
    }
}

runTask = function (task) {
    return;
}