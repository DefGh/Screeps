/**
 * Прототип для роли Miner (Майнер)
 * Особенности: Копает энергию под себя, не имеет ног, привязан к источнику
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления майнером
 */
Creep.prototype.runMiner = function() {
    // Если майнер не имеет привязанного источника, ищем задачу
    if (!this.memory.sourceId) {
        this.assignMinerToSource();
    }
    
    // Выполняем основную логику
    if (this.memory.sourceId) {
        this.performMining();
    } else {
        // Если нет источника, ищем свободную задачу
        this.findAndAssignTask();
    }
}

/**
 * Назначение майнера на источник
 */
Creep.prototype.assignMinerToSource = function() {
    const availableTasks = this.getAvailableTasks();
    const mineTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.MINE_SOURCE);
    
    if (mineTasks.length > 0) {
        const task = mineTasks[0]; // Берем первую доступную задачу
        
        if (this.assignTask(task.id)) {
            this.memory.sourceId = task.target;
            this.memory.role = taskManager.ROLE.MINER;
        }
    }
}

/**
 * Выполнение добычи энергии
 */
Creep.prototype.performMining = function() {
    const source = Game.getObjectById(this.memory.sourceId);
    
    if (!source) {
        // Источник не существует, сбрасываем привязку
        this.memory.sourceId = null;
        this.releaseTask();
        return;
    }
    
    // Проверяем, находится ли майнер на месте
    if (!this.pos.isEqualTo(source.pos)) {
        // Майнер не на месте, но он не может ходить (без ног)
        // Ждем, пока такси доставит его
        return;
    }
    
    // Добываем энергию
    const result = this.harvest(source);
    
    if (result === OK) {
        // Успешно добываем энергию
        // Проверяем, нужно ли обновить прогресс задачи
        const task = this.getTask();
        if (task) {
            this.updateTaskProgress(task.progress + 1);
        }
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Источник пуст, задача завершена
        this.completeTask();
        this.memory.sourceId = null;
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
 * Проверка состояния майнера
 */
Creep.prototype.checkMinerStatus = function() {
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
            this.memory.sourceId = null;
        }
    }
    
    return true;
}

/**
 * Логика доставки майнером (если майнер используется для доставки)
 */
Creep.prototype.deliverMiner = function() {
    // Эта функция может быть использована, если майнеру нужно доставить что-то
    // Пока оставим заглушку
}

module.exports = {};