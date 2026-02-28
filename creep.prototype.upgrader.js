/**
 * Прототип для роли Upgrader (Апгрейдер)
 * Особенности: Апгрейд контроллера, имеет WORK и CARRY части
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления апгрейдером
 */
Creep.prototype.runUpgrader = function() {
    // Если апгрейдер не имеет задачи, ищем задачу апгрейда
    if (!this.hasTask()) {
        this.assignUpgraderTask();
    }
    
    // Выполняем основную логику
    if (this.hasTask()) {
        this.performUpgrade();
    } else {
        // Если нет задачи, ищем свободную задачу
        this.findAndAssignTask();
    }
}

/**
 * Назначение задачи апгрейдеру
 */
Creep.prototype.assignUpgraderTask = function() {
    const availableTasks = this.getAvailableTasks();
    const upgradeTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.UPGRADE);
    
    if (upgradeTasks.length > 0) {
        const task = upgradeTasks[0]; // Берем первую доступную задачу
        
        if (this.assignTask(task.id)) {
            // Задача назначена
        }
    }
}

/**
 * Выполнение апгрейда контроллера
 */
Creep.prototype.performUpgrade = function() {
    const task = this.getTask();
    
    if (!task) {
        this.releaseTask();
        return;
    }
    
    const controller = Game.getObjectById(task.target);
    
    if (!controller) {
        // Контроллер не существует
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (this.carry.energy === 0) {
        // Нужно заполниться энергией
        this.performRefill();
        return;
    }
    
    // Апгрейдим контроллер
    const result = this.upgradeController(controller);
    
    if (result === OK) {
        // Успешно апгрейднули
        this.updateTaskProgress(this.carry.energy);
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к контроллеру
        this.moveTo(controller);
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
 * Проверка состояния апгрейдера
 */
Creep.prototype.checkUpgraderStatus = function() {
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
 * Поиск контроллера для апгрейда
 */
Creep.prototype.findController = function() {
    return this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTROLLER
    });
}

/**
 * Оптимизация апгрейда (работа в группе)
 */
Creep.prototype.optimizeUpgrade = function() {
    // Логика оптимизации группового апгрейда
    // Пока оставим заглушку
}

/**
 * Проверка прогресса апгрейда
 */
Creep.prototype.checkUpgradeProgress = function() {
    const task = this.getTask();
    
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
Creep.prototype.checkControllerLevel = function() {
    const controller = this.findController();
    
    if (!controller) {
        return 0;
    }
    
    return controller.level;
}

module.exports = {};