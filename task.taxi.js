const constants = require("constants");
const taskManager = require("task.manager")
module.exports = {
    run : function(creep, task) {
        // 1 - init
        let whomId = task.data.whom;
        let where = task.data.where;
        
        // Get the target creep
        let targetCreep = Game.getObjectById(whomId);
        
        if (!targetCreep) {
            return true; // Task completed (target died)
        }
        
        // 2 - if target creep is at destination - task is done
        if (targetCreep.pos.x === where.x && targetCreep.pos.y === where.y) {
            // Task completed - target reached destination
            creep.say('✅ Done');
            return true; // Task completed successfully
        }
        
        if(creep.pull(targetCreep) == ERR_NOT_IN_RANGE) {
            creep.moveTo(targetCreep);
        } else {
            targetCreep.move(creep);

            if(creep.pos.x === where.x && creep.pos.y === where.y) {
                creep.move(creep.pos.getDirectionTo(targetCreep));
            } else {
                creep.moveTo(where.x, where.y);
            }
        }

        return false; // Task not finished yet
    }
}
