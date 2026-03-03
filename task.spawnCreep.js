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
            case ERR_INVALID_ARGS:
            case ERR_NAME_EXISTS:        
                taskFinished = true;
                break;
            default:
               taskFinished = false;
        }

        return taskFinished;
    },

    generateCreepName: function (role) {
        return role.toUpperCase() + '_' + Game.time;
    },
};