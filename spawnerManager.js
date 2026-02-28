/**
 * Менеджер спавнеров для создания крипов
 * Управляет спавном крипов разных ролей на основе задач
 */

const taskManager = require('./taskManager');

/**
 * Основная функция управления спавнерами
 */
function manageSpawners() {
    const spawners = Object.values(Game.spawns);
    
    spawners.forEach(spawner => {
        if (!spawner.spawning) {
            // Спавнер не занят
            spawnCreep(spawner);
        }
    });
}

/**
 * Спавн крипа на основе задач
 */
function spawnCreep(spawner) {
    // Определяем какого крипа нужно спавнить
    const creepType = determineCreepType(spawner);
    
    if (creepType) {
        const creepName = generateCreepName(creepType);
        const body = getCreepBody(creepType);
        
        const result = spawner.spawnCreep(body, creepName, {
            memory: {
                role: creepType,
                taskId: null
            }
        });
        
        if (result === OK) {
            console.log(`Spawning ${creepType}: ${creepName}`);
        } else {
            console.log(`Failed to spawn ${creepType}: ${result}`);
        }
    }
}

/**
 * Определение типа крипа для спавна
 */
function determineCreepType(spawner) {
    // Новая система приоритетов:
    // 1. Сначала спавним специализированных крипов (если есть для них задачи)
    // 2. Только если нет задач для специализированных - спавним универсальных
    
    const room = spawner.room;
    const creepsInRoom = Object.values(Game.creeps).filter(creep => creep.room.name === room.name);
    
    // Считаем количество крипов каждой роли
    const counts = {
        [taskManager.ROLE.MINER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.MINER).length,
        [taskManager.ROLE.COURIER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.COURIER).length,
        [taskManager.ROLE.BUILDER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.BUILDER).length,
        [taskManager.ROLE.REPAIRER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.REPAIRER).length,
        [taskManager.ROLE.UPGRADER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.UPGRADER).length,
        [taskManager.ROLE.UNIVERSAL]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.UNIVERSAL).length
    };
    
    // Проверяем наличие задач для каждой специализированной роли
    const availableTasks = taskManager.getAvailableTasksForRole;
    
    // Приоритет 1: Универсальные крипы (максимальный приоритет, но вариативная необходимость)
    // Универсальный крип нужен, если нет майнера И нет курьера
    if (counts[taskManager.ROLE.UNIVERSAL] < 1) {
        const allTasks = taskManager.getAllTasks();
        const pendingTasks = allTasks.filter(task => task.state === 'PENDING');
        
        // Универсальный крип нужен, если есть задачи И нет майнера И нет курьера
        if (pendingTasks.length > 0 && 
            counts[taskManager.ROLE.MINER] === 0 && 
            counts[taskManager.ROLE.COURIER] === 0) {
            return taskManager.ROLE.UNIVERSAL;
        }
    }
    
    // Приоритет 2: Майнеры (если есть задачи на добычу)
    if (counts[taskManager.ROLE.MINER] < 2) { // Максимум 2 майнера
        const minerTasks = availableTasks(taskManager.ROLE.MINER);
        if (minerTasks.length > 0) {
            return taskManager.ROLE.MINER;
        }
    }
    
    // Приоритет 3: Курьеры (если есть задачи на сбор)
    if (counts[taskManager.ROLE.COURIER] < 2) {
        const courierTasks = availableTasks(taskManager.ROLE.COURIER);
        if (courierTasks.length > 0) {
            return taskManager.ROLE.COURIER;
        }
    }
    
    // Приоритет 4: Строители (если есть задачи на строительство)
    if (counts[taskManager.ROLE.BUILDER] < 1) {
        const builderTasks = availableTasks(taskManager.ROLE.BUILDER);
        if (builderTasks.length > 0) {
            return taskManager.ROLE.BUILDER;
        }
    }
    
    // Приоритет 5: Ремонтники (если есть задачи на ремонт)
    if (counts[taskManager.ROLE.REPAIRER] < 1) {
        const repairerTasks = availableTasks(taskManager.ROLE.REPAIRER);
        if (repairerTasks.length > 0) {
            return taskManager.ROLE.REPAIRER;
        }
    }
    
    // Приоритет 6: Апгрейдеры (если есть задачи на апгрейд)
    if (counts[taskManager.ROLE.UPGRADER] < 2) {
        const upgraderTasks = availableTasks(taskManager.ROLE.UPGRADER);
        if (upgraderTasks.length > 0) {
            return taskManager.ROLE.UPGRADER;
        }
    }
    
    // Если нет задач вообще, не спавним ничего
    return null;
}

