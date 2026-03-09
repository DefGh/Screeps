const constants = require('constants');

Creep.prototype.getEnergy = function() {
    // 0. Reserver energy if not reserved
    // reserve amount with source mentoning

    if (!this.memory.reservation) {
        const resourceManager = require('resource.manager');
        const maxEnergy = this.store.getFreeCapacity([RESOURCE_ENERGY]);

        let reservation = resourceManager.reserveEnergy(this, maxEnergy);
            
        this.memory.reservation = reservation;
    }
    
    if (this.store.getFreeCapacity([RESOURCE_ENERGY]) === 0) {
        delete this.memory.reservation ;
        return true;
    }

    var source = Game.getObjectById(this.memory.reservation.sourceId);

    var before = this.store.getFreeCapacity([RESOURCE_ENERGY]);

    // if type == pile 
    if (this.memory.reservation.type === constants.energySourceType.pile || this.memory.reservation.type === constants.energySourceType.container ) {
        if (this.withdraw(source, RESOURCE_ENERGY) != OK) {
            this.moveTo(source)
        }
    }
    if (this.memory.reservation.type ===  constants.energySourceType.source ) {
        if (this.harvest(source, RESOURCE_ENERGY) != OK) {
            this.moveTo(source)
        }
    }
    var after = this.store.getFreeCapacity([RESOURCE_ENERGY]);
    var got = before - after;
    this.memory.reservation.amount -= got;
    Memory.resourceManager.reservations[this.id] = this.memory.reservation;
    return false;
};

Creep.prototype.deliverEnergy = function(target) {

    if (this.store.getUsedCapacity() === 0) {
        return true;
    }

    switch (target.structureType) {
        case STRUCTURE_SPAWN:
            if (this.transfer(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
        case STRUCTURE_EXTENSION:
            if (this.transfer(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
        case STRUCTURE_CONTAINER:
            if (this.transfer(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
        case STRUCTURE_CONTROLLER: // controller
            if (this.upgradeController(target, RESOURCE_ENERGY) != OK) {
                this.moveTo(target)
            }
            return false;
    }    
};