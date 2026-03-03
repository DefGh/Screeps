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

                while (aval > 0) {
                    for (let part in constants.BodyPartCosts) {
                        if (aval >= constants.BodyPartCosts[part]) {
                            aval -= constants.BodyPartCosts[part];
                            parts.push(part);
                            //console.log('Added part:', part, 'Cost:', constants.BodyPartCosts[part], 'Remaining energy:', aval);
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