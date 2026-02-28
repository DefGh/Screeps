common = require('common');

module.exports = {

    roles: common.roles,

    taskTyeps: {
        SPAWN_CREEP: 'spawnCreep',
        TRANSFER_ENERGY: 'transferEnergy',
    },

    taskStatuse: {
        PENDING: 'pending',
        IN_PROGRESS: 'inProgress',
        DONE: 'done',
    },


    getTask: function (role) {
        console.log('Getting task for role:', role);
        
        if (!Memory.tasks) {
            console.log('Initializing Memory.tasks');
            Memory.tasks = {};
        }

        this.generateTasks();
        
        // Search for existing tasks that match this role
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            console.log('Checking task:', taskId, 'Type:', task.type, 'Data:', task.data);
            
            // Look for tasks that can be executed by this role
            if (task.canExecute && task.canExecute.includes(role) && task.status === 'pending') {
                console.log('Found matching task:', taskId, 'Type:', task.type);
                return task;
            }
        }
        
        console.log('No matching task found for role:', role);
        return null;
    },
    generateTasks: function () {
        console.log('Generating tasks...');
        
        if (!Memory) {
            Memory = {};
        }
        if (!Memory.tasks) {
            Memory.tasks = {};
        }
        let tasks = Memory.tasks;
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

        // Always generate transfer energy task (low priority, repeatable)
        this.generateTransferEnergyTask();

    },

    generateTransferEnergyTask: function () {
        console.log('Generating transfer energy task...');
        
        let tasks = Memory.tasks;
        let hasTransferTask = false;
        
        // Check if transfer energy task already exists
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === this.taskTyeps.TRANSFER_ENERGY) {
                console.log('Transfer energy task already exists:', taskId);
                hasTransferTask = true;
                break;
            }
        }
        
        if (!hasTransferTask) {
            console.log('Creating new transfer energy task...');
            let newTaskId = 'transferEnergy' + Game.time;
            
            tasks[newTaskId] = this.baseTask(
                newTaskId,
                this.taskTyeps.TRANSFER_ENERGY,
                {
                    // No specific data needed - creeps will find sources/destinations dynamically
                },
                [this.roles.UNIVERSAL], // Universal role can handle transfer tasks
                true, // Repeatable - always available
                999 // Many creeps can do this simultaneously
            );
            
            console.log('Transfer energy task created successfully');
        }
    },

    spawnCreepTask: function (role) {
        console.log('Creating spawn creep task for role:', role);
        let body = common.buildBody(role);
        console.log('Generated body parts:', body);

        let newTaskId = 'spawnCreep' + role + Game.time;
        console.log('New task ID:', newTaskId);
        
        let tasks = Memory.tasks;
        tasks[newTaskId] = this.baseTask(
            newTaskId, 
            this.taskTyeps.SPAWN_CREEP,
            {
                role: role,
                body: body,
            }, 
            [this.roles.SPAWNER], 
            false, 
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