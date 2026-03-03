const constants = require("constants");

module.exports = {

    run: function (executer, task) {
        let taskFinished = false;

        // Validate task data
        if (!task.data || !task.data.role || !task.data.body) {
            return true; // Task is finished (failed)
        }

        // Check if executer is a spawn
        if (!executer || !executer.spawnCreep) {
            return true; // Task is finished (failed)
        }

        // Check if spawn is currently busy
        if (executer.spawning) {
            return false; // Task remains in progress, will retry next tick
        }

        // Convert body part strings to constants
        let bodyParts = task.data.body;

        var memory = task.data;
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
                taskFinished = true;
                break;
            
            case ERR_BUSY:
                // Don't complete task, let it retry
                taskFinished = false;
                break;
            
            case ERR_INVALID_ARGS:
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
                taskFinished = true;
                break;
            case ERR_NOT_ENOUGH_ENERGY:
                taskFinished = false;
                break;
            default:
               taskFinished = true;
        }

        return taskFinished;
    },

    generateCreepName: function (role) {
        return role.toUpperCase() + '_' + Game.time;
    },
};