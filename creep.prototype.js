// Расширяем прототип Creep для общих операций
Creep.prototype.getEnergy = function() {
    // Используем систему резервирования энергии из resource.manager
    const resourceManager = require('resource.manager');
    
    // Резервируем энергию за этим крипом (берем всю доступную энергию)
    const availableEnergy = resourceManager.getAvailableEnergy();
    if (availableEnergy > 0) {
        const reserved = resourceManager.reserveEnergy(availableEnergy, this.id);
        if (reserved) {
            // Энергия зарезервирована, теперь забираем ее
            return this.takeReservedEnergy(availableEnergy);
        }
    }
    
    return false; // Не удалось получить энергию
};

Creep.prototype.takeReservedEnergy = function(amount) {
    // Сначала пытаемся взять энергию из хранилищ
    const storage = this.findStorageForResource();
    if (storage) {
        const withdrawResult = this.withdraw(storage, RESOURCE_ENERGY, amount);
        if (withdrawResult === OK) {
            return true; // Успешно взяли энергию
        }
    }
    
    // Если не можем взять из хранилища, ищем энергию на земле
    const droppedEnergy = this.findDroppedEnergy();
    if (droppedEnergy) {
        const pickupResult = this.pickup(droppedEnergy);
        if (pickupResult === OK) {
            return true; // Успешно подобрали энергию
        }
    }
    
    return false; // Не удалось получить энергию
};

Creep.prototype.buildStructure = function(constructionSite) {
    if (!constructionSite) {
        return false;
    }
    
    // Строим пока есть энергия
    const buildResult = this.build(constructionSite);
    
    if (buildResult === OK) {
        return true; // Успешно построили часть
    } else if (buildResult === ERR_NOT_ENOUGH_ENERGY) {
        return false; // Нет энергии для строительства
    } else {
        return false; // Другая ошибка
    }
};

Creep.prototype.findStorageForResource = function() {
    const spawn = Game.spawns['Spawn1'];
    if (!spawn) {
        return null;
    }

    // Ищем хранилище (Storage) или контейнер с энергией
    const storage = spawn.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => {
            return (structure.structureType === STRUCTURE_STORAGE || 
                    structure.structureType === STRUCTURE_CONTAINER) &&
                   structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        }
    });

    return storage;
};

Creep.prototype.findDroppedEnergy = function() {
    const droppedEnergy = this.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY
    });

    return droppedEnergy.length > 0 ? droppedEnergy[0] : null;
};

Creep.prototype.findConstructionSiteAtPosition = function(pos, structureType) {
    const constructionSites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
    
    for (let site of constructionSites) {
        if (site.structureType === structureType) {
            return site;
        }
    }
    
    return null;
};