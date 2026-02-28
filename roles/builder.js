/**
 * Роль: Builder (Строитель)
 * Особенности: Строительство конструкций, имеет WORK и CARRY части
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления строителем
 */
function run(creep) {
    // Если строитель не имеет задачи, ищем задачу строительства
    if (!creep.hasTask()) {
        assignBuilderTask(creep);
    }
    
    // Выполняем основную логику
    if (creep.hasTask()) {
        performBuilding(creep);
    } else {
        // Если нет задачи, ищем свободную задачу
        findAndAssignTask(creep);
    }
}

/**
 * Назначение задачи строителю
 */
function assignBuilderTask(creep) {
    const availableTasks = creep.getAvailableTasks();
    const buildTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.BUILD);
    
    if (buildTasks.length > 0) {
        const task = buildTasks[0]; // Берем первую доступную задачу
        
        if (creep.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение строительства
 */
function performBuilding(creep) {
    const task = creep.getTask();
    
    if (!task) {
        creep.releaseTask();
        return;
    }
    
    const site = Game.getObjectById(task.target);
    
    if (!site) {
        // Строительная площадка не существует
        creep.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (creep.carry.energy === 0) {
        // Нужно заполниться энергией
        performRefill(creep);
        return;
    }
    
    // Строим конструкцию
    const result = creep.build(site);
    
    if (result === OK) {
        // Успешно построили
        creep.updateTaskProgress(creep.carry.energy);
        
        // Проверяем, завершена ли постройка
        if (site.progress >= site.progressTotal) {
            creep.completeTask();
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к строительной площадке
        creep.moveTo(site);
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
 * Проверка состояния строителя
 */
function checkBuilderStatus(creep) {
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
 * Поиск ближайшей строительной площадки
 */
function findNearestConstructionSite(creep) {
    return creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);
}

/**
 * Оптимизация строительства (групповая работа)
 */
function optimizeBuilding(creep) {
    // Логика оптимизации группового строительства
    // Пока оставим заглушку
}

/**
 * Проверка прогресса строительства
 */
function checkBuildingProgress(creep) {
    const task = creep.getTask();
    
    if (!task) {
        return 0;
    }
    
    const site = Game.getObjectById(task.target);
    
    if (!site) {
        return 0;
    }
    
    return site.progress / site.progressTotal;
}

module.exports = {
    run,
    assignBuilderTask,
    performBuilding,
    performRefill,
    findAndAssignTask,
    checkBuilderStatus,
    findNearestConstructionSite,
    optimizeBuilding,
    checkBuildingProgress
};