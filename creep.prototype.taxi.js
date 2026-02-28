/**
 * Прототип для роли Taxi (Такси)
 * Особенности: Доставка майнеров на место работы, имеет ноги для перемещения
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления такси
 */
Creep.prototype.runTaxi = function() {
    // Если такси не имеет задачи, ищем доставку майнера
    if (!this.hasTask()) {
        this.assignTaxiTask();
    }
    
    // Выполняем основную логику
    if (this.hasTask()) {
        this.performDelivery();
    } else {
        // Если нет задачи, ищем свободную задачу
        this.findAndAssignTask();
    }
}

/**
 * Назначение задачи такси
 */
Creep.prototype.assignTaxiTask = function() {
    const availableTasks = this.getAvailableTasks();
    const deliveryTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.DELIVER_MINER);
    
    if (deliveryTasks.length > 0) {
        const task = deliveryTasks[0]; // Берем первую доступную задачу
        
        if (this.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение доставки майнера
 */
Creep.prototype.performDelivery = function() {
    const task = this.getTask();
    
    if (!task) {
        this.releaseTask();
        return;
    }
    
    const source = Game.getObjectById(task.target);
    
    if (!source) {
        // Источник не существует
        this.releaseTask();
        return;
    }
    
    // Ищем майнера для доставки
    const miner = this.findMinerForDelivery(source);
    
    if (miner) {
        // Найден майнер для доставки
        if (this.pos.isEqualTo(source.pos)) {
            // Майнер доставлен, завершаем задачу
            this.completeTask();
        } else {
            // Двигаемся к источнику с майнером
            this.moveTo(source);
        }
    } else {
        // Нет майнера для доставки
        this.releaseTask();
    }
}

/**
 * Поиск майнера для доставки
 */
Creep.prototype.findMinerForDelivery = function(taxi, source) {
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
 * Проверка состояния такси
 */
Creep.prototype.checkTaxiStatus = function() {
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
 * Доставка майнера к источнику
 */
Creep.prototype.deliverMinerToSource = function(taxi, miner, source) {
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
Creep.prototype.unloadMinerAtSource = function(taxi, source) {
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

module.exports = {};