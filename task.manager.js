common = require('common');

module.exorts = {

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

        let tasks = Game.memory.tasks;
        if (!tasks) {
            Game.memory.tasks = {};
        }

        this.generateTasks();


    },
    generateTasks: function () {
        let tasks = Game.memory.tasks;

        // if no creeps -> spawn creep task

        if (Game.creeps.length === 0) {
            if (tasks.any(task => task.type === this.taskTyeps.SPAWN_CREEP && task.data.role === this.roles.UNIVERSAL)) {
                return;
            }
            this.spawnCreepTask(this.roles.UNIVERSAL);
        }

        



    },

    spawnCreepTask: function (role) {
        let body = common.buildBody(role);

        newTaskId = 'spawnCreep' + role + Game.time;
        tasks = Game.memory.tasks;
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