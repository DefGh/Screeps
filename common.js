constants = require('constants');
module.exports = {
    buildBody: function(role) {
        //        
        // get max energy
        let spawn = Game.spawns['Spawn1'];
        
        if (!spawn) {
            return [];
        }
        
        let maxEnergy = spawn.store.getCapacity([RESOURCE_ENERGY]);
        
        //        var pattern = [];
        let pattern;
        switch (role) {
            case constants.roles.UNIVERSAL:
                pattern = [constants.BodyParts.MOVE, constants.BodyParts.CARRY, constants.BodyParts.WORK, constants.BodyParts.MOVE, constants.BodyParts.CARRY, constants.BodyParts.WORK, constants.BodyParts.MOVE, constants.BodyParts.CARRY, constants.BodyParts.WORK, constants.BodyParts.MOVE, constants.BodyParts.CARRY, constants.BodyParts.WORK, constants.BodyParts.MOVE, constants.BodyParts.CARRY, constants.BodyParts.WORK]  
                break;
            case constants.roles.MINER:
                pattern = [constants.BodyParts.WORK, constants.BodyParts.WORK, constants.BodyParts.WORK, constants.BodyParts.WORK, constants.BodyParts.WORK]
                break;
            default:
                return [];
        }

        var avail = maxEnergy; 
        var body = []
        while (avail > 0) {
            for(let part of pattern) {
                if (avail >= part.cost)
                {
                    avail -= part.cost
                    body.push(part.part)
                }   
                else {
                    return body;
                }
            }
        }
        return body;
    }
}
