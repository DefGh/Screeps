const constants = require("constants");

module.exports = {

    run: function (executer, task) {
        // Check if spawn is currently busy
        if (executer.spawning) {
            return false; // Task remains in progress, will retry next tick
        }

        // Convert body part strings to constants
        let bodyParts = task.data.body;
        
        console.log('DEBUG: task.spawnCreep.run called');
        console.log('DEBUG: task.data.body length:', bodyParts ? bodyParts.length : 'undefined/null');
        console.log('DEBUG: task.data.body:', bodyParts);
        console.log('DEBUG: task.data.role:', task.data.role);

        var memory = task.data;
        delete memory.body;

        // Attempt to spawn the creep
        let spawnResult = executer.spawnCreep(
            bodyParts,
            task.data.role.toUpperCase() + '_' + Game.time,
            {
                memory: memory
            }
        );

        console.log('DEBUG: spawnCreep result:', spawnResult);
        console.log('DEBUG: spawnCreep result constant:', spawnResult === OK ? 'OK' : 'NOT OK');

        return spawnResult == OK;
    },

};