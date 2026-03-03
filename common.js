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

                // Build body parts until we run out of energy
                let maxParts = 50; // Safety limit to prevent infinite loops
                let partCount = 0;
                
                while (aval > 0 && partCount < maxParts) {
                    let addedPart = false;
                    
                    // Try to add parts in priority order: WORK, CARRY, MOVE
                    if (aval >= constants.BodyPartCosts.WORK) {
                        aval -= constants.BodyPartCosts.WORK;
                        parts.push('WORK');
                        addedPart = true;
                    } else if (aval >= constants.BodyPartCosts.CARRY) {
                        aval -= constants.BodyPartCosts.CARRY;
                        parts.push('CARRY');
                        addedPart = true;
                    } else if (aval >= constants.BodyPartCosts.MOVE) {
                        aval -= constants.BodyPartCosts.MOVE;
                        parts.push('MOVE');
                        addedPart = true;
                    }
                    
                    if (!addedPart) {
                        break; // Can't add any more parts
                    }
                    
                    partCount++;
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