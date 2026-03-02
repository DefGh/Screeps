module.exports = {
    
    BodyPartCosts: {
        MOVE: 50,
        WORK: 100,
        CARRY: 50
    },
       
    roles: {
        UNIVERSAL: 'universal',
        SPAWNER: 'spawner'
    },

    buildBody: function(role) {
        //console.log('Building body for role:', role);
        
        // get max energy
        let maxEnergy = Game.spawns['Spawn1'].room.energyCapacityAvailable;
        //console.log('Max energy available:', maxEnergy);
        
        switch (role) {
            case this.roles.UNIVERSAL:
                var aval = maxEnergy;
                let parts = [];    
                //console.log('Building universal body with', aval, 'energy');

                while (aval > 0) {
                    for (let part in this.BodyPartCosts) {
                        if (aval >= this.BodyPartCosts[part]) {
                            aval -= this.BodyPartCosts[part];
                            parts.push(part);
                            //console.log('Added part:', part, 'Cost:', this.BodyPartCosts[part], 'Remaining energy:', aval);
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