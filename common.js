module.exorts = {
    
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
        let maxEnergy = this.room.energyCapacityAvailable;
        
        switch (role) {
            case CreepRole.UNIVERSAL:
                var aval = maxEnergy;
                let parts = [];    

                while (aval > 0) {
                    for (let part in BodyPartCosts) {
                        if (aval >= BodyPartCosts[part]) {
                            aval -= BodyPartCosts[part];
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