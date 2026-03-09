module.exports = {
    // Инициализация менеджера ресурсов
    init: function() {
        if (!Memory.resourceManager) {
            Memory.resourceManager = {
                reservations: {}, // { creepId: amount }
                lastCleanup: 0
            };
        }
    },

    // Резервирование энергии за крипом
    reserveEnergy: function(amount, creepId) {
        this.init();
        
        // Проверяем, есть ли уже резерв за этим крипом
        if (this.hasReservation(creepId)) {
            return true; // Резерв уже существует
        }
        
        // Получаем доступную энергию
        let availableEnergy = this.getAvailableEnergy();
        
        if (availableEnergy >= amount) {
            // Резервируем энергию
            Memory.resourceManager.reservations[creepId] = amount;
            return true;
        }
        
        return false; // Недостаточно энергии для резервирования
    },

    // Освобождение резерва энергии
    releaseEnergy: function(creepId) {
        this.init();
        
        if (this.hasReservation(creepId)) {
            delete Memory.resourceManager.reservations[creepId];
            return true;
        }
        
        return false; // Резерва не было
    },

    // Проверка наличия резерва за крипом
    hasReservation: function(creepId) {
        this.init();
        return Memory.resourceManager.reservations.hasOwnProperty(creepId);
    },

    // Получение доступной (нерезервированной) энергии
    getAvailableEnergy: function() {
        this.init();
        
        // Собираем всю энергию в комнате
        let totalEnergy = 0;
        
        // Энергия в спавне и расширениях
        let spawns = Game.spawns['Spawn1'].room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_SPAWN ||
                       structure.structureType === STRUCTURE_EXTENSION;
            }
        });
        
        for (let structure of spawns) {
            totalEnergy += structure.store[RESOURCE_ENERGY] || 0;
        }
        
        // Энергия в хранилище
        let storage = Game.spawns['Spawn1'].room.storage;
        if (storage) {
            totalEnergy += storage.store[RESOURCE_ENERGY] || 0;
        }
        
        // Энергия в контейнерах
        let containers = Game.spawns['Spawn1'].room.find(FIND_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER;
            }
        });
        
        for (let container of containers) {
            totalEnergy += container.store[RESOURCE_ENERGY] || 0;
        }
        
        // Вычитаем зарезервированную энергию
        let reservedEnergy = 0;
        for (let creepId in Memory.resourceManager.reservations) {
            reservedEnergy += Memory.resourceManager.reservations[creepId];
        }
        
        return Math.max(0, totalEnergy - reservedEnergy);
    },

    // Проверка мертвых крипов и снятие их резервов
    checkDeadCreeps: function() {
        this.init();
        
        // Проверяем раз в 15 тиков
        if (Game.time - Memory.resourceManager.lastCleanup < 15) {
            return;
        }
        
        Memory.resourceManager.lastCleanup = Game.time;
        
        let cleaned = 0;
        let reservations = Memory.resourceManager.reservations;
        
        // Проверяем каждый зарезервированный крип
        for (let creepId in reservations) {
            let creep = Game.getObjectById(creepId);
            
            // Если крипа нет в игре - снимаем резерв
            if (!creep) {
                delete reservations[creepId];
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`ResourceManager: Очищено ${cleaned} резервов от мертвых крипов`);
        }
    },

    // Получение общего количества зарезервированной энергии
    getReservedEnergy: function() {
        this.init();
        
        let totalReserved = 0;
        for (let creepId in Memory.resourceManager.reservations) {
            totalReserved += Memory.resourceManager.reservations[creepId];
        }
        
        return totalReserved;
    },

    // Получение информации о резервах (для отладки)
    getReservationsInfo: function() {
        this.init();
        
        return {
            totalReserved: this.getReservedEnergy(),
            available: this.getAvailableEnergy(),
            count: Object.keys(Memory.resourceManager.reservations).length,
            reservations: Memory.resourceManager.reservations
        };
    }
};