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

        // Validate energy availability
        let bodyCost = this.calculateBodyCost(task.data.body);
        let availableEnergy = executer.room.energyAvailable;
        
        if (availableEnergy < bodyCost) {
            this.completeTask(task, false, 'Insufficient energy: ' + availableEnergy + '/' + bodyCost);
            return true; // Task is finished (failed)
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
                taskFinished = true;
                break;
            
            default:
                this.completeTask(task, false, 'Spawn error: ' + spawnResult);
                taskFinished = true;
        }

        return taskFinished;
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
        
        // Clean up task memory if it's not repeatable
        if (!task.repeatable) {
            delete Memory.tasks[task.id];
        }
    }
};