/**
 * Генерация имени крипа
 */
function generateCreepName(role) {
    const timestamp = Game.time;
    return `${role}_${timestamp}`;
}

/**
 * Получение тела крипа для роли
 */
function getCreepBody(role) {
    const energyAvailable = Game.spawns['Spawn1'] ? Game.spawns['Spawn1'].energyCapacity : 300;
    
    switch (role) {
        case taskManager.ROLE.MINER:
            // Майнер: максимум WORK для добычи, MOVE для перемещения
            return createMinerBody(energyAvailable);
            
        case taskManager.ROLE.TAXI:
            // Такси: CARRY для переноски майнера, MOVE для перемещения
            return createTaxiBody(energyAvailable);
            
        case taskManager.ROLE.COURIER:
            // Курьер: CARRY для переноски ресурсов, MOVE для перемещения
            return createCourierBody(energyAvailable);
            
        case taskManager.ROLE.BUILDER:
            // Строитель: WORK для строительства, CARRY для переноски, MOVE для перемещения
            return createBuilderBody(energyAvailable);
            
        case taskManager.ROLE.REPAIRER:
            // Ремонтник: WORK для ремонта, CARRY для переноски, MOVE для перемещения
            return createRepairerBody(energyAvailable);
            
        case taskManager.ROLE.UPGRADER:
            // Апгрейдер: WORK для апгрейда, CARRY для переноски, MOVE для перемещения
            return createUpgraderBody(energyAvailable);
            
        case taskManager.ROLE.UNIVERSAL:
            // Универсальный: сбалансированное тело для всех задач
            return createUniversalBody(energyAvailable);
            
        default:
            return [WORK, CARRY, MOVE];
    }
}

/**
 * Создание тела майнера
 */
function createMinerBody(energy) {
    const parts = [];
    const maxWorkParts = Math.floor(energy / 100); // WORK стоит 100
    
    // Максимум WORK частей (майнеры без ног)
    for (let i = 0; i < maxWorkParts; i++) {
        parts.push(WORK);
    }
    
    // Майнеры не имеют ног, поэтому не добавляем MOVE части
    // Они будут доставляться такси
    
    return parts;
}

/**
 * Создание тела такси
 */
function createTaxiBody(energy) {
    const parts = [];
    const maxCarryParts = Math.floor(energy / 50); // CARRY стоит 50
    
    // Максимум CARRY частей для переноски майнера
    for (let i = 0; i < maxCarryParts; i++) {
        parts.push(CARRY);
    }
    
    // Добавляем MOVE части (1 MOVE на 1 CARRY для быстрой доставки)
    for (let i = 0; i < maxCarryParts; i++) {
        parts.push(MOVE);
    }
    
    return parts;
}

/**
 * Создание тела курьера
 */
function createCourierBody(energy) {
    const parts = [];
    const maxCarryParts = Math.floor(energy / 50);
    
    // Максимум CARRY частей
    for (let i = 0; i < maxCarryParts; i++) {
        parts.push(CARRY);
    }
    
    // Добавляем MOVE части (1 MOVE на 2 CARRY)
    const moveParts = Math.floor(parts.length / 2);
    for (let i = 0; i < moveParts; i++) {
        parts.push(MOVE);
    }
    
    return parts;
}

