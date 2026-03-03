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
            console.log('Target creep not found:', whomId);
            return;
        }

        // 2 - if target creep is at destination - task is done
        if (targetCreep.pos.x === where.x && targetCreep.pos.y === where.y) {
            // Task completed - target reached destination
            creep.say('done');
            return;
        }

        creep.moveTo(targetCreep);
    }
}