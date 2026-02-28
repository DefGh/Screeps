/**
 * Прототип для роли Repairer (Ремонтник)
 * Особенности: Ремонт структур, имеет WORK и CARRY части
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления ремонтником
 */
Creep.prototype.runRepairer = function() {
    // Если ремонтник не имеет задачи, ищем задачу ремонта
    if (!this.hasTask()) {
        this.assignRepairerTask();
    }
    
    // Выполняем основную логику
    if (this.hasTask()) {
        this.performRepair();
    } else {
        // Если нет задачи, ищем свободную задачу
        this.findAndAssignTask();
    }
}

/**
 * Назначение задачи ремонтнику
 */
Creep.prototype.assignRepairerTask = function() {
    const availableTasks = this.getAvailableTasks();
    const repairTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.REPAIR);
    
    if (repairTasks.length > 0) {
        const task = repairTasks[0]; // Берем первую доступную задачу
        
        if (this.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение ремонта
 */
Creep.prototype.performRepair = function() {
    const task = this.getTask();
    
    if (!task) {
        this.releaseTask();
        return;
    }
    
    const structure = Game.getObjectById(task.target);
    
    if (!structure) {
        // Структура не существует
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (this.carry.energy === 0) {
        // Нужно заполниться энергией
        this.performRefill();
        return;
    }
    
    // Ремонтируем структуру
    const result = this.repair(structure);
    
    if (result === OK) {
        // Успешно отремонтировали
        this.updateTaskProgress(this.carry.energy);
        
        // Проверяем, завершен ли ремонт
        if (structure.hits >= structure.hitsMax) {
            this.completeTask();
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к структуре
        this.moveTo(structure);
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
 * Проверка состояния ремонтника
 */
Creep.prototype.checkRepairerStatus = function() {
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
 * Поиск ближайшей структуры для ремонта
 */
Creep.prototype.findNearestRepairableStructure = function() {
    return this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => {
            return structure.hits < structure.hitsMax &&
                   (structure.structureType === STRUCTURE_ROAD ||
                    structure.structureType === STRUCTURE_CONTAINER ||
                    structure.structureType === STRUCTURE_WALL ||
                    structure.structureType === STRUCTURE_RAMPART);
        }
    });
}

/**
 * Приоритетный ремонт (по важности структур)
 */
Creep.prototype.prioritizeRepair = function() {
    // Сначала ремонтируем дороги и контейнеры
    const priorityStructures = this.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (structure) => {
            return structure.hits < structure.hitsMax &&
                   (structure.structureType === STRUCTURE_ROAD ||
                    structure.structureType === STRUCTURE_CONTAINER);
        }
    });
    
    if (priorityStructures.length > 0) {
        return priorityStructures[0];
    }
    
    // Затем стены и бастионы
    const defensiveStructures = this.pos.findInRange(FIND_STRUCTURES, 3, {
        filter: (structure) => {
            return structure.hits < structure.hitsMax &&
                   (structure.structureType === STRUCTURE_WALL ||
                    structure.structureType === STRUCTURE_RAMPART);
        }
    });
    
    return defensiveStructures[0] || null;
}

/**
 * Проверка прогресса ремонта
 */
Creep.prototype.checkRepairProgress = function() {
    const task = this.getTask();
    
    if (!task) {
        return 0;
    }
    
    const structure = Game.getObjectById(task.target);
    
    if (!structure) {
        return 0;
    }
    
    return structure.hits / structure.hitsMax;
}

module.exports = {};