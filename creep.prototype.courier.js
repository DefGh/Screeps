/**
 * Прототип для роли Courier (Курьер)
 * Особенности: Транспортировка ресурсов из куч, имеет CARRY части для переноски
 */

const taskManager = require('./taskManager');

/**
 * Основная функция управления курьером
 */
Creep.prototype.runCourier = function() {
    // Если курьер не имеет задачи, ищем задачу сбора из кучи
    if (!this.hasTask()) {
        this.assignCourierTask();
    }
    
    // Выполняем основную логику
    if (this.hasTask()) {
        this.performCollection();
    } else {
        // Если нет задачи, ищем свободную задачу
        this.findAndAssignTask();
    }
}

/**
 * Назначение задачи курьеру
 */
Creep.prototype.assignCourierTask = function() {
    const availableTasks = this.getAvailableTasks();
    const collectTasks = availableTasks.filter(task => 
        task.type === taskManager.TASK_TYPE.COLLECT_FROM_PILE ||
        task.type === taskManager.TASK_TYPE.TRANSPORT
    );
    
    if (collectTasks.length > 0) {
        const task = collectTasks[0]; // Берем первую доступную задачу
        
        if (this.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение сбора ресурсов
 */
Creep.prototype.performCollection = function() {
    const task = this.getTask();
    
    if (!task) {
        this.releaseTask();
        return;
    }
    
    switch (task.type) {
        case taskManager.TASK_TYPE.COLLECT_FROM_PILE:
            this.performCollectFromPile(task);
            break;
        case taskManager.TASK_TYPE.TRANSPORT:
            this.performTransport(task);
            break;
        default:
            this.releaseTask();
            break;
    }
}

/**
 * Сбор из кучи
 */
Creep.prototype.performCollectFromPile = function(task) {
    const pile = Game.getObjectById(task.target);
    
    if (!pile) {
        // Куча не существует
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип
    if (this.carry.energy >= this.carryCapacity) {
        // Крип полон, идем выгружать
        this.performUnload();
        return;
    }
    
    // Собираем ресурсы из кучи
    const result = this.pickup(pile);
    
    if (result === OK) {
        // Успешно подобрали ресурс
        this.updateTaskProgress(this.carry.energy);
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к куче
        this.moveTo(pile);
    } else if (result === ERR_FULL) {
        // Крип полон, идем выгружать
        this.performUnload();
    }
}

/**
 * Транспортировка ресурсов
 */
Creep.prototype.performTransport = function(task) {
    // Логика транспортировки между точками
    // Пока оставим заглушку
    if (this.carry.energy === 0) {
        // Нужно загрузиться
        this.performLoad(task);
    } else {
        // Нужно выгрузиться
        this.performUnload();
    }
}

/**
 * Загрузка ресурсов
 */
Creep.prototype.performLoad = function(task) {
    const source = Game.getObjectById(task.source);
    
    if (!source) {
        return;
    }
    
    if (this.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(source);
    }
}

/**
 * Выгрузка ресурсов
 */
Creep.prototype.performUnload = function() {
    // Ищем место для выгрузки
    const targets = this.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) => {
            return (structure.structureType === STRUCTURE_EXTENSION ||
                    structure.structureType === STRUCTURE_SPAWN ||
                    structure.structureType === STRUCTURE_STORAGE) &&
                   structure.energy < structure.energyCapacity;
        }
    });
    
    if (targets.length > 0) {
        // Найдено место для выгрузки
        if (this.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            this.moveTo(targets[0]);
        }
    } else {
        // Ищем другие структуры для выгрузки
        const containers = this.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_CONTAINER &&
                       structure.store[RESOURCE_ENERGY] < structure.storeCapacity;
            }
        });
        
        if (containers.length > 0) {
            if (this.transfer(containers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.moveTo(containers[0]);
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
 * Проверка состояния курьера
 */
Creep.prototype.checkCourierStatus = function() {
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
 * Оптимизация маршрута для сбора
 */
Creep.prototype.optimizeCollectionRoute = function() {
    // Логика оптимизации маршрута сбора
    // Пока оставим заглушку
}

module.exports = {};