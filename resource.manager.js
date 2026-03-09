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
            creep: creep,
            amount: amount,
            sourceId: from,
            type: type
        }
    },    

    reservedTotal(source) {
        var amount = 0;
        for (let reservation in Memory.resourceManager.reservations) {
            console.log(reservationId);
            reservationId = Memory.resourceManager.reservations[reservationId];
            if (reservation.sourceId === source.id) {
                amount += reservation.amount;
            }
        }

        return amount;
    },

    reserveEnergy: function(creep, amount) {
        this.init();
        console.log(creep.memory)
        // 0. find where to get energy from container -> pile -> source
        var reservation = {};
        var containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > this.reservedTotal(structure.id)
        });

        if (containers.length > 0) {
            var closest = creep.pos.findClosestByRange(containers);
            reservation = this.reservation(creep, amount, closest.id, constants.energySourceType.container);
        }

        var piles = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > this.reservedTotal(structure.id)
        });

        if (piles.length > 0) {
            var closest = creep.pos.findClosestByRange(piles);
            reservation = this.reservation(creep, amount, closest.id, constants.energySourceType.pile);
        }

        var sources = creep.room.find(FIND_SOURCES, {
            filter: (source) => source.energy > this.reservedTotal(source.id)
        });

        if (sources.length > 0) {
            var closest = creep.pos.findClosestByRange(sources);
            reservation = this.reservation(creep, amount, closest.id, constants.energySourceType.source);
        }

        Memory.resourceManager.reservations[creep.id] = reservation;

    },
};