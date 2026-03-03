const constants = require("constants");
const taskManager = require("task.manager")
module.exports = {
    run : function(creep, task) {
        console.log('DEBUG: task.taxi.run called for creep:', creep.name);
        console.log('DEBUG: task.data.whom:', task.data.whom);
        console.log('DEBUG: task.data.where:', task.data.where);
        
        // 1 - init
        let whomId = task.data.whom;
        let where = task.data.where;
        
        // Get the target creep
        let targetCreep = Game.getObjectById(whomId);
        console.log('DEBUG: targetCreep:', targetCreep);
        
        if (!targetCreep) {
            console.log('DEBUG: targetCreep not found, task completed');
            return true; // Task completed (target died)
        }
        
        console.log('DEBUG: targetCreep.pos:', targetCreep.pos);
        console.log('DEBUG: where:', where);
        
        // 2 - if target creep is at destination - task is done
        if (targetCreep.pos.x === where.x && targetCreep.pos.y === where.y) {
            console.log('DEBUG: target is at destination, task completed');
            // Task completed - target reached destination
            creep.say('✅ Done');
            return true; // Task completed successfully
        }
        
        // 3 - move to target and escort
        console.log('DEBUG: moving to target position');
        creep.moveTo(targetCreep.pos);
        return false; // Task not finished yet
    }
}
