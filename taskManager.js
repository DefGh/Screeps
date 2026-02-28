/**
 * Менеджер задач для Screeps
 * Управляет глобальным списком задач с приоритетами и ролями
 */

const PRIORITY = {
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM', 
    LOW: 'LOW'
};

const TASK_TYPE = {
    MINE_SOURCE: 'MINE_SOURCE',
    DELIVER_MINER: 'DELIVER_MINER',
    COLLECT_FROM_PILE: 'COLLECT_FROM_PILE',
    BUILD: 'BUILD',
    REPAIR: 'REPAIR',
    UPGRADE: 'UPGRADE',
    TRANSPORT: 'TRANSPORT',
    DEFEND: 'DEFEND',
    SPAWN_CREEP: 'SPAWN_CREEP'
};

const ROLE = {
    MINER: 'Miner',
    TAXI: 'Taxi',
    COURIER: 'Courier',
    BUILDER: 'Builder',
    REPAIRER: 'Repairer',
    UPGRADER: 'Upgrader',
    DEFENDER: 'Defender',
    SPAWNER: 'Spawner'
};

// Инициализация памяти для задач
function initMemory() {
    if (!Memory.tasks) {
        Memory.tasks = {
            list: [],
            nextId: 1,
            lastCleanup: 0
        };
    }
}

/**
 * Создание новой задачи
 */
function createTask(type, target, room, priority = PRIORITY.MEDIUM, roles = [], infinite = false) {
    initMemory();
    
    const task = {
        id: 'task_' + Memory.tasks.nextId++,
        type: type,
        target: target,
        room: room,
        priority: priority,
        roles: roles,
        state: 'PENDING',
        progress: 0,
        maxProgress: 0,
        infinite: infinite,
        createdAt: Game.time,
        assignedCreep: null
    };
    
    // Установка maxProgress в зависимости от типа задачи
    switch (type) {
        case TASK_TYPE.MINE_SOURCE:
            task.maxProgress = 1000; // Энергия источника
            break;
        case TASK_TYPE.BUILD:
            task.maxProgress = 1000; // Зависит от construction site
            break;
        case TASK_TYPE.REPAIR:
            task.maxProgress = 1000; // Зависит от структуры
            break;
        case TASK_TYPE.UPGRADE:
            task.maxProgress = 1000;
            break;
        default:
            task.maxProgress = 100;
    }
    
    Memory.tasks.list.push(task);
    return task.id;
}

/**
 * Получение всех задач
 */
function getAllTasks() {
    initMemory();
    return Memory.tasks.list;
}

/**
 * Получение задач по комнате
 */
function getTasksByRoom(roomName) {
    return getAllTasks().filter(task => task.room === roomName);
}

/**
 * Получение задач по типу
 */
function getTasksByType(type) {
    return getAllTasks().filter(task => task.type === type);
}

/**
 * Получение задач по приоритету
 */
function getTasksByPriority(priority) {
    return getAllTasks().filter(task => task.priority === priority);
}

/**
 * Получение задач, которые может выполнить крип определенной роли
 */
function getTasksForRole(role) {
    return getAllTasks().filter(task => 
        task.state === 'PENDING' && 
        task.roles.includes(role)
    );
}

/**
 * Сортировка задач по приоритету
 */
function sortTasksByPriority(tasks) {
    const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return tasks.sort((a, b) => {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
}

/**
 * Назначение задачи крипу
 */
function assignTaskToCreep(taskId, creepName) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (task && task.state === 'PENDING') {
        task.state = 'IN_PROGRESS';
        task.assignedCreep = creepName;
        return true;
    }
    return false;
}

/**
 * Освобождение задачи (если крип умер или задача не может быть выполнена)
 */
function releaseTask(taskId) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (task && task.state === 'IN_PROGRESS') {
        task.state = 'PENDING';
        task.assignedCreep = null;
        return true;
    }
    return false;
}

/**
 * Завершение задачи
 */
function completeTask(taskId) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (task) {
        if (task.infinite) {
            // Для бесконечных задач перезапускаем их
            task.state = 'PENDING';
            task.progress = 0;
            task.assignedCreep = null;
        } else {
            task.state = 'COMPLETED';
        }
        return true;
    }
    return false;
}

/**
 * Обновление прогресса задачи
 */
function updateTaskProgress(taskId, progress) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (task && task.state === 'IN_PROGRESS') {
        task.progress = Math.min(progress, task.maxProgress);
        return true;
    }
    return false;
}

/**
 * Очистка завершенных задач
 */
function cleanupCompletedTasks() {
    initMemory();
    
    if (Game.time - Memory.tasks.lastCleanup < 100) {
        return; // Очищаем не чаще чем раз в 100 тиков
    }
    
    Memory.tasks.list = Memory.tasks.list.filter(task => 
        task.state !== 'COMPLETED' || task.infinite
    );
    
    Memory.tasks.lastCleanup = Game.time;
}

/**
 * Получение свободных задач для роли
 */
function getAvailableTasksForRole(role) {
    const tasks = getTasksForRole(role);
    return sortTasksByPriority(tasks).filter(task => 
        task.state === 'PENDING' && !task.assignedCreep
    );
}

/**
 * Проверка, может ли крип выполнить задачу
 */
function canCreepPerformTask(creep, task) {
    // Проверяем, что крип не занят
    if (creep.memory.taskId) {
        return false;
    }
    
    // Проверяем соответствие роли
    if (!task.roles.includes(creep.memory.role)) {
        return false;
    }
    
    // Проверяем доступность цели (если цель в другой комнате)
    if (task.room && task.room !== creep.room.name) {
        return false;
    }
    
    return true;
}

module.exports = {
    PRIORITY,
    TASK_TYPE,
    ROLE,
    createTask,
    getAllTasks,
    getTasksByRoom,
    getTasksByType,
    getTasksByPriority,
    getTasksForRole,
    sortTasksByPriority,
    assignTaskToCreep,
    releaseTask,
    completeTask,
    updateTaskProgress,
    cleanupCompletedTasks,
    getAvailableTasksForRole,
    canCreepPerformTask,
    initMemory
};