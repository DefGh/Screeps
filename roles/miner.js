/**
 * Роль: Miner (Майнер)
 * Особенности: Копает энергию под себя, не имеет ног, привязан к источнику
 */

const taskManager = require('../taskManager');

/**
 * Основная функция управления майнером
 */
function run(creep) {
    // Если майнер не имеет привязанного источника, ищем задачу
    if (!creep.memory.sourceId) {
        assignMinerToSource(creep);
    }
    
    // Выполняем основную логику
    if (creep.memory.sourceId) {
        performMining(creep);
    } else {
        // Если нет источника, ищем свободную задачу
        findAndAssignTask(creep);
    }
}

/**
 * Назначение майнера на источник
 */
function assignMinerToSource(creep) {
    const availableTasks = creep.getAvailableTasks();
    const mineTasks = availableTasks.filter(task => task.type === taskManager.TASK_TYPE.MINE_SOURCE);
    
    if (mineTasks.length > 0) {
        const task = mineTasks[0]; // Берем первую доступную задачу
        
        if (creep.assignTask(task.id)) {
            creep.memory.sourceId = task.target;
            creep.memory.role = taskManager.ROLE.MINER;
        }
    }
}

/**
 * Выполнение добычи энергии
 */
function performMining(creep) {
    const source = Game.getObjectById(creep.memory.sourceId);
    
    if (!source) {
        // Источник не существует, сбрасываем привязку
        creep.memory.sourceId = null;
        creep.releaseTask();
        return;
    }
    
    // Проверяем, находится ли майнер на месте
    if (!creep.pos.isEqualTo(source.pos)) {
        // Майнер не на месте, но он не может ходить (без ног)
        // Ждем, пока такси доставит его
        return;
    }
    
    // Добываем энергию
    const result = creep.harvest(source);
    
    if (result === OK) {
        // Успешно добываем энергию
        // Проверяем, нужно ли обновить прогресс задачи
        const task = creep.getTask();
        if (task) {
            creep.updateTaskProgress(task.progress + 1);
        }
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Источник пуст, задача завершена
        creep.completeTask();
        creep.memory.sourceId = null;
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
 * Проверка состояния майнера
 */
function checkMinerStatus(creep) {
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
            creep.memory.sourceId = null;
        }
    }
    
    return true;
}

/**
 * Логика доставки майнером (если майнер используется для доставки)
 */
function deliverMiner(creep) {
    // Эта функция может быть использована, если майнеру нужно доставить что-то
    // Пока оставим заглушку
}

module.exports = {
    run,
    assignMinerToSource,
    performMining,
    findAndAssignTask,
    checkMinerStatus,
    deliverMiner
};