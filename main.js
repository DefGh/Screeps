taskManager = require('task.manager');;
common = require('common');

module.exports.loop = function () {

    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        runCreep(creep);
    }

    console.log('Checking spawns...');
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        runSpawn(spawn);
    }    
}

runCreep = function (creep) {
    let task = creep.memory.task;
    if (task) {
        creep.say('💼 Working: ' + task.type);
        let finished = runTask(creep, task);
        
        // If task is finished, clear memory and look for new task
        if (finished) {
            delete creep.memory.task;
            delete creep.memory.taskExecutionData;
            
            // Look for new task (could be the same repeatable task or higher priority)
            creep.say('❓ Seeking new task...');
            let newTask = taskManager.getTask(creep.memory.role);
            if (newTask) {
                creep.say('✅ New task: ' + newTask.type);
                creep.memory.task = newTask;
                // Mark task as in progress
                newTask.status = 'inProgress';
            } else {
                creep.say('💤 Idle');
            }
        }
    } else {
        creep.say('❓ Seeking task...');
        let newTask = taskManager.getTask(creep.memory.role);
        if (newTask) {
            creep.say('✅ Task: ' + newTask.type);
            creep.memory.task = newTask;
            // Mark task as in progress
            newTask.status = 'inProgress';
        } else {
            creep.say('💤 Idle');
        }
    }
}
runSpawn = function (spawn) {
    console.log('Processing spawn:', spawn.name);
    let role = common.roles.SPAWNER;
    let task = spawn.memory.task;
    if (task) {
        console.log('Spawn', spawn.name, 'has existing task:', task.type);
        runTask(spawn, task);
    } else {
        console.log('Spawn', spawn.name, 'has no task, searching for available tasks...');
        let newTask = taskManager.getTask(role);
        if (newTask) {
            console.log('Found available task for spawn', spawn.name, ':', newTask.type);
            spawn.memory.task = newTask;
            // Mark task as in progress
            newTask.status = 'inProgress';
        } else {
            console.log('No available tasks for spawn', spawn.name, '- spawn is idle');
        }
    }
}

runTask = function (executer, task) {
    console.log('Running task:', task.type, 'Status:', task.status);
    
    taskProcessor = require('task.' + task.type);
    let finished = taskProcessor.run(executer, task);

    // For non-repeatable tasks, clean up when finished
    if (finished) {
        delete executer.memory.task;
        delete executer.memory.taskExecutionData;
    }

    return finished;
}