/**
 * Создание тела строителя
 */
function createBuilderBody(energy) {
    const parts = [];
    const workParts = Math.floor(energy / 3 / 100); // WORK стоит 100
    const carryParts = Math.floor(energy / 3 / 50);  // CARRY стоит 50
    const moveParts = Math.floor(energy / 3 / 50);   // MOVE стоит 50
    
    // Баланс WORK, CARRY, MOVE
    for (let i = 0; i < workParts; i++) parts.push(WORK);
    for (let i = 0; i < carryParts; i++) parts.push(CARRY);
    for (let i = 0; i < moveParts; i++) parts.push(MOVE);
    
    return parts;
}

/**
 * Создание тела ремонтника
 */
function createRepairerBody(energy) {
    const parts = [];
    const workParts = Math.floor(energy / 3 / 100);
    const carryParts = Math.floor(energy / 3 / 50);
    const moveParts = Math.floor(energy / 3 / 50);
    
    // Баланс WORK, CARRY, MOVE
    for (let i = 0; i < workParts; i++) parts.push(WORK);
    for (let i = 0; i < carryParts; i++) parts.push(CARRY);
    for (let i = 0; i < moveParts; i++) parts.push(MOVE);
    
    return parts;
}

/**
 * Создание тела апгрейдера
 */
function createUpgraderBody(energy) {
    const parts = [];
    const workParts = Math.floor(energy / 2 / 100);
    const carryParts = Math.floor(energy / 2 / 50);
    
    // Больше WORK, меньше CARRY
    for (let i = 0; i < workParts; i++) parts.push(WORK);
    for (let i = 0; i < carryParts; i++) parts.push(CARRY);
    
    // Добавляем MOVE части
    const moveParts = Math.floor((workParts + carryParts) / 2);
    for (let i = 0; i < moveParts; i++) parts.push(MOVE);
    
    return parts;
}

/**
 * Создание тела универсального крипа
 */
function createUniversalBody(energy) {
    const parts = [];
    const workParts = Math.floor(energy / 3 / 100); // WORK стоит 100
    const carryParts = Math.floor(energy / 3 / 50);  // CARRY стоит 50
    const moveParts = Math.floor(energy / 3 / 50);   // MOVE стоит 50
    
    // Сбалансированное тело для всех задач
    for (let i = 0; i < workParts; i++) parts.push(WORK);
    for (let i = 0; i < carryParts; i++) parts.push(CARRY);
    for (let i = 0; i < moveParts; i++) parts.push(MOVE);
    
    return parts;
}

/**
 * Расчет стоимости тела крипа
 */
function getCreepCost(body) {
    const costs = {
        [WORK]: 100,
        [CARRY]: 50,
        [MOVE]: 50,
        [ATTACK]: 80,
        [RANGED_ATTACK]: 150,
        [HEAL]: 250,
        [TOUGH]: 10,
        [CLAIM]: 600
    };
    
    return body.reduce((total, part) => total + costs[part], 0);
}

/**
 * Проверка необходимости спавна крипов
 */
function checkSpawnNeeds() {
    const rooms = Object.values(Game.rooms);
    
    rooms.forEach(room => {
        const spawners = Object.values(Game.spawns).filter(sp => sp.room.name === room.name);
        
        if (spawners.length > 0) {
            const spawner = spawners[0]; // Берем первый спавнер
            const needs = determineCreepType(spawner);
            
            if (needs) {
                console.log(`Room ${room.name} needs ${needs}`);
            }
        }
    });
}

module.exports = {
    manageSpawners,
    spawnCreep,
    determineCreepType,
    generateCreepName,
    getCreepBody,
    createMinerBody,
    createTaxiBody,
    createCourierBody,
    createBuilderBody,
    createRepairerBody,
    createUpgraderBody,
    getCreepCost,
    checkSpawnNeeds
};