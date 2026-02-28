/**
 * Роль: Repairer (Ремонтник)
 * Особенности: Ремонт структур, имеет WORK и CARRY части
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления ремонтником
 */
function run(creep) {
    // Если ремонтник не имеет задачи, ищем задачу ремонта
    if (!creep.hasTask()) {
        assignRepairerTask(creep);
    }
    
    // Выполняем основную логику
    if (creep.hasTask()) {
        performRepair(creep);
    } else {
        // Если нет задачи, ищем свободную задачу
        findAndAssignTask(creep);
    }
}

/**
 * Назначение задачи ремонтнику
 */
function assignRepairerTask(creep) {
    const availableTasks = creep.getAvailableTasks();
    const repairTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.REPAIR);
    
    if (repairTasks.length > 0) {
        const task = repairTasks[0]; // Берем первую доступную задачу
        
        if (creep.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение ремонта
 */
function performRepair(creep) {
    const task = creep.getTask();
    
    if (!task) {
        creep.releaseTask();
        return;
    }
    
    const structure = Game.getObjectById(task.target);
    
    if (!structure) {
        // Структура не существует
        creep.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (creep.carry.energy === 0) {
        // Нужно заполниться энергией
        performRefill(creep);
        return;
    }
    
    // Ремонтируем структуру
    const result = creep.repair(structure);
    
    if (result === OK) {
        // Успешно отремонтировали
        creep.updateTaskProgress(creep.carry.energy);
        
        // Проверяем, завершен ли ремонт
        if (structure.hits >= structure.hitsMax) {
            creep.completeTask();
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к структуре
        creep.moveTo(structure);
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Нужно заполниться энергией
        performRefill(creep);
    }
}

/**
 * Заполнение энергии
 */
function performRefill(creep) {
    // Ищем источник энергии для заполнения
    const storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => {
            return (structure.structureType === STRUCTURE_STORAGE ||
                    structure.structureType === STRUCTURE_CONTAINER) &&
                   structure.store[RESOURCE_ENERGY] > 0;
        }
    });
    
    if (storage) {
        if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(storage);
        }
    } else {
        // Ищем спавнеры или экстеншены
        const spawns = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
            filter: (spawn) => spawn.energy > 0
        });
        
        if (spawns) {
            if (creep.withdraw(spawns, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(spawns);
            }
        }
    }
}

/**
 * Поиск и назначение задачи
 */
function findAndAssignTask(creep) {
    const bestTask = creep.findBestTask();
    
    if (bestTask) {
        if (creep.assignTask(bestTask.id)) {
            // Задача назначена, начинаем выполнение
            creep.performTask();
        }
    }
}

/**
 * Проверка состояния ремонтника
 */
function checkRepairerStatus(creep) {
    // Проверяем, жив ли крип
    if (!creep) {
        return false;
    }
    
    // Проверяем, не умер ли крип
    if (creep.spawning) {
        return true;
    }
    
    // Проверяем, есть ли задача
    if (creep.hasTask()) {
        const task = creep.getTask();
        if (!task || task.state === 'COMPLETED') {
            creep.releaseTask();
        }
    }
    
    return true;
}

/**
 * Поиск ближайшей структуры для ремонта
 */
function findNearestRepairableStructure(creep) {
    return creep.pos.findClosestByRange(FIND_STRUCTURES, {
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
function prioritizeRepair(creep) {
    // Сначала ремонтируем дороги и контейнеры
    const priorityStructures = creep.pos.findInRange(FIND_STRUCTURES, 3, {
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
    const defensiveStructures = creep.pos.findInRange(FIND_STRUCTURES, 3, {
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
function checkRepairProgress(creep) {
    const task = creep.getTask();
    
    if (!task) {
        return 0;
    }
    
    const structure = Game.getObjectById(task.target);
    
    if (!structure) {
        return 0;
    }
    
    return structure.hits / structure.hitsMax;
}

module.exports = {
    run,
    assignRepairerTask,
    performRepair,
    performRefill,
    findAndAssignTask,
    checkRepairerStatus,
    findNearestRepairableStructure,
    prioritizeRepair,
    checkRepairProgress
};