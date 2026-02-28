module.exports = {

    run: function (creep, task) {
        console.log('=== Transfer Energy Task Processor ===');
        console.log('Creep:', creep.name, 'Task:', task.id);

        // Initialize creep memory for transfer state if not exists
        if (!creep.memory.transferState) {
            creep.memory.transferState = {
                phase: 'findSource', // findSource, transferring, findDestination, delivering
                sourceId: null,
                destinationId: null,
                lastAction: null
            };
            console.log('Initialized transfer state for', creep.name);
        }

        let state = creep.memory.transferState;
        console.log('Current phase:', state.phase, 'Source:', state.sourceId, 'Destination:', state.destinationId);

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
                this.deliverEnergy(creep, state);
                break;
        }
    },

    findEnergySource: function (creep, state) {
        console.log('Finding energy source for', creep.name);

        // 1. Check for dropped energy on ground (highest priority)
        let droppedEnergy = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY
        });

        if (droppedEnergy) {
            console.log('Found dropped energy at', droppedEnergy.pos);
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
            console.log('Found container with energy at', containers.pos);
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
            console.log('Found energy source at', sources.pos);
            state.sourceId = sources.id;
            state.phase = 'transferring';
            state.lastAction = 'harvest';
            return;
        }

        console.log('No energy source found, waiting...');
        // Stay in findSource phase, will retry next tick
    },

    transferToCreep: function (creep, state) {
        let source = Game.getObjectById(state.sourceId);
        
        if (!source) {
            console.log('Source no longer exists, returning to findSource');
            state.phase = 'findSource';
            state.sourceId = null;
            return;
        }

        // Move to source
        let moveResult = creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
        
        if (moveResult !== OK) {
            console.log('Move failed:', moveResult);
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

            console.log('Transfer action result:', result);

            if (result === OK) {
                // Check if creep is full or source is empty
                if (creep.store.getFreeCapacity() === 0 || 
                    (state.lastAction === 'pickup' && source.amount === 0) ||
                    (state.lastAction === 'withdraw' && source.store[RESOURCE_ENERGY] === 0) ||
                    (state.lastAction === 'harvest' && source.energy === 0)) {
                    
                    console.log('Source depleted or creep full, finding destination');
                    state.phase = 'findDestination';
                    state.sourceId = null;
                }
                // Continue transferring if not full and source has energy
            } else if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_INVALID_TARGET) {
                console.log('Source depleted, finding new source');
                state.phase = 'findSource';
                state.sourceId = null;
            }
        }
    },

    findEnergyDestination: function (creep, state) {
        console.log('Finding energy destination for', creep.name);

        // Only proceed if creep has energy
        if (creep.store[RESOURCE_ENERGY] === 0) {
            console.log('Creep has no energy, returning to findSource');
            state.phase = 'findSource';
            return;
        }

        // 1. Check for spawns/extensions that need energy (highest priority)
        let spawns = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return (structure.structureType === STRUCTURE_SPAWN ||
                       structure.structureType === STRUCTURE_EXTENSION) &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        if (spawns) {
            console.log('Found spawn/extension needing energy at', spawns.pos);
            state.destinationId = spawns.id;
            state.phase = 'delivering';
            return;
        }

        // 2. Check for storage that needs energy
        let storage = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_STORAGE &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        if (storage) {
            console.log('Found storage needing energy at', storage.pos);
            state.destinationId = storage.id;
            state.phase = 'delivering';
            return;
        }

        // 3. Check for controller that needs energy (upgrading)
        let controller = creep.room.controller;
        if (controller && controller.my && creep.pos.isNearTo(controller)) {
            console.log('Found controller to upgrade');
            state.destinationId = controller.id;
            state.phase = 'delivering';
            return;
        }

        console.log('No destination found, waiting...');
        // Stay in findDestination phase, will retry next tick
    },

    deliverEnergy: function (creep, state) {
        let destination = Game.getObjectById(state.destinationId);
        
        if (!destination) {
            console.log('Destination no longer exists, returning to findDestination');
            state.phase = 'findDestination';
            state.destinationId = null;
            return;
        }

        // Move to destination
        let moveResult = creep.moveTo(destination, { visualizePathStyle: { stroke: '#ffffff' } });
        
        if (moveResult !== OK) {
            console.log('Move failed:', moveResult);
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
                result = creep.upgradeController(destination);
            } else {
                result = creep.transfer(destination, RESOURCE_ENERGY);
            }

            console.log('Delivery action result:', result);

            if (result === OK) {
                // Check if creep is empty or destination is full
                if (creep.store[RESOURCE_ENERGY] === 0 || 
                    destination.store && destination.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                    
                    console.log('Delivery complete, returning to findSource');
                    state.phase = 'findSource';
                    state.destinationId = null;
                }
                // Continue delivering if creep has energy and destination can accept more
            } else if (result === ERR_FULL || result === ERR_INVALID_TARGET) {
                console.log('Destination full or invalid, finding new destination');
                state.phase = 'findDestination';
                state.destinationId = null;
            }
        }
    }
};