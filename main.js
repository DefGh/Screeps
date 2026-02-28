taskManager = require('task.manager');;
common = require('common');

module.exports.loop = function () {
    console.log('=== New Game Loop Started ===');

    console.log('Checking creeps...');
    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        console.log('Found creep:', name, 'Role:', creep.memory.role);
        runCreep(creep);
    }

    console.log('Checking spawns...');
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        console.log('Found spawn:', name);
        runSpawn(spawn);
    }    
}

runCreep = function (creep) {
    console.log('Processing creep:', creep.name);
    let task = creep.memory.task;
    if (task) {
        console.log('Creep', creep.name, 'has existing task:', task.type);
        runTask(task);
    } else {
        console.log('Creep', creep.name, 'has no task, getting new task...');
        let newTask = taskManager.getTask(creep.memory.role);
        if (newTask) {
            console.log('Assigned new task to', creep.name, ':', newTask.type);
            creep.memory.task = newTask;
        } else {
            console.log('No task available for', creep.name);
        }
    }
}
runSpawn = function (spawn) {
    console.log('Processing spawn:', spawn.name);
    let role = common.roles.SPAWNER;
    let task = spawn.memory.task;
    if (task) {
        console.log('Spawn', spawn.name, 'has existing task:', task.type);
        runTask(task);
    } else {
        console.log('Spawn', spawn.name, 'has no task, getting new task...');
        let newTask = taskManager.getTask(role);
        if (newTask) {
            console.log('Assigned new task to spawn', spawn.name, ':', newTask.type);
            spawn.memory.task = newTask;
        } else {
            console.log('No task available for spawn', spawn.name);
        }
    }
}

runTask = function (task) {
    console.log('Running task:', task.type, 'Status:', task.status);
    // Task execution logic would go here
    return;
}
