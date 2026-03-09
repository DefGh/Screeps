const resourceManager = require('resource.manager');

module.exports = {
    run: function (creep, task) {
        // Initialize task execution data if not exists
        if (!creep.memory.taskExecutionData) {
            creep.memory.taskExecutionData = {
                phase: 'getEnergy', // findSource, transferring, findDestination, delivering
                sourceId: null,
                destinationId: null,
                lastAction: null
            };
            creep.say('🔄 Init');
        }
        let state = creep.memory.taskExecutionData;
        switch (state.phase) {
            case 'done':
                return true;
            case 'getEnergy':
                if (creep.getEnergy(creep)){
                    creep.memory.taskExecutionData.phase = 'delivering';
                }
                break;
            case 'delivering':
                if (creep.deliverEnergy(creep)){
                    creep.memory.taskExecutionData.phase = 'done';
                }
                break;
        }
        // Transfer tasks continue until delivery cycle is complete
        return false; // Task continues within cycle
    },
    
};
