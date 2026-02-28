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

        if (!Game.memory) {
            Game.memory = {};
        }
        if (!Game.memory.tasks) {
            Game.memory.tasks = {};
        }

        this.generateTasks();
        
        // Return a simple task object for now
        return {
            type: 'idle',
            status: 'pending',
            data: { role: role }
        };
    },
    generateTasks: function () {
        if (!Game.memory) {
            Game.memory = {};
        }
        if (!Game.memory.tasks) {
            Game.memory.tasks = {};
        }
        let tasks = Game.memory.tasks;

        // if no creeps -> spawn creep task

        if (Object.keys(Game.creeps).length === 0) {
            let hasUniversalTask = false;
            for (let taskId in tasks) {
                let task = tasks[taskId];
                if (task.type === this.taskTyeps.SPAWN_CREEP && task.data.role === this.roles.UNIVERSAL) {
                    hasUniversalTask = true;
                    break;
                }
            }
            if (!hasUniversalTask) {
                this.spawnCreepTask(this.roles.UNIVERSAL);
            }
        }

        



    },

    spawnCreepTask: function (role) {
        let body = common.buildBody(role);

        let newTaskId = 'spawnCreep' + role + Game.time;
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