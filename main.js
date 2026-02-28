module.exports.taskManager = require('task.manager');;
module.exports.common = require('common');

module.exports.loop = function () {

    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        this.runCreep.run(creep);
    }

    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        this.runSpawn(spawn);
    }    
}

module.exports.runCreep = function (creep) {
    let task = creep.memory.task;
    if (task) {
        this.runTask(task);
    } else {
        creep.memory.task = this.getTask(creep.memory.role);
    }
}

module.exports.runSpawn = function (spawn) {
    let role = this.common.roles.SPAWNER;
    let task = spawn.memory.task;
    if (task) {
        this.runTask(task);
    } else {
        spawn.memory.task = this.getTask(role);
    }
}

