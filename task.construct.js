const constants = require('constants');

module.exports = {
    run: function(executer, task) {
        const { structureType, position, targetId, targetType, constructionSiteId } = task.data || {};

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

        // На позиции строительства - начинаем бесконечный цикл
        // Цикл: взять энергию до полного -> строить пока есть энергия -> повторять
        
        // Проверяем, есть ли энергия у крипа
        if (executer.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            // Нет энергии - пытаемся получить
            const gotEnergy = executer.getEnergy();
            if (!gotEnergy) {
                // Не удалось получить энергию - ждем
                return false;
            }
            // Энергия получена - продолжаем цикл
        }
        
        // Проверяем наличие Construction Site
        let constructionSite = null;
        
        // Сначала пробуем найти по ID (если он был сохранен)
        if (constructionSiteId) {
            constructionSite = Game.getObjectById(constructionSiteId);
        }
        
        // Если не нашли по ID, ищем на позиции
        if (!constructionSite) {
            constructionSite = executer.findConstructionSiteAtPosition(pos, structureType);
        }
        
        if (!constructionSite) {
            // Нет строительной площадки - задача завершена (возможно, постройка уже завершена)
            return true;
        }

        // Проверяем, завершена ли постройка
        if (constructionSite.progress === constructionSite.progressTotal) {
            return true; // Постройка завершена - завершаем задачу
        }

        // Строим пока есть энергия
        const buildResult = executer.buildStructure(constructionSite);

        if (buildResult) {
            // Успешно построили часть - продолжаем цикл
            return false;
        } else {
            // Нет энергии для строительства - цикл продолжится на следующем тике
            return false;
        }
    }
};
