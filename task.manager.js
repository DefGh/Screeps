constants = require('constants');

module.exports = {
    roles: constants.roles,
    taskTypes: constants.taskTypes,
    taskPriorities: constants.taskPriorities,
    taskStatuses: constants.taskStatuses,

    getTask: function (role) {
        if (!Memory.tasks) {
            //console.log('Initializing Memory.tasks');
            Memory.tasks = {};
        }

        this.generateTasks();
        
        // Search for existing tasks that match this role, sorted by priority
        let tasks = Memory.tasks;
        let availableTasks = [];
        
        // Collect all available tasks for this role
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.canExecute && task.canExecute.includes(role) && task.status === 'pending') {
                availableTasks.push(task);
            }
        }
        
        // Sort by priority (highest first)
        availableTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        // Return the highest priority task
        if (availableTasks.length > 0) {
            let selectedTask = availableTasks[0];
            //console.log('Task assigned to role:', role, 'Type:', selectedTask.type, 'Priority:', selectedTask.priority);
            return selectedTask;
        }
        
        return null;
    },
    generateTasks: function () {
        //console.log('Generating tasks...');
        
        if (!Memory) {
            Memory = {};
        }
        if (!Memory.tasks) {
            Memory.tasks = {};
        }
        let tasks = Memory.tasks;
        //console.log('Current number of tasks:', Object.keys(tasks).length);
        //console.log('Current number of creeps:', Object.keys(Game.creeps).length);

        // if no creeps -> spawn creep task
        if (Object.keys(Game.creeps).length === 0) {
            //console.log('No creeps found, checking for universal spawn task...');
            let hasUniversalTask = false;
            for (let taskId in tasks) {
                let task = tasks[taskId];
                if (task.type === this.taskTypes.SPAWN_CREEP && task.data.role === this.roles.UNIVERSAL) {
                    //console.log('Found existing universal spawn task:', taskId);
                    hasUniversalTask = true;
                    break;
                }
            }
            if (!hasUniversalTask) {
                //console.log('No universal spawn task found, creating new one...');
                this.spawnCreepTask(this.roles.UNIVERSAL);
            }
        } else {
            //console.log('Creeps exist, skipping spawn task generation');
        }

        // Always generate transfer energy task (low priority, repeatable)
        this.generateTransferEnergyTask();

        // Add miner spawn task if needed
        this.checkAndAddMinerTask();

    },

    generateTransferEnergyTask: function () {
        //console.log('Generating transfer energy task...');
        
        let tasks = Memory.tasks;
        let hasTransferTask = false;
        
        // Check if transfer energy task already exists
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === this.taskTypes.TRANSFER_ENERGY) {
                //console.log('Transfer energy task already exists:', taskId);
                hasTransferTask = true;
                break;
            }
        }
        
        if (!hasTransferTask) {
            //console.log('Creating new transfer energy task...');
            let newTaskId = 'transferEnergy' + Game.time;
            
            tasks[newTaskId] = this.baseTask(
                newTaskId,
                this.taskTypes.TRANSFER_ENERGY,
                {
                    // No specific data needed - creeps will find sources/destinations dynamically
                },
                [this.roles.UNIVERSAL], // Universal role can handle transfer tasks
                true, // Repeatable - always available
                999 // Many creeps can do this simultaneously
            );
            
            //console.log('Transfer energy task created successfully');
        }
    },

    spawnCreepTask: function (role) {
        //console.log('Creating spawn creep task for role:', role);
        let body = common.buildBody(role);
        //console.log('Generated body parts:', body);

        let newTaskId = 'spawnCreep' + role + Game.time;
        //console.log('New task ID:', newTaskId);
        
        let tasks = Memory.tasks;
        tasks[newTaskId] = this.baseTask(
            newTaskId, 
            this.taskTypes.SPAWN_CREEP,
            {
                role: role,
                body: body,
            }, 
            [this.roles.SPAWNER], 
            false, 
            1
        );
        //console.log('Spawn task created successfully');
    },

    baseTask: function (id, type, data, canExecute, repeatable, maxExecuters) {

        return {
            id: id,
            type: type,
            status: 'pending',
            canExecute: canExecute,
            repeatable: repeatable,
            maxExecuters: maxExecuters,
            priority: this.taskPriorities[type] || 5, // Default priority if not defined
            data: data
        };
    },

    checkAndAddMinerTask: function () {
        // Check if we need a miner creep (up to 5 work parts)
        let miners = _.filter(Game.creeps, creep => creep.memory.role === this.roles.MINER);
        let maxMiners = 2; // Limit to 2 miners for now
        
        if (miners.length < maxMiners) {
            //console.log('Creating miner spawn task...');
            this.spawnMinerTask();
        }
    },

    spawnMinerTask: function () {
        let newTaskId = 'spawnMiner' + Game.time;
        let tasks = Memory.tasks;
        
        tasks[newTaskId] = this.baseTask(
            newTaskId, 
            this.taskTypes.SPAWN_CREEP,
            {
                role: this.roles.MINER,
                body: this.buildMinerBody(), // Custom miner body with work parts
            }, 
            [this.roles.SPAWNER], 
            false, 
            1
        );
        //console.log('Miner spawn task created successfully');
    },

    buildMinerBody: function () {
        // Create a miner with up to 5 work parts 
        let workParts = Math.min(5, Math.floor(Game.spawns['Spawn1'].room.energyCapacityAvailable / 200));
        let body = [];
        
        for (let i = 0; i < workParts; i++) {
            body.push(WORK);
        }
        
        return body;
    }


}