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
        // get max energy
        let maxEnergy = Game.spawns['Spawn1'].room.energyCapacityAvailable;
        
        switch (role) {
            case this.roles.UNIVERSAL:
                var aval = maxEnergy;
                let parts = [];    

                while (aval > 0) {
                    for (let part in this.BodyPartCosts) {
                        if (aval >= this.BodyPartCosts[part]) {
                            aval -= this.BodyPartCosts[part];
                            parts.push(part);
                        }
                    }
                }
                return parts;
                break;
            default:
                return [];
        }


    }
}