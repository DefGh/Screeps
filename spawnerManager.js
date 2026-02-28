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
    // Приоритеты спавна:
    // 1. Майнеры (для каждого источника)
    // 2. Такси (для доставки майнеров)
    // 3. Курьеры (для транспортировки)
    // 4. Строители (для строительства)
    // 5. Ремонтники (для ремонта)
    // 6. Апгрейдеры (для апгрейда)
    
    const room = spawner.room;
    const creepsInRoom = Object.values(Game.creeps).filter(creep => creep.room.name === room.name);
    
    // Считаем количество крипов каждой роли
    const counts = {
        [taskManager.ROLE.MINER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.MINER).length,
        [taskManager.ROLE.TAXI]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.TAXI).length,
        [taskManager.ROLE.COURIER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.COURIER).length,
        [taskManager.ROLE.BUILDER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.BUILDER).length,
        [taskManager.ROLE.REPAIRER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.REPAIRER).length,
        [taskManager.ROLE.UPGRADER]: creepsInRoom.filter(c => c.memory.role === taskManager.ROLE.UPGRADER).length
    };
    
    // Получаем задачи для каждой роли
    const tasks = {
        [taskManager.ROLE.MINER]: taskManager.getTasksByType(taskManager.TASK_TYPE.MINE_SOURCE).length,
        [taskManager.ROLE.TAXI]: taskManager.getTasksByType(taskManager.TASK_TYPE.DELIVER_MINER).length,
        [taskManager.ROLE.COURIER]: taskManager.getTasksByType(taskManager.TASK_TYPE.COLLECT_FROM_PILE).length,
        [taskManager.ROLE.BUILDER]: taskManager.getTasksByType(taskManager.TASK_TYPE.BUILD).length,
        [taskManager.ROLE.REPAIRER]: taskManager.getTasksByType(taskManager.TASK_TYPE.REPAIR).length,
        [taskManager.ROLE.UPGRADER]: taskManager.getTasksByType(taskManager.TASK_TYPE.UPGRADE).length
    };
    
    // Определяем потребность в крипах
    const needs = {};
    
    // Майнеры: по одному на каждый источник
    needs[taskManager.ROLE.MINER] = Math.max(0, tasks[taskManager.ROLE.MINER] - counts[taskManager.ROLE.MINER]);
    
    // Такси: 1-2 на комнату
    needs[taskManager.ROLE.TAXI] = Math.max(0, Math.min(2, tasks[taskManager.ROLE.TAXI]) - counts[taskManager.ROLE.TAXI]);
    
    // Курьеры: 2-3 на комнату
    needs[taskManager.ROLE.COURIER] = Math.max(0, Math.min(3, tasks[taskManager.ROLE.COURIER]) - counts[taskManager.ROLE.COURIER]);
    
    // Строители: 1-2 на комнату
    needs[taskManager.ROLE.BUILDER] = Math.max(0, Math.min(2, tasks[taskManager.ROLE.BUILDER]) - counts[taskManager.ROLE.BUILDER]);
    
    // Ремонтники: 1 на комнату
    needs[taskManager.ROLE.REPAIRER] = Math.max(0, Math.min(1, tasks[taskManager.ROLE.REPAIRER]) - counts[taskManager.ROLE.REPAIRER]);
    
    // Апгрейдеры: 1-2 на комнату
    needs[taskManager.ROLE.UPGRADER] = Math.max(0, Math.min(2, tasks[taskManager.ROLE.UPGRADER]) - counts[taskManager.ROLE.UPGRADER]);
    
    // Выбираем роль с наибольшей потребностью
    let maxNeed = 0;
    let selectedRole = null;
    
    Object.keys(needs).forEach(role => {
        if (needs[role] > maxNeed) {
            maxNeed = needs[role];
            selectedRole = role;
        }
    });
    
    // Проверяем энергию для спавна
    if (selectedRole && spawner.energy >= getCreepCost(getCreepBody(selectedRole))) {
        return selectedRole;
    }
    
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