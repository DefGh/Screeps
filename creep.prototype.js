Creep.prototype.run = function() {
    let role = this.memory.role;
    roleRunner = require('role.' + role);
    roleRunner.run(this);
}

