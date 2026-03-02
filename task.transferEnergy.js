module.exports = {

    run: function (creep, task) {
        // Initialize task execution data if not exists
        if (!creep.memory.taskExecutionData) {
            creep.memory.taskExecutionData = {
                phase: 'findSource', // findSource, transferring, findDestination, delivering
                sourceId: null,
                destinationId: null,
                lastAction: null
            };
            creep.say('🔄 Init');
        }

        let state = creep.memory.taskExecutionData;

        switch (state.phase) {
            case 'findSource':
                this.findEnergySource(creep, state);
                break;
            case 'transferring':
                this.transferToCreep(creep, state);
                break;
            case 'findDestination':
                this.findEnergyDestination(creep, state);
                break;
            case 'delivering':
                let deliveryResult = this.deliverEnergy(creep, state);
                if (deliveryResult) {
                    return true; // Cycle completed, executer treats as finished
                }
                break;
        }

        // Transfer tasks continue until delivery cycle is complete
        return false; // Task continues within cycle
    },

    findEnergySource: function (creep, state) {
        creep.say('🔎 Finding source');

        // 1. Check for dropped energy on ground (highest priority)
        let droppedEnergy = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY
        });

        if (droppedEnergy) {
            creep.say('💎 Found dropped');
            state.sourceId = droppedEnergy.id;
            state.phase = 'transferring';
            state.lastAction = 'pickup';
            return;
        }

        // 2. Check for containers with energy
        let containers = creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_CONTAINER ||
                       structure.structureType === STRUCTURE_STORAGE) &&
                       structure.store[RESOURCE_ENERGY] > 0;
            }
        });

        if (containers) {
            creep.say('📦 Found container');
            state.sourceId = containers.id;
            state.phase = 'transferring';
            state.lastAction = 'withdraw';
            return;
        }

        // 3. Check for sources (mining)
        let sources = creep.pos.findClosestByRange(FIND_SOURCES, {
            filter: (source) => source.energy > 0
        });

        if (sources) {
            creep.say('⛏️ Found source');
            state.sourceId = sources.id;
            state.phase = 'transferring';
            state.lastAction = 'harvest';
            return;
        }

        creep.say('⏳ Waiting...');
        // Stay in findSource phase, will retry next tick
    },

    transferToCreep: function (creep, state) {
        let source = Game.getObjectById(state.sourceId);
        
        if (!source) {
            creep.say('❓ Source lost');
            state.phase = 'findSource';
            state.sourceId = null;
            // Clear destination when source is lost to start fresh
            state.destinationId = null;
            return;
        }

        // Move to source
        let moveResult = creep.moveTo(source, { 
            visualizePathStyle: { stroke: '#ffaa00' },
            reusePath: 5
        });
        
        if (moveResult !== OK) {
            creep.say('❌ Move fail');
            return;
        }

        // Check if we're at the source
        let distance = creep.pos.getRangeTo(source);
        
        if (distance <= 1) {
            let result;
            
            switch (state.lastAction) {
                case 'pickup':
                    result = creep.pickup(source);
                    break;
                case 'withdraw':
                    result = creep.withdraw(source, RESOURCE_ENERGY);
                    break;
                case 'harvest':
                    result = creep.harvest(source);
                    break;
            }

            if (result === OK) {
                // Check if creep is full or source is empty
                if (creep.store.getFreeCapacity() === 0 || 
                    (state.lastAction === 'pickup' && source.amount === 0) ||
                    (state.lastAction === 'withdraw' && source.store[RESOURCE_ENERGY] === 0) ||
                    (state.lastAction === 'harvest' && source.energy === 0)) {
                    
                    creep.say('🔋 Full/Empty');
                    state.phase = 'findDestination';
                    state.sourceId = null;
                } else {
                    creep.say('🔄 Collecting');
                }
            } else if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET) {
                creep.say('❌ Source empty');
                state.phase = 'findSource';
                state.sourceId = null;
            }
        } else {
            creep.say('🚶 Moving...');
        }
    },

    findEnergyDestination: function (creep, state) {
        creep.say('🎯 Finding dest');

        // Only proceed if creep has energy
        if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.say('🔋 Empty - going back to find source');
            state.phase = 'findSource';
            state.destinationId = null; // Clear destination when going back to source
            return;
        }

        // Try to find the best available destination
        let bestDestination = null;
        
        // 1. Check for spawns/extensions that need energy (highest priority)
        let spawns = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_SPAWN ||
                       structure.structureType === STRUCTURE_EXTENSION) &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        if (spawns) {
            bestDestination = spawns;
            creep.say('🏗️ Found spawn');
        } else {
            // 2. Check for storage that needs energy
            let storage = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                filter: (structure) => {
                    return structure.structureType === STRUCTURE_STORAGE &&
                           structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });

            if (storage) {
                bestDestination = storage;
                creep.say('📦 Found storage');
            } else {
                // 3. Check for controller that needs energy (upgrading)
                let controller = creep.room.controller;
                if (controller && controller.my && creep.pos.isNearTo(controller)) {
                    bestDestination = controller;
                    creep.say('👑 Found controller');
                }
            }
        }

        if (bestDestination) {
            state.destinationId = bestDestination.id;
            state.phase = 'delivering';
            return;
        }

        // 4. If no destination found but creep has energy, just complete the task
        // This prevents infinite loops when no valid destinations are available
        creep.say('⏳ No destination found - completing task');
        // Clear transfer state and complete the task
        this.clearTransferState(creep);
        return true; // Task completed, will be reassigned
    },

    deliverEnergy: function (creep, state) {
        // Safety check: if creep has no energy, go back to find source
        if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.say('🔋 No energy, finding source');
            state.phase = 'findSource';
            state.destinationId = null;
            return;
        }

        let destination = Game.getObjectById(state.destinationId);
        
        if (!destination) {
            creep.say('❓ Dest lost');
            state.phase = 'findDestination';
            state.destinationId = null;
            return;
        }

        // Move to destination
        let moveResult = creep.moveTo(destination, { 
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 25
        });
        
        if (moveResult !== OK) {
            creep.say('❌ Move fail');
            return;
        }

        // Check if we're at the destination
        let distance = creep.pos.getRangeTo(destination);
        
        if (distance <= 1) {
            let result;
            
            // Determine action based on destination type
            if (destination.structureType === STRUCTURE_SPAWN || 
                destination.structureType === STRUCTURE_EXTENSION ||
                destination.structureType === STRUCTURE_STORAGE) {
                result = creep.transfer(destination, RESOURCE_ENERGY);
            } else if (destination === creep.room.controller) {
                // Always try to upgrade controller if it's the destination
                result = creep.upgradeController(destination);
            } else {
                result = creep.transfer(destination, RESOURCE_ENERGY);
            }

            if (result === OK) {
                // Check if creep is empty or destination is full
                if (creep.store[RESOURCE_ENERGY] === 0 || 
                    destination.store && destination.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    
                    creep.say('✅ Delivered');
                    // Clear transfer state after task completion
                    this.clearTransferState(creep);
                    return true; // Task completed, will be reassigned
                } else {
                    creep.say('🔄 Delivering');
                    // If still delivering, continue the cycle
                    return false;
                }
            } else if (result === ERR_FULL || result === ERR_INVALID_TARGET) {
                creep.say('❌ Dest full - switching to controller');
                // Instead of going back to findDestination, directly switch to controller
                let controller = creep.room.controller;
                if (controller && controller.my && creep.pos.isNearTo(controller)) {
                    creep.say('👑 Switching to controller');
                    state.destinationId = controller.id;
                    // Try again with controller
                    return this.deliverEnergy(creep, state);
                } else {
                    // No controller available, complete the task
                    creep.say('⏳ No controller available - completing task');
                    this.clearTransferState(creep);
                    return true; // Task completed, will be reassigned
                }
            }
        } else {
            creep.say('🚶 Moving...');
            return false;
        }
    },

    clearTransferState: function (creep) {
        // Clear all transfer-related memory
        if (creep.memory.taskExecutionData) {
            delete creep.memory.taskExecutionData;
            creep.say('🧹 Cleared');
        }
    }
};
