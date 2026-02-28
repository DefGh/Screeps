const taskManager = require('./taskManager');
const roomScanner = require('./roomScanner');
const creepPrototype = require('./creepPrototype');

// Подключаем прототипы ролей
require('./creep.prototype.miner');
require('./creep.prototype.courier');
require('./creep.prototype.builder');
require('./creep.prototype.repairer');
require('./creep.prototype.upgrader');
require('./creep.prototype.universal');

const spawnerManager = require('./spawnerManager');

module.exports.loop = function () {
    // Инициализация системы задач
    taskManager.initGameTasks();
    
    // Очистка завершенных задач (раз в 100 тиков)
    taskManager.cleanupCompletedTasks();
    
    // Основной цикл управления
    manageGame();
}

/**
 * Основная функция управления игрой
 */
function manageGame() {
    // 1. Сканирование комнат и создание задач (раз в 15 тиков)
    if (Game.time % 15 === 0) {
        scanRooms();
        validateTasks();
    }
    
    // 2. Управление спавнерами
    spawnerManager.manageSpawners();
    
    // 3. Управление крипами
    manageCreeps();
    
    // 4. Логирование состояния системы (раз в 100 тиков)
    if (Game.time % 100 === 0) {
        logSystemStatus();
    }
}

/**
 * Сканирование всех комнат
 */
function scanRooms() {
    const rooms = Object.values(Game.rooms);
    
    rooms.forEach(room => {
        console.log(`Scanning room: ${room.name}`);
        roomScanner.scanRoom(room);
    });
}

/**
 * Проверка актуальности задач
 */
function validateTasks() {
    console.log('Validating tasks...');
    roomScanner.validateTasks();
}

/**
 * Управление крипами
 */
function manageCreeps() {
    const creeps = Object.values(Game.creeps);
    
    creeps.forEach(creep => {
        // Если крип не имеет роли, пропускаем
        if (!creep.memory.role) {
            return;
        }
        
        // Обработка в зависимости от роли через прототипы
        switch (creep.memory.role) {
            case taskManager.ROLE.MINER:
                creep.runMiner();
                break;
            case taskManager.ROLE.COURIER:
                creep.runCourier();
                break;
            case taskManager.ROLE.BUILDER:
                creep.runBuilder();
                break;
            case taskManager.ROLE.REPAIRER:
                creep.runRepairer();
                break;
            case taskManager.ROLE.UPGRADER:
                creep.runUpgrader();
                break;
            case taskManager.ROLE.UNIVERSAL:
                creep.runUniversal();
                break;
        }
    });
}

/**
 * Логирование состояния системы
 */
function logSystemStatus() {
    const tasks = taskManager.getAllTasks();
    const creeps = Object.values(Game.creeps);
    
    console.log(`=== System Status (Tick ${Game.time}) ===`);
    console.log(`Total tasks: ${tasks.length}`);
    console.log(`Total creeps: ${creeps.length}`);
    
    // Статистика по задачам
    const taskStats = {};
    tasks.forEach(task => {
        if (!taskStats[task.type]) {
            taskStats[task.type] = 0;
        }
        taskStats[task.type]++;
    });
    
    console.log('Task distribution:', taskStats);
    
    // Статистика по крипам
    const creepStats = {};
    creeps.forEach(creep => {
        const role = creep.memory.role || 'unknown';
        if (!creepStats[role]) {
            creepStats[role] = 0;
        }
        creepStats[role]++;
    });
    
    console.log('Creep distribution:', creepStats);
    console.log('=====================================');
}

/**
 * Функция для ручного создания задач (для отладки)
 */
function createDebugTasks() {
    // Пример создания задачи вручную
    const room = Object.values(Game.rooms)[0];
    if (room) {
        taskManager.createTask(
            taskManager.TASK_TYPE.UPGRADE,
            room.controller.id,
            room.name,
            taskManager.PRIORITY.HIGH,
            [taskManager.ROLE.UPGRADER],
            true
        );
    }
}
