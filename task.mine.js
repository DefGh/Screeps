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
            } else if (result !== OK) {
                // Other error, try to move to correct position
                creep.moveTo(position);
            }
        }
        // 3 - else - try create taxi task and move to coord
        else {
            // Create taxi task to move to mining position
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

            creep.moveTo(position);
        }
    }
}
