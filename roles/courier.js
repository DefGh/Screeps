/**
 * Роль: Courier (Курьер)
 * Особенности: Транспортировка ресурсов из куч, имеет CARRY части для переноски
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления курьером
 */
function run(creep) {
    // Если курьер не имеет задачи, ищем задачу сбора из кучи
    if (!creep.hasTask()) {
        assignCourierTask(creep);
    }
    
    // Выполняем основную логику
    if (creep.hasTask()) {
        performCollection(creep);
    } else {
        // Если нет задачи, ищем свободную задачу
        findAndAssignTask(creep);
    }
}

/**
 * Назначение задачи курьеру
 */
function assignCourierTask(creep) {
    const availableTasks = creep.getAvailableTasks();
    const collectTasks = availableTasks.filter(task => 
        task.type === taskManager.TASK_TYPE.COLLECT_FROM_PILE ||
        task.type === taskManager.TASK_TYPE.TRANSPORT
    );
    
    if (collectTasks.length > 0) {
        const task = collectTasks[0]; // Берем первую доступную задачу
        
        if (creep.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение сбора ресурсов
 */
function performCollection(creep) {
    const task = creep.getTask();
    
    if (!task) {
        creep.releaseTask();
        return;
    }
    
    switch (task.type) {
        case taskManager.TASK_TYPE.COLLECT_FROM_PILE:
            performCollectFromPile(creep, task);
            break;
        case taskManager.TASK_TYPE.TRANSPORT:
            performTransport(creep, task);
            break;
        default:
            creep.releaseTask();
            break;
    }
}

/**
 * Сбор из кучи
 */
function performCollectFromPile(creep, task) {
    const pile = Game.getObjectById(task.target);
    
    if (!pile) {
        // Куча не существует
        creep.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип
    if (creep.carry.energy >= creep.carryCapacity) {
        // Крип полон, идем выгружать
        performUnload(creep);
        return;
    }
    
    // Собираем ресурсы из кучи
    const result = creep.pickup(pile);
    
    if (result === OK) {
        // Успешно подобрали ресурс
        creep.updateTaskProgress(creep.carry.energy);
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к куче
        creep.moveTo(pile);
    } else if (result === ERR_FULL) {
        // Крип полон, идем выгружать
        performUnload(creep);
    }
}

/**
 * Транспортировка ресурсов
 */
function performTransport(creep, task) {
    // Логика транспортировки между точками
    // Пока оставим заглушку
    if (creep.carry.energy === 0) {
        // Нужно загрузиться
        performLoad(creep, task);
    } else {
        // Нужно выгрузиться
        performUnload(creep);
    }
}

/**
 * Загрузка ресурсов
 */
function performLoad(creep, task) {
    const source = Game.getObjectById(task.source);
    
    if (!source) {
        return;
    }
    
    if (creep.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source);
    }
}

/**
 * Выгрузка ресурсов
 */
function performUnload(creep) {
    // Ищем место для выгрузки
    const targets = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) => {
            return (structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_STORAGE) &&
                   structure.energy < structure.energyCapacity;
        }
    });
    
    if (targets.length > 0) {
        // Найдено место для выгрузки
        if (creep.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(targets[0]);
        }
    } else {
        // Ищем другие структуры для выгрузки
        const containers = creep.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                       structure.store[RESOURCE_ENERGY] < structure.storeCapacity;
            }
        });
        
        if (containers.length > 0) {
            if (creep.transfer(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(containers[0]);
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
 * Проверка состояния курьера
 */
function checkCourierStatus(creep) {
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
 * Оптимизация маршрута для сбора
 */
function optimizeCollectionRoute(creep) {
    // Логика оптимизации маршрута сбора
    // Пока оставим заглушку
}

module.exports = {
    run,
    assignCourierTask,
    performCollection,
    performCollectFromPile,
    performTransport,
    performLoad,
    performUnload,
    findAndAssignTask,
    checkCourierStatus,
    optimizeCollectionRoute
};