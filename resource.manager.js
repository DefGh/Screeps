const constants = require("constants");

module.exports = {
    // Инициализация менеджера ресурсов
    init() {
        if (!Memory.resourceManager) {
            Memory.resourceManager = {
                reservations: {}, 
                // {
                //     creep: creep,
                //     amount: amount,
                //     sourceId: from,
                //     type: type
                // }
                lastCleanup: 0
            };
        }
    },

    reservation(creep, amount, from, type) {
        return {
            creep: creep.id,
            amount: amount,
            sourceId: from,
            type: type
        }
    },    

    reservedTotal(source) {
        var amount = 0;
        for (let reservationId in Memory.resourceManager.reservations) { 
            let reservation = Memory.resourceManager.reservations[reservationId];
            
            if (!reservation.sourceId)
                continue;

            if (reservation.sourceId === source.id) {
                amount += reservation.amount;
            }
        }

        return amount;
    },

    reserveEnergy: function(creep, amount) {
        this.init();
        // 0. find where to get energy from container -> pile -> source
        var curReservation = {};
        var containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > amount
        });

        if (containers.length > 0) {
            var closest = creep.pos.findClosestByRange(containers);
            curReservation = this.reservation(creep, amount, closest.id, constants.energySourceType.container);

            Memory.resourceManager.reservations[creep.id] = curReservation;
            return curReservation;
        }

        var piles = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (structure) => (structure.energy + 300) > amount
        });

        console.log(JSON.stringify(piles));

        if (piles.length > 0) {
            var closest = creep.pos.findClosestByRange(piles);
            curReservation = this.reservation(creep, amount, closest.id, constants.energySourceType.pile);

            Memory.resourceManager.reservations[creep.id] = curReservation;
            return curReservation;
        }

        var sources = creep.room.find(FIND_SOURCES, {
            filter: (source) => source.energy > amount
        });

        if (sources.length > 0) {
            var closest = creep.pos.findClosestByRange(sources);
            curReservation = this.reservation(creep, amount, closest.id, constants.energySourceType.source);
            
            Memory.resourceManager.reservations[creep.id] = curReservation;
            return curReservation;
        }
    },

    getReservationsInfo: function() {
        this.init();
        
        let totalReserved = 0;
        let count = 0;
        let reservations = {};
        
        for (let creepId in Memory.resourceManager.reservations) {
            let reservation = Memory.resourceManager.reservations[creepId];

            let creep = Game.creeps[creepId];
            if (!creep) {
                delete Memory.resourceManager.reservations[creepId];
                delete Memory.creeps[creepId];
                continue;
            }


            if (reservation && reservation.amount) {
                totalReserved += reservation.amount;
                count++;
                reservations[creepId] = reservation.amount;
            }
        }
        
        // Для простоты считаем доступные ресурсы как общее количество энергии в комнате
        // минус зарезервированное количество
        let available = 0;
        const room = Game.spawns['Spawn1'] ? Game.spawns['Spawn1'].room : null;
        
        if (room) {
            // Считаем энергию в контейнерах
            const containers = room.find(FIND_STRUCTURES, {
                filter: (structure) => structure.structureType === STRUCTURE_CONTAINER
            });
            
            for (let container of containers) {
                available += container.store[RESOURCE_ENERGY] || 0;
            }

            const piles = room.find(FIND_DROPPED_RESOURCES, {
                filter: (structure) => structure.resourceType === RESOURCE_ENERGY
            });

            for (let pile of piles) {
                available += pile.energy || 0;
            }
            
            if (available == 0) {
                const sources = room.find(FIND_SOURCES);
                for (let source of sources) {
                    available += source.energy || 0;
                }
            }
        }
        
        // Доступные ресурсы = общие - зарезервированные
        available = Math.max(0, available - totalReserved);
        
        return {
            available: available,
            totalReserved: totalReserved,
            count: count,
            reservations: reservations
        };
    }
};
