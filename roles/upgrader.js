/**
 * Роль: Upgrader (Апгрейдер)
 * Особенности: Апгрейд контроллера, имеет WORK и CARRY части
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления апгрейдером
 */
function run(creep) {
    // Если апгрейдер не имеет задачи, ищем задачу апгрейда
    if (!creep.hasTask()) {
        assignUpgraderTask(creep);
    }
    
    // Выполняем основную логику
    if (creep.hasTask()) {
        performUpgrade(creep);
    } else {
        // Если нет задачи, ищем свободную задачу
        findAndAssignTask(creep);
    }
}

/**
 * Назначение задачи апгрейдеру
 */
function assignUpgraderTask(creep) {
    const availableTasks = creep.getAvailableTasks();
    const upgradeTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.UPGRADE);
    
    if (upgradeTasks.length > 0) {
        const task = upgradeTasks[0]; // Берем первую доступную задачу
        
        if (creep.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение апгрейда контроллера
 */
function performUpgrade(creep) {
    const task = creep.getTask();
    
    if (!task) {
        creep.releaseTask();
        return;
    }
    
    const controller = Game.getObjectById(task.target);
    
    if (!controller) {
        // Контроллер не существует
        creep.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (creep.carry.energy === 0) {
        // Нужно заполниться энергией
        performRefill(creep);
        return;
    }
    
    // Апгрейдим контроллер
    const result = creep.upgradeController(controller);
    
    if (result === OK) {
        // Успешно апгрейднули
        creep.updateTaskProgress(creep.carry.energy);
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к контроллеру
        creep.moveTo(controller);
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
 * Проверка состояния апгрейдера
 */
function checkUpgraderStatus(creep) {
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
 * Поиск контроллера для апгрейда
 */
function findController(creep) {
    return creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER
    });
}

/**
 * Оптимизация апгрейда (работа в группе)
 */
function optimizeUpgrade(creep) {
    // Логика оптимизации группового апгрейда
    // Пока оставим заглушку
}

/**
 * Проверка прогресса апгрейда
 */
function checkUpgradeProgress(creep) {
    const task = creep.getTask();
    
    if (!task) {
        return 0;
    }
    
    const controller = Game.getObjectById(task.target);
    
    if (!controller) {
        return 0;
    }
    
    return controller.progress / controller.progressTotal;
}

/**
 * Проверка уровня контроллера
 */
function checkControllerLevel(creep) {
    const controller = findController(creep);
    
    if (!controller) {
        return 0;
    }
    
    return controller.level;
}

module.exports = {
    run,
    assignUpgraderTask,
    performUpgrade,
    performRefill,
    findAndAssignTask,
    checkUpgraderStatus,
    findController,
    optimizeUpgrade,
    checkUpgradeProgress,
    checkControllerLevel
};