const constants = require('constants');

module.exports = {
    run: function(executer, task) {
        const { structureType, position, targetId, targetType } = task.data || {};

        // Проверка валидности данных задачи
        if (!structureType || !position) {
            return true; // Завершаем задачу при невалидных данных
        }

        // Преобразуем позицию из объекта в RoomPosition
        const pos = new RoomPosition(position.x, position.y, position.roomName);

        // Проверяем, достиг ли крип позиции строительства
        const atConstructionPosition = executer.pos.isEqualTo(pos);

        if (!atConstructionPosition) {
            // Двигаемся к позиции строительства
            const moveResult = executer.moveTo(pos, { visualizePathStyle: { stroke: '#ffffff' } });
            
            // Если не можем двигаться (например, путь заблокирован), завершаем задачу
            if (moveResult !== OK && moveResult !== ERR_TIRED) {
                return true;
            }
            
            return false; // Продолжаем движение
        }

        // На позиции строительства - начинаем строительство
        const constructionSite = this.findConstructionSiteAtPosition(pos, structureType);

        if (!constructionSite) {
            // Нет строительной площадки - создаем новую
            const result = pos.createConstructionSite(structureType);
            
            if (result === OK) {
                // Успешно создали строительную площадку
                return false; // Продолжаем задачу
            } else if (result === ERR_INVALID_TARGET) {
                // Что-то мешает постройке (например, другая постройка)
                return true; // Завершаем задачу
            } else {
                // Другая ошибка - пробуем снова
                return false;
            }
        }

        // Есть строительная площадка - строим
        const buildResult = executer.build(constructionSite);

        if (buildResult === OK) {
            // Успешно построили часть конструкции
            // Проверяем, завершена ли постройка
            if (constructionSite.progress === constructionSite.progressTotal) {
                return true; // Постройка завершена - завершаем задачу
            }
            return false; // Продолжаем строить
        } else if (buildResult === ERR_NOT_ENOUGH_ENERGY) {
            // Нет энергии - нужно пополнить
            const storage = this.findStorageForResource(executer);
            
            if (storage) {
                // Пытаемся взять энергию из хранилища
                const withdrawResult = executer.withdraw(storage, RESOURCE_ENERGY);
                
                if (withdrawResult === OK || withdrawResult === ERR_NOT_ENOUGH_RESOURCES) {
                    // Энергия взята или хранилище пустое
                    return false; // Продолжаем задачу
                }
            }
            
            // Если не можем взять энергию, ищем энергию на земле
            const droppedEnergy = this.findDroppedEnergy(pos);
            if (droppedEnergy) {
                const pickupResult = executer.pickup(droppedEnergy);
                if (pickupResult === OK) {
                    return false; // Продолжаем задачу
                }
            }
            
            return false; // Продолжаем пытаться
        } else if (buildResult === ERR_INVALID_TARGET) {
            // Строительная площадка исчезла или что-то мешает
            return true; // Завершаем задачу
        } else {
            // Другая ошибка - пробуем снова
            return false;
        }
    },

    findConstructionSiteAtPosition: function(pos, structureType) {
        const constructionSites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
        
        for (let site of constructionSites) {
            if (site.structureType === structureType) {
                return site;
            }
        }
        
        return null;
    },

    findStorageForResource: function(creep) {
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
    },

    findDroppedEnergy: function(pos) {
        const droppedEnergy = pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
            filter: (resource) => resource.resourceType === RESOURCE_ENERGY
        });

        return droppedEnergy.length > 0 ? droppedEnergy[0] : null;
    }
};