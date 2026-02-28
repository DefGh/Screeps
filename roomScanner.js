 не /**
 * Сканер комнат для автоматического создания задач
 * Анализирует состояние комнаты и создает соответствующие задачи
 */

const taskManager = require('./taskManager');

/**
 * Сканирование комнаты и создание задач
 */
function scanRoom(room) {
    if (!room || !room.controller) {
        return;
    }
    
    const roomName = room.name;
    
    // Создаем задачи для источников энергии
    scanSources(room);
    
    // Создаем задачи для строительства
    scanConstructionSites(room);
    
    // Создаем задачи для ремонта
    scanStructures(room);
    
    // Создаем задачи для апгрейда контроллера
    scanController(room);
    
    // Создаем задачи для спавнеров
    scanSpawners(room);
    
    // Создаем задачи для куч ресурсов
    scanResourcePiles(room);
}

/**
 * Сканирование источников энергии
 */
function scanSources(room) {
    const sources = room.find(FIND_SOURCES);
    const existingTasks = taskManager.getTasksByType(taskManager.TASK_TYPE.MINE_SOURCE);
    const existingSourceIds = existingTasks.map(task => task.target);
    
    sources.forEach(source => {
        // Проверяем, есть ли уже задача для этого источника
        if (!existingSourceIds.includes(source.id)) {
            // Создаем задачу добычи для каждого источника
            taskManager.createTask(
                taskManager.TASK_TYPE.MINE_SOURCE,
                source.id,
                room.name,
                taskManager.PRIORITY.HIGH,
                [taskManager.ROLE.MINER],
                true // Бесконечная задача
            );
            
            // Создаем задачу доставки майнера
            taskManager.createTask(
                taskManager.TASK_TYPE.DELIVER_MINER,
                source.id, // Цель - источник, куда доставить майнера
                room.name,
                taskManager.PRIORITY.HIGH,
                [taskManager.ROLE.TAXI]
            );
        }
    });
}

/**
 * Сканирование строительных площадок
 */
function scanConstructionSites(room) {
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    const existingTasks = taskManager.getTasksByType(taskManager.TASK_TYPE.BUILD);
    const existingSiteIds = existingTasks.map(task => task.target);
    
    constructionSites.forEach(site => {
        if (!existingSiteIds.includes(site.id)) {
            taskManager.createTask(
                taskManager.TASK_TYPE.BUILD,
                site.id,
                room.name,
                taskManager.PRIORITY.MEDIUM,
                [taskManager.ROLE.BUILDER, taskManager.ROLE.REPAIRER]
            );
        }
    });
}

/**
 * Сканирование структур для ремонта
 */
function scanStructures(room) {
    const structures = room.find(FIND_STRUCTURES, {
        filter: (structure) => {
            // Ремонтируем только определенные типы структур
            return structure.hits < structure.hitsMax && 
                   (structure.structureType === STRUCTURE_ROAD ||
                    structure.structureType === STRUCTURE_CONTAINER ||
                    structure.structureType === STRUCTURE_WALL ||
                    structure.structureType === STRUCTURE_RAMPART);
        }
    });
    
    const existingTasks = taskManager.getTasksByType(taskManager.TASK_TYPE.REPAIR);
    const existingStructureIds = existingTasks.map(task => task.target);
    
    structures.forEach(structure => {
        if (!existingStructureIds.includes(structure.id)) {
            const priority = structure.structureType === STRUCTURE_WALL || 
                           structure.structureType === STRUCTURE_RAMPART 
                           ? taskManager.PRIORITY.LOW : taskManager.PRIORITY.MEDIUM;
            
            taskManager.createTask(
                taskManager.TASK_TYPE.REPAIR,
                structure.id,
                room.name,
                priority,
                [taskManager.ROLE.REPAIRER]
            );
        }
    });
}

/**
 * Сканирование контроллера для апгрейда
 */
