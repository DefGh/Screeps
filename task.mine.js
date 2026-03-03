const constants = require("constants");
const taskManager = require("task.manager")


module.exports = {
    run : function(creep, task) {
        // 1 - init
        let sourceId = task.data.sourceId;
        let source = Game.getObjectById(sourceId);

        // 2 - if on destination coord - mine
        if (creep.pos.x === task.position.x && creep.pos.y === task.position.y) {
            // Mine energy from source
            let result = creep.harvest(source);
            if (result === ERR_NOT_ENOUGH_RESOURCES) {
                // Source is empty, just wait
                creep.say('waiting');
            } else if (result !== OK) {
                // Other error, try to move to correct position
                creep.moveTo(task.position);
            }
        }
        // 3 - else - try create taxi task and move to coord
        else {
            // Create taxi task to move to mining position
            taskManager.tryAddTask(taskManager.baseTask(
                'taxi'+Game.time, 
                constants.taskTypes.TAXI, 
                {
                    whom: creep.id,
                    where: task.position
                }, 
                [constants.roles.UNIVERSAL], 
                false, 
                1, 
                1
            ));

            creep.moveTo(task.position);
        }
    }
} 
