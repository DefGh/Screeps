/**
 * Роль: Taxi (Такси)
 * Особенности: Доставка майнеров на место работы, имеет ноги для перемещения
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления такси
 */
function run(creep) {
    // Если такси не имеет задачи, ищем доставку майнера
    if (!creep.hasTask()) {
        assignTaxiTask(creep);
    }
    
    // Выполняем основную логику
    if (creep.hasTask()) {
        performDelivery(creep);
    } else {
        // Если нет задачи, ищем свободную задачу
        findAndAssignTask(creep);
    }
}

/**
 * Назначение задачи такси
 */
function assignTaxiTask(creep) {
    const availableTasks = creep.getAvailableTasks();
    const deliveryTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.DELIVER_MINER);
    
    if (deliveryTasks.length > 0) {
        const task = deliveryTasks[0]; // Берем первую доступную задачу
        
        if (creep.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение доставки майнера
 */
function performDelivery(creep) {
    const task = creep.getTask();
    
    if (!task) {
        creep.releaseTask();
        return;
    }
    
    const source = Game.getObjectById(task.target);
    
    if (!source) {
        // Источник не существует
        creep.releaseTask();
        return;
    }
    
    // Ищем майнера для доставки
    const miner = findMinerForDelivery(creep, source);
    
    if (miner) {
        // Найден майнер для доставки
        if (creep.pos.isEqualTo(source.pos)) {
            // Майнер доставлен, завершаем задачу
            creep.completeTask();
        } else {
            // Двигаемся к источнику с майнером
            creep.moveTo(source);
        }
    } else {
        // Нет майнера для доставки
        creep.releaseTask();
    }
}

/**
 * Поиск майнера для доставки
 */
function findMinerForDelivery(taxi, source) {
    // Ищем майнера, который не привязан к источнику и находится рядом с такси
    const miners = taxi.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: (creep) => 
            creep.memory.role === taskManager.ROLE.MINER && 
            !creep.memory.sourceId &&
            !creep.hasTask()
    });
    
    return miners[0] || null;
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
 * Проверка состояния такси
 */
function checkTaxiStatus(creep) {
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
 * Доставка майнера к источнику
 */
function deliverMinerToSource(taxi, miner, source) {
    if (!taxi || !miner || !source) {
        return false;
    }
    
    // Проверяем, может ли такси взять майнера
    if (taxi.carryCapacity > 0 && taxi.carry[RESOURCE_ENERGY] === 0) {
        // Такси может взять майнера
        if (taxi.pos.isEqualTo(miner.pos)) {
            // Такси рядом с майнером, берем его
            return true;
        } else {
            // Двигаемся к майнеру
            taxi.moveTo(miner);
            return false;
        }
    } else {
        // Такси не может взять майнера
        return false;
    }
}

/**
 * Выгрузка майнера у источника
 */
function unloadMinerAtSource(taxi, source) {
    if (!taxi || !source) {
        return false;
    }
    
    if (taxi.pos.isEqualTo(source.pos)) {
        // Выгружаем майнера
        return true;
    } else {
        // Двигаемся к источнику
        taxi.moveTo(source);
        return false;
    }
}

module.exports = {
    run,
    assignTaxiTask,
    performDelivery,
    findMinerForDelivery,
    findAndAssignTask,
    checkTaxiStatus,
    deliverMinerToSource,
    unloadMinerAtSource
};