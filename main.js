taskManager = require('task.manager');
creep_proto = require('creep.prototype');

module.exports.loop = function () {

    taskManager.run();
    
    for (let name in Game.creeps) {
        let creep = Game.creeps[name];
        creep_proto.run(creep);
    }
    
}