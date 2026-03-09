Creep.prototype.getEnergy = function() {
    // 0. Reserver energy if not reserved
    // reserve amount with source mentoning

    if (!this.memory.reservation) {
        const resourceManager = require('resource.manager');
        const maxEnergy = this.store.getFreeCapacity([RESOURCE_ENERGY]);

        let reservation = resourceManager.reserveEnergy(maxEnergy, this.id);
        this.memory.reservation = reservation;
    }
    
    if (this.store.getFreeCapacity([RESOURCE_ENERGY]) === 0) {
        return true;
    }

    var source = Game.getObjectById(this.memory.reservation.sourceId);

    // if type == pile 
    if (reservation.type === 'pile' || reservation.type === 'container' ) {
        if (this.withdraw(source, RESOURCE_ENERGY) != OK) {
            this.moveTo(source)
        }
        return false;
    }
    if (reservation.type === 'source' ) {
        if (this.harvest(source, RESOURCE_ENERGY) != OK) {
            this.moveTo(source)
        }
        return false;
    }   
};

Creep.prototype.deliverEnergy = function(target) {

    if (this.store.getUsedCapacity() === 0) {
        return true;
    }

    switch (target.structureType) {
        case 'STRUCTURE_SPAWN':
            if (this.transfer(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
        case 'STRUCTURE_EXTENSION':
            if (this.transfer(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
        case 'STRUCTURE_CONTAINER':
            if (this.transfer(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
        case 'STRUCTURE_CONTROOLER': // controller
            if (this.upgradeController(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
    }    
};