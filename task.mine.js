const constants = require("constants");
const taskManager = require("task.manager")
module.exports = {
    run : function(creep, task) {
        console.log('DEBUG: task.mine.run called for creep:', creep.name);
        console.log('DEBUG: task.data.sourceId:', task.data.sourceId);
        console.log('DEBUG: task.data.position:', task.data.position);
        
        // 1 - init
        let sourceId = task.data.sourceId;
        let source = Game.getObjectById(sourceId);
        let position = task.data.position;
        
        console.log('DEBUG: source:', source);
        console.log('DEBUG: position:', position);
        console.log('DEBUG: creep.pos:', creep.pos);
        
        // 2 - if on destination coord - mine
        if (creep.pos.x === position.x && creep.pos.y === position.y) {
            console.log('DEBUG: creep is on position, trying to harvest');
            // Mine energy from source
            let result = creep.harvest(source);
            console.log('DEBUG: harvest result:', result);
            
            if (result === ERR_NOT_ENOUGH_RESOURCES) {
                // Source is empty, just wait
                creep.say('waiting');
                return false; // Task not finished, continue waiting
            } else if (result !== OK) {
                // Other error, try to move to correct position
                console.log('DEBUG: harvest error, trying to move to position');
                creep.moveTo(position);
                return false; // Task not finished
            } else {
                // Successfully mined
                creep.say('⛏️ Mining');
                return false; // Task continues (repeatable)
            }
        }
        // 3 - else - try create taxi task and move to coord
        else {
            console.log('DEBUG: creep is not on position, checking for existing taxi task');
            
            // Check if taxi task already exists for this creep
            let taxiTaskExists = false;
            if (Memory.tasks) {
                for (let taskId in Memory.tasks) {
                    let existingTask = Memory.tasks[taskId];
                    if (existingTask.type === constants.taskTypes.TAXI &&
                        existingTask.data &&
                        existingTask.data.whom === creep.id) {
                        taxiTaskExists = true;
                        console.log('DEBUG: taxi task already exists for this creep');
                        break;
                    }
                }
            }
            
            // Create taxi task only if it doesn't exist
            if (!taxiTaskExists) {
                console.log('DEBUG: creating new taxi task');
                let taxiTaskResult = taskManager.tryAddTask({
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
                console.log('DEBUG: taxi task creation result:', taxiTaskResult);
            } else {
                console.log('DEBUG: taxi task already exists, not creating new one');
            }
            
            creep.moveTo(position);
            return false; // Task not finished, still moving
        }
    }
}
