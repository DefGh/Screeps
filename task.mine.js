const constants = require("constants");
const taskManager = require("task.manager")
module.exports = {
    run : function(creep, task) {
        // 1 - init
        let sourceId = task.data.sourceId;
        let source = Game.getObjectById(sourceId);
        let position = task.data.position;
        
        // 2 - if on destination coord - mine
        if (creep.pos.x === position.x && creep.pos.y === position.y) {
            // Mine energy from source
            let result = creep.harvest(source);
            
            if (result === ERR_NOT_ENOUGH_RESOURCES) {
                // Source is empty, just wait
                creep.say('waiting');
                return false; // Task not finished, continue waiting
            } else if (result !== OK) {
                // Other error, try to move to correct position
                res = creep.moveTo(position);
                console.log('miner', res);
                return false; // Task not finished
            } else {
                // Successfully mined
                creep.say('⛏️ Mining');
                return false; // Task continues (repeatable)
            }
        }
        // 3 - else - try create taxi task and move to coord
        else {
            // Check if taxi task already exists for this creep
            let taxiTaskExists = false;
            if (Memory.tasks) {
                for (let taskId in Memory.tasks) {
                    let existingTask = Memory.tasks[taskId];
                    if (existingTask.type === constants.taskTypes.TAXI &&
                        existingTask.data &&
                        existingTask.data.whom === creep.id) {
                        taxiTaskExists = true;
                        break;
                    }
                }
            }
            
            // Create taxi task only if it doesn't exist
            if (!taxiTaskExists) {
                taskManager.tryAddTask({
                    type: constants.taskTypes.TAXI,
                    canExecute: [constants.roles.UNIVERSAL],
                    repeatable: false,
                    maxExecuters: 1,
                    priority: 1,
                    data: {
                        whom: creep.id,
                        where: position
                    }
                });
            }
            
            creep.moveTo(position);
            return false; // Task not finished, still moving
        }
    }
}