function scanController(room) {
    if (room.controller && room.controller.my) {
        const existingTasks = taskManager.getTasksByType(taskManager.TASK_TYPE.UPGRADE);
        const hasUpgradeTask = existingTasks.some(task => task.target === room.controller.id);
        
        if (!hasUpgradeTask) {
            taskManager.createTask(
                taskManager.TASK_TYPE.UPGRADE,
                room.controller.id,
                room.name,
                taskManager.PRIORITY.MEDIUM,
                [taskManager.ROLE.UPGRADER],
                true // Бесконечная задача
            );
        }
    }
}

/**
 * Сканирование спавнеров
 */
function scanSpawners(room) {
    const spawners = room.find(FIND_MY_SPAWNS);
    
    spawners.forEach(spawner => {
        // Проверяем, есть ли задача для этого спавнера
        const existingTasks = taskManager.getTasksByType(taskManager.TASK_TYPE.SPAWN_CREEP);
        const hasTask = existingTasks.some(task => task.target === spawner.id);
        
        if (!hasTask) {
            taskManager.createTask(
                taskManager.TASK_TYPE.SPAWN_CREEP,
                spawner.id,
                room.name,
                taskManager.PRIORITY.MEDIUM,
                [taskManager.ROLE.SPAWNER]
            );
        }
    });
}

/**
 * Сканирование куч ресурсов
 */
function scanResourcePiles(room) {
    // Ищем кучи энергии и других ресурсов
    const energyPiles = room.find(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY
    });
    
    const existingTasks = taskManager.getTasksByType(taskManager.TASK_TYPE.COLLECT_FROM_PILE);
    const existingPileIds = existingTasks.map(task => task.target);
    
    energyPiles.forEach(pile => {
        if (!existingPileIds.includes(pile.id)) {
            taskManager.createTask(
                taskManager.TASK_TYPE.COLLECT_FROM_PILE,
                pile.id,
                room.name,
                taskManager.PRIORITY.MEDIUM,
                [taskManager.ROLE.COURIER, taskManager.ROLE.BUILDER, taskManager.ROLE.REPAIRER]
            );
        }
    });
}

/**
 * Проверка актуальности задач (раз в 15 тиков)
 */
function validateTasks() {
    const tasks = taskManager.getAllTasks();
    
    tasks.forEach(task => {
        switch (task.type) {
            case taskManager.TASK_TYPE.MINE_SOURCE:
                validateMineSourceTask(task);
                break;
            case taskManager.TASK_TYPE.BUILD:
                validateBuildTask(task);
                break;
            case taskManager.TASK_TYPE.REPAIR:
                validateRepairTask(task);
                break;
            case taskManager.TASK_TYPE.COLLECT_FROM_PILE:
                validateCollectTask(task);
                break;
        }
    });
    
    // Очистка завершенных задач
    taskManager.cleanupCompletedTasks();
}

/**
 * Проверка задачи добычи
 */
function validateMineSourceTask(task) {
    const source = Game.getObjectById(task.target);
    if (!source) {
        // Источник не существует - удаляем задачу
        taskManager.completeTask(task.id);
    }
}

/**
 * Проверка задачи строительства
 */
function validateBuildTask(task) {
    const site = Game.getObjectById(task.target);
    if (!site) {
        // Строительная площадка не существует - удаляем задачу
        taskManager.completeTask(task.id);
    }
}

/**
 * Проверка задачи ремонта
 */
function validateRepairTask(task) {
    const structure = Game.getObjectById(task.target);
    if (!structure || structure.hits >= structure.hitsMax) {
        // Структура не существует или полностью отремонтирована
        taskManager.completeTask(task.id);
    }
}

/**
 * Проверка задачи сбора из кучи
 */
function validateCollectTask(task) {
    const pile = Game.getObjectById(task.target);
    if (!pile || pile.amount <= 0) {
        // Куча не существует или пуста
        taskManager.completeTask(task.id);
    }
}

module.exports = {
    scanRoom,
    scanSources,
    scanConstructionSites,
    scanStructures,
    scanController,
    scanSpawners,
    scanResourcePiles,
    validateTasks,
    validateMineSourceTask,
    validateBuildTask,
    validateRepairTask,
    validateCollectTask
};