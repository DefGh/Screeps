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
                
                // Для универсального крипа создаем сбалансированное тело
                // Сначала добавляем по одной части каждого типа для базовой функциональности
                let baseParts = [constants.BodyParts.MOVE.part, constants.BodyParts.CARRY.part, constants.BodyParts.WORK.part];
                let baseCost = constants.BodyParts.MOVE.cost + constants.BodyParts.CARRY.cost + constants.BodyParts.WORK.cost;
                
                if (aval >= baseCost) {
                    // Добавляем базовые части
                    parts = baseParts.slice();
                    aval -= baseCost;
                    
                    // Распределяем оставшуюся энергию пропорционально
                    while (aval > 0) {
                        let partsAdded = false;
                        for (let part of universal_body) {
                            if (aval >= part.cost) {
                                aval -= part.cost;
                                parts.push(part.part);
                                partsAdded = true;
                            }
                        }
                        // Если не удалось добавить ни одной части, выходим из цикла
                        if (!partsAdded) {
                            break;
                        }
                    }
                } else {
                    // Если энергии не хватает даже на базовые части, добавляем только MOVE
                    while (aval >= constants.BodyParts.MOVE.cost) {
                        aval -= constants.BodyParts.MOVE.cost;
                        parts.push(constants.BodyParts.MOVE.part);
                    }
                }
                
                //console.log('Final body parts:', parts);
                return parts;
                break;
            case constants.roles.MINER:
                // Для минера создаем тело с максимальным количеством WORK частей
                let workParts = Math.min(5, Math.floor(maxEnergy / 200));
                let minerParts = [];
                
                // Добавляем WORK части
                for (let i = 0; i < workParts; i++) {
                    minerParts.push(constants.BodyParts.WORK.part);
                }
                
                //console.log('Miner body parts:', minerParts);
                return minerParts;
                break;
            default:
                //console.log('Unknown role, returning empty body');
                return [];
        }
    }
}