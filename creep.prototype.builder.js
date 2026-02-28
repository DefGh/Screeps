/**
 * Прототип для роли Builder (Строитель)
 * Особенности: Строительство конструкций, имеет WORK и CARRY части
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления строителем
 */
Creep.prototype.runBuilder = function() {
    // Если строитель не имеет задачи, ищем задачу строительства
    if (!this.hasTask()) {
        this.assignBuilderTask();
    }
    
    // Выполняем основную логику
    if (this.hasTask()) {
        this.performBuilding();
    } else {
        // Если нет задачи, ищем свободную задачу
        this.findAndAssignTask();
    }
}

/**
 * Назначение задачи строителю
 */
Creep.prototype.assignBuilderTask = function() {
    const availableTasks = this.getAvailableTasks();
    const buildTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.BUILD);
    
    if (buildTasks.length > 0) {
        const task = buildTasks[0]; // Берем первую доступную задачу
        
        if (this.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение строительства
 */
Creep.prototype.performBuilding = function() {
    const task = this.getTask();
    
    if (!task) {
        this.releaseTask();
        return;
    }
    
    const site = Game.getObjectById(task.target);
    
    if (!site) {
        // Строительная площадка не существует
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (this.carry.energy === 0) {
        // Нужно заполниться энергией
        this.performRefill();
        return;
    }
    
    // Строим конструкцию
    const result = this.build(site);
    
    if (result === OK) {
        // Успешно построили
        this.updateTaskProgress(this.carry.energy);
        
        // Проверяем, завершена ли постройка
        if (site.progress >= site.progressTotal) {
            this.completeTask();
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к строительной площадке
        this.moveTo(site);
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Нужно заполниться энергией
        this.performRefill();
    }
}

/**
 * Заполнение энергии
 */
Creep.prototype.performRefill = function() {
    // Ищем источник энергии для заполнения
    const storage = this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => {
            return (structure.structureType === STRUCTURE_STORAGE ||
                    structure.structureType === STRUCTURE_CONTAINER) &&
                   structure.store[RESOURCE_ENERGY] > 0;
        }
    });
    
    if (storage) {
        if (this.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            this.moveTo(storage);
        }
    } else {
        // Ищем спавнеры или экстеншены
        const spawns = this.pos.findClosestByRange(FIND_MY_SPAWNS, {
            filter: (spawn) => spawn.energy > 0
        });
        
        if (spawns) {
            if (this.withdraw(spawns, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveTo(spawns);
            }
        }
    }
}

/**
 * Поиск и назначение задачи
 */
Creep.prototype.findAndAssignTask = function() {
    const bestTask = this.findBestTask();
    
    if (bestTask) {
        if (this.assignTask(bestTask.id)) {
            // Задача назначена, начинаем выполнение
            this.performTask();
        }
    }
}

/**
 * Проверка состояния строителя
 */
Creep.prototype.checkBuilderStatus = function() {
    // Проверяем, жив ли крип
    if (!this) {
        return false;
    }
    
    // Проверяем, не умер ли крип
    if (this.spawning) {
        return true;
    }
    
    // Проверяем, есть ли задача
    if (this.hasTask()) {
        const task = this.getTask();
        if (!task || task.state === 'COMPLETED') {
            this.releaseTask();
        }
    }
    
    return true;
}

/**
 * Поиск ближайшей строительной площадки
 */
Creep.prototype.findNearestConstructionSite = function() {
    return this.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
}

/**
 * Оптимизация строительства (групповая работа)
 */
Creep.prototype.optimizeBuilding = function() {
    // Логика оптимизации группового строительства
    // Пока оставим заглушку
}

/**
 * Проверка прогресса строительства
 */
Creep.prototype.checkBuildingProgress = function() {
    const task = this.getTask();
    
    if (!task) {
        return 0;
    }
    
    const site = Game.getObjectById(task.target);
    
    if (!site) {
        return 0;
    }
    
    return site.progress / site.progressTotal;
}

module.exports = {};