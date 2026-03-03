const constants = require("constants");

module.exports = {

    run: function (executer, task) {
        // Check if spawn is currently busy
        if (executer.spawning) {
            return false; // Task remains in progress, will retry next tick
        }

        // Convert body part strings to constants
        let bodyParts = task.data.body;

        // Create a copy of task.data for memory to avoid modifying the original task
        var memory = Object.assign({}, task.data);
        delete memory.body;

        // Attempt to spawn the creep
        let spawnResult = executer.spawnCreep(
            bodyParts,
            task.data.role.toUpperCase() + '_' + Game.time,
            {
                memory: memory
            }
        );

        return spawnResult == OK;
    },

};