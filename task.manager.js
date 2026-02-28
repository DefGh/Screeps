common = require('common');

module.exports = {

    roles: common.roles,

    taskTyeps: {
        SPAWN_CREEP: 'spawnCreep',
    },

    taskStatuse: {
        PENDING: 'pending',
        IN_PROGRESS: 'inProgress',
        DONE: 'done',
    },


    getTask: function (role) {
        console.log('Getting task for role:', role);
        
        if (!Game.memory) {
            console.log('Initializing Game.memory');
            Game.memory = {};
        }
        if (!Game.memory.tasks) {
            console.log('Initializing Game.memory.tasks');
            Game.memory.tasks = {};
        }

        this.generateTasks();
        
        // Return a simple task object for now
        let task = {
            type: 'idle',
            status: 'pending',
            data: { role: role }
        };
        console.log('Returning task:', task.type);
        return task;
    },
    generateTasks: function () {
        console.log('Generating tasks...');
        
        if (!Game.memory) {
            Game.memory = {};
        }
        if (!Game.memory.tasks) {
            Game.memory.tasks = {};
        }
        let tasks = Game.memory.tasks;
        console.log('Current number of tasks:', Object.keys(tasks).length);
        console.log('Current number of creeps:', Object.keys(Game.creeps).length);

        // if no creeps -> spawn creep task
        if (Object.keys(Game.creeps).length === 0) {
            console.log('No creeps found, checking for universal spawn task...');
            let hasUniversalTask = false;
            for (let taskId in tasks) {
                let task = tasks[taskId];
                if (task.type === this.taskTyeps.SPAWN_CREEP && task.data.role === this.roles.UNIVERSAL) {
                    console.log('Found existing universal spawn task:', taskId);
                    hasUniversalTask = true;
                    break;
                }
            }
            if (!hasUniversalTask) {
                console.log('No universal spawn task found, creating new one...');
                this.spawnCreepTask(this.roles.UNIVERSAL);
            }
        } else {
            console.log('Creeps exist, skipping spawn task generation');
        }

        



    },

    spawnCreepTask: function (role) {
        console.log('Creating spawn creep task for role:', role);
        let body = common.buildBody(role);
        console.log('Generated body parts:', body);

        let newTaskId = 'spawnCreep' + role + Game.time;
        console.log('New task ID:', newTaskId);
        
        let tasks = Game.memory.tasks;
        tasks[newTaskId] = this.baseTask(
            newTaskId, 
            this.taskTyeps.SPAWN_CREEP,
            {
                role: role,
                body: body,
            }, 
            [this.roles.SPAWNER], 
            true, 
            1
        );
        console.log('Spawn task created successfully');
    },

    baseTask: function (id, type, data, canExecute, repeatable, maxExecuters) {

        return {
            id: id,
            type: type,
            status: 'pending',
            canExecute: canExecute,
            repeatable: repeatable,
            maxExecuters: maxExecuters,
            data: data
        };
    }


}