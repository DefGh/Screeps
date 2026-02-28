module.exports = {

    run: function (executer, task) {
        console.log('=== Spawn Creep Task Processor ===');
        console.log('Executer:', executer.name, 'Type:', executer.constructor.name);
        console.log('Task ID:', task.id, 'Status:', task.status);
        console.log('Task Data:', JSON.stringify(task.data));

        // Validate task data
        if (!task.data || !task.data.role || !task.data.body) {
            console.log('ERROR: Invalid task data - missing role or body');
            this.completeTask(task, false, 'Invalid task data');
            return;
        }

        // Check if executer is a spawn
        if (!executer || !executer.spawnCreep) {
            console.log('ERROR: Executer is not a spawn structure');
            this.completeTask(task, false, 'Invalid executer type');
            return;
        }

        // Check if spawn is currently busy
        if (executer.spawning) {
            console.log('Spawn is busy with:', executer.spawning.name);
            return; // Task remains in progress, will retry next tick
        }

        // Validate energy availability
        let bodyCost = this.calculateBodyCost(task.data.body);
        let availableEnergy = executer.room.energyAvailable;
        
        console.log('Required energy:', bodyCost, 'Available energy:', availableEnergy);

        if (availableEnergy < bodyCost) {
            console.log('ERROR: Insufficient energy for spawning');
            this.completeTask(task, false, 'Insufficient energy: ' + availableEnergy + '/' + bodyCost);
            return;
        }

        // Convert body part strings to constants
        let bodyParts = [];
        for (let part of task.data.body) {
            switch (part) {
                case 'MOVE':
                    bodyParts.push(MOVE);
                    break;
                case 'WORK':
                    bodyParts.push(WORK);
                    break;
                case 'CARRY':
                    bodyParts.push(CARRY);
                    break;
                case 'ATTACK':
                    bodyParts.push(ATTACK);
                    break;
                case 'RANGED_ATTACK':
                    bodyParts.push(RANGED_ATTACK);
                    break;
                case 'HEAL':
                    bodyParts.push(HEAL);
                    break;
                case 'TOUGH':
                    bodyParts.push(TOUGH);
                    break;
                case 'CLAIM':
                    bodyParts.push(CLAIM);
                    break;
                default:
                    console.log('WARNING: Unknown body part:', part);
                    bodyParts.push(MOVE); // Default to MOVE
            }
        }

        // Attempt to spawn the creep
        let spawnResult = executer.spawnCreep(
            bodyParts,
            this.generateCreepName(task.data.role),
            {
                memory: { role: task.data.role }
            }
        );

        console.log('Spawn result:', spawnResult);

        switch (spawnResult) {
            case OK:
                console.log('SUCCESS: Creep spawned successfully');
                this.completeTask(task, true, 'Creep spawned: ' + this.generateCreepName(task.data.role));
                break;
            
            case ERR_BUSY:
                console.log('Spawn is busy - will retry next tick');
                // Don't complete task, let it retry
                break;
            
            case ERR_INVALID_ARGS:
                console.log('ERROR: Invalid spawn arguments');
                this.completeTask(task, false, 'Invalid spawn arguments');
                break;
            
            case ERR_NAME_EXISTS:
                console.log('ERROR: Creep name already exists');
                // Generate alternative name and retry
                let alternativeName = this.generateCreepName(task.data.role) + '_' + Game.time;
                let retryResult = executer.spawnCreep(
                    bodyParts,
                    alternativeName,
                    { memory: { role: task.data.role } }
                );
                
                if (retryResult === OK) {
                    console.log('SUCCESS: Creep spawned with alternative name:', alternativeName);
                    this.completeTask(task, true, 'Creep spawned: ' + alternativeName);
                } else {
                    console.log('ERROR: Alternative spawn also failed:', retryResult);
                    this.completeTask(task, false, 'Spawn failed with alternative name');
                }
                break;
            
            case ERR_NOT_ENOUGH_ENERGY:
                console.log('ERROR: Not enough energy (race condition)');
                this.completeTask(task, false, 'Energy insufficient at spawn time');
                break;
            
            default:
                console.log('ERROR: Unexpected spawn error:', spawnResult);
                this.completeTask(task, false, 'Spawn error: ' + spawnResult);
        }
    },

    calculateBodyCost: function (bodyParts) {
        let cost = 0;
        for (let part of bodyParts) {
            switch (part) {
                case 'MOVE':
                    cost += 50;
                    break;
                case 'WORK':
                    cost += 100;
                    break;
                case 'CARRY':
                    cost += 50;
                    break;
                case 'ATTACK':
                    cost += 80;
                    break;
                case 'RANGED_ATTACK':
                    cost += 150;
                    break;
                case 'HEAL':
                    cost += 250;
                    break;
                case 'TOUGH':
                    cost += 10;
                    break;
                case 'CLAIM':
                    cost += 600;
                    break;
                default:
                    console.log('WARNING: Unknown body part:', part);
                    cost += 50; // Default cost
            }
        }
        return cost;
    },

    generateCreepName: function (role) {
        return role.toUpperCase() + '_' + Game.time;
    },

    completeTask: function (task, success, message) {
        task.status = success ? 'done' : 'failed';
        task.completedAt = Game.time;
        task.result = {
            success: success,
            message: message
        };
        
        console.log('Task completed:', task.id, 'Success:', success, 'Message:', message);
        
        // Clean up task memory if it's not repeatable
        if (!task.repeatable) {
            console.log('Removing non-repeatable task:', task.id);
            delete Memory.tasks[task.id];
        }
    }
};