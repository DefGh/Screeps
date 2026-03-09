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
                if (creep.getEnergy()){
                    creep.memory.taskExecutionData.phase = 'delivering';
                }
                break;
            case 'delivering':
                var target = getTarget(creep)
                if (creep.deliverEnergy(target)){
                    creep.memory.taskExecutionData.phase = 'done';
                }
                break;
        }
        // Transfer tasks continue until delivery cycle is complete
        return false; // Task continues within cycle
    },

    getTarget(creep) {
        // spwan -> extention -> controller
        var spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        // if not full
        if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
            return spawn;

        var extension = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });

        if (extension.length > 0)
            return extension[0];

        return creep.room.controller;
    }
    
};
