const constants = require("constants");

module.exports = {

    run: function (executer, task) {
        let taskFinished = false;

        // Validate task data
        if (!task.data || !task.data.role || !task.data.body) {
            this.completeTask(task, false, 'Invalid task data');
            return true; // Task is finished (failed)
        }

        // Check if executer is a spawn
        if (!executer || !executer.spawnCreep) {
            this.completeTask(task, false, 'Invalid executer type');
            return true; // Task is finished (failed)
        }

        // Check if spawn is currently busy
        if (executer.spawning) {
            return false; // Task remains in progress, will retry next tick
        }

        // Convert body part strings to constants
        let bodyParts = task.data.body;

        var memory = task.data.role;
        delete memory.body;

        // Attempt to spawn the creep
        let spawnResult = executer.spawnCreep(
            bodyParts,
            this.generateCreepName(task.data.role),
            {
                memory: memory
            }
        );

        switch (spawnResult) {
            case OK:
                this.completeTask(task, true, 'Creep spawned: ' + this.generateCreepName(task.data.role));
                taskFinished = true;
                break;
            
            case ERR_BUSY:
                // Don't complete task, let it retry
                taskFinished = false;
                break;
            
            case ERR_INVALID_ARGS:
                this.completeTask(task, false, 'Invalid spawn arguments');
                taskFinished = true;
                break;
            
            case ERR_NAME_EXISTS:
                // Generate alternative name and retry
                let alternativeName = this.generateCreepName(task.data.role) + '_' + Game.time;
                let retryResult = executer.spawnCreep(
                    bodyParts,
                    alternativeName,
                    { memory: { role: task.data.role } }
                );
                
                if (retryResult === OK) {
                    this.completeTask(task, true, 'Creep spawned: ' + alternativeName);
                    taskFinished = true;
                } else {
                    this.completeTask(task, false, 'Spawn failed with alternative name');
                    taskFinished = true;
                }
                break;
            
            case ERR_NOT_ENOUGH_ENERGY:
                this.completeTask(task, false, 'Energy insufficient at spawn time');
                taskFinished = false;
                break;
            
            default:
                this.completeTask(task, false, 'Spawn error: ' + spawnResult);
                taskFinished = true;
        }

        return taskFinished;
    },

    generateCreepName: function (role) {
        return role.toUpperCase() + '_' + Game.time;
    },

    completeTask: function (task, success, message) {
        task.status = success ? constants.taskStatuses.DONE : constants.taskStatuses.IN_PROGRESS;
        task.completedAt = Game.time;
        task.result = {
            success: success,
            message: message
        };
        
        // Clean up task memory if it's not repeatable
        if (!task.repeatable) {
            delete Memory.tasks[task.id];
        }
    }
};