Creep.prototype.run = function(creep) {
    let role = creep.memory.role;
    roleRunner = require('role.' + role);
    roleRunner.run(creep);
}

