constants = require('constants');

module.exports = {

    buildBody: function(role) {
        //        
        // get max energy
        let spawn = Game.spawns['Spawn1'];
        console.log('DEBUG: buildBody called for role:', role);
        console.log('DEBUG: spawn exists:', !!spawn);
        
        if (!spawn) {
            console.log('DEBUG: spawn is null/undefined, returning empty body');
            return [];
        }
        
        let maxEnergy = spawn.store.getCapacity([RESOURCE_ENERGY]);
        console.log('DEBUG: maxEnergy:', maxEnergy);
        
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
                console.log('DEBUG: unknown role, returning empty body');
                return [];
        }
        
        console.log('DEBUG: pattern length:', pattern.length);
        console.log('DEBUG: pattern costs:', pattern.map(p => p.cost));

        var avail = maxEnergy; 
        console.log('DEBUG: initial avail:', avail);
        var body = []
        console.log('DEBUG: starting while loop');
        while (avail > 0) {
            console.log('DEBUG: while loop iteration, avail:', avail);
            for(let part of pattern) {
                console.log('DEBUG: checking part cost:', part.cost, 'avail:', avail);
                if (avail >= part.cost)
                {
                    avail -= part.cost
                    body.push(part.part)
                    console.log('DEBUG: added part, new avail:', avail, 'body length:', body.length);
                }   
                else {
                    console.log('DEBUG: part cost too high, returning body with length:', body.length);
                    return body;
                }
            }
        }
        console.log('DEBUG: while loop ended, final body length:', body.length);
        return body;
    }
}