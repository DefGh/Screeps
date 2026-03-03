constants = require('constants');

module.exports = {

    buildBody: function(role) {
        //console.log('Building body for role:', role);
        
        // get max energy
        let maxEnergy = Game.spawns['Spawn1'].room.energyCapacityAvailable;
        //console.log('Max energy available:', maxEnergy);
        
        switch (role) {
            case constants.roles.UNIVERSAL:
                var aval = maxEnergy;
                let parts = [];    
                //console.log('Building universal body with', aval, 'energy');
                let universal_body = [constants.BodyParts.MOVE, constants.BodyParts.CARRY, constants.BodyParts.WORK]
                while (aval > 0) {
                    for (let part in universal_body) {
                        if (aval >= part.cost) {
                            aval -= part.cost;
                            parts.push(part.part);
                        }
                    }
                }
                //console.log('Final body parts:', parts);
                return parts;
                break;
            default:
                //console.log('Unknown role, returning empty body');
                return [];
        }
    }
}