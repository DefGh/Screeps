/**
 * Менеджер крипов для назначения задач
 * Управляет распределением задач между крипами разных ролей
 */

const taskManager = require('./taskManager');

/**
 * Основная функция управления крипами
 */
function manageCreeps() {
    const creeps = Object.values(Game.creeps);
    
    creeps.forEach(creep => {
        // Если крип не имеет роли, пропускаем
        if (!creep.memory.role) {
            return;
        }
        
        // Обработка в зависимости от роли
        switch (creep.memory.role) {
            case taskManager.ROLE.MINER:
                handleMiner(creep);
                break;
            case taskManager.ROLE.TAXI:
                handleTaxi(creep);
                break;
            case taskManager.ROLE.COURIER:
                handleCourier(creep);
                break;
            case taskManager.ROLE.BUILDER:
                handleBuilder(creep);
                break;
            case taskManager.ROLE.REPAIRER:
                handleRepairer(creep);
                break;
            case taskManager.ROLE.UPGRADER:
                handleUpgrader(creep);
                break;
            case taskManager.ROLE.SPAWNER:
                handleSpawner(creep);
                break;
        }
    });
}

/**
 * Обработка майнера
 */
function handleMiner(creep) {
    // Если майнер не имеет привязанного источника, ищем задачу
    if (!creep.memory.sourceId) {
        assignMinerToSource(creep);
    }
    
    if (creep.memory.sourceId) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (source) {
            // Добываем энергию
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            }
        } else {
            // Источник не существует, сбрасываем привязку
            creep.memory.sourceId = null;
        }
    }
}

/**
 * Назначение майнера на источник
 */
function assignMinerToSource(creep) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.MINER);
    
    if (availableTasks.length > 0) {
        // Берем первую доступную задачу (самую высокоприоритетную)
        const task = availableTasks[0];
        
        if (taskManager.assignTaskToCreep(task.id, creep.name)) {
            creep.memory.taskId = task.id;
            creep.memory.sourceId = task.target;
            creep.memory.role = taskManager.ROLE.MINER;
        }
    }
}

/**
 * Обработка такси
 */
function handleTaxi(creep) {
    // Если такси не имеет задачи, ищем доставку майнера
    if (!creep.memory.taskId) {
        assignTaxiTask(creep);
    }
    
    if (creep.memory.taskId) {
        const task = taskManager.getAllTasks().find(t => t.id === creep.memory.taskId);
        
        if (task && task.state === 'IN_PROGRESS') {
            handleTaxiDelivery(creep, task);
        } else {
            // Задача завершена или не существует
            creep.memory.taskId = null;
        }
    }
}

/**
 * Назначение задачи такси
 */
function assignTaxiTask(creep) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.TAXI);
    
    if (availableTasks.length > 0) {
        // Ищем задачу доставки майнера
        const deliveryTask = availableTasks.find(task => task.type === taskManager.TASK_TYPE.DELIVER_MINER);
        
        if (deliveryTask) {
            if (taskManager.assignTaskToCreep(deliveryTask.id, creep.name)) {
                creep.memory.taskId = deliveryTask.id;
            }
        }
    }
}

/**
 * Обработка доставки такси
 */
function handleTaxiDelivery(creep, task) {
    const source = Game.getObjectById(task.target);
    
    if (source) {
        // Ищем майнера для доставки
        const miner = findMinerForDelivery(creep, source);
        
        if (miner) {
            // Доставляем майнера к источнику
            if (creep.pos.isEqualTo(source.pos)) {
                // Майнер доставлен, завершаем задачу
                taskManager.completeTask(task.id);
                creep.memory.taskId = null;
            } else {
                creep.moveTo(source);
            }
        } else {
            // Нет майнера для доставки
            taskManager.releaseTask(task.id);
            creep.memory.taskId = null;
        }
    } else {
        // Источник не существует
        taskManager.releaseTask(task.id);
        creep.memory.taskId = null;
    }
}

/**
 * Поиск майнера для доставки
 */
function findMinerForDelivery(taxi, source) {
    // Ищем майнера, который не привязан к источнику
    const miners = Object.values(Game.creeps).filter(creep => 
        creep.memory.role === taskManager.ROLE.MINER && 
        !creep.memory.sourceId &&
        creep.pos.isEqualTo(taxi.pos)
    );
    
    return miners[0] || null;
}

/**
 * Обработка курьера
 */
function handleCourier(creep) {
    if (!creep.memory.taskId) {
        assignCourierTask(creep);
    }
    
    if (creep.memory.taskId) {
        const task = taskManager.getAllTasks().find(t => t.id === creep.memory.taskId);
        
        if (task && task.state === 'IN_PROGRESS') {
            handleCourierWork(creep, task);
        } else {
            creep.memory.taskId = null;
        }
    }
}

/**
 * Назначение задачи курьеру
 */
function assignCourierTask(creep) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.COURIER);
    
    if (availableTasks.length > 0) {
        const task = availableTasks[0];
        
        if (taskManager.assignTaskToCreep(task.id, creep.name)) {
            creep.memory.taskId = task.id;
        }
    }
}

/**
 * Работа курьера
 */
function handleCourierWork(creep, task) {
    switch (task.type) {
        case taskManager.TASK_TYPE.COLLECT_FROM_PILE:
            handleCollectFromPile(creep, task);
            break;
        case taskManager.TASK_TYPE.TRANSPORT:
            handleTransport(creep, task);
            break;
    }
}

/**
 * Сбор из кучи
 */
function handleCollectFromPile(creep, task) {
    const pile = Game.getObjectById(task.target);
    
    if (pile) {
        if (creep.pickup(pile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(pile);
        }
    } else {
        taskManager.releaseTask(task.id);
        creep.memory.taskId = null;
    }
}

/**
 * Обработка строителя
 */
function handleBuilder(creep) {
    if (!creep.memory.taskId) {
        assignBuilderTask(creep);
    }
    
    if (creep.memory.taskId) {
        const task = taskManager.getAllTasks().find(t => t.id === creep.memory.taskId);
        
        if (task && task.state === 'IN_PROGRESS') {
            handleBuildWork(creep, task);
        } else {
            creep.memory.taskId = null;
        }
    }
}

/**
 * Назначение задачи строителю
 */
function assignBuilderTask(creep) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.BUILDER);
    
    if (availableTasks.length > 0) {
        const buildTask = availableTasks.find(task => task.type === taskManager.TASK_TYPE.BUILD);
        
        if (buildTask) {
            if (taskManager.assignTaskToCreep(buildTask.id, creep.name)) {
                creep.memory.taskId = buildTask.id;
            }
        }
    }
}

/**
 * Работа строителя
 */
function handleBuildWork(creep, task) {
    const site = Game.getObjectById(task.target);
    
    if (site) {
        if (creep.build(site) === ERR_NOT_ENOUGH_ENERGY) {
            // Нужно заполниться энергией
            const storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (structure) => structure.structureType === STRUCTURE_STORAGE
            });
            
            if (storage && storage.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage);
                }
            }
        } else if (creep.build(site) === ERR_NOT_IN_RANGE) {
            creep.moveTo(site);
        }
    } else {
        taskManager.releaseTask(task.id);
        creep.memory.taskId = null;
    }
}

/**
 * Обработка ремонтника
 */
function handleRepairer(creep) {
    if (!creep.memory.taskId) {
        assignRepairerTask(creep);
    }
    
    if (creep.memory.taskId) {
        const task = taskManager.getAllTasks().find(t => t.id === creep.memory.taskId);
        
        if (task && task.state === 'IN_PROGRESS') {
            handleRepairWork(creep, task);
        } else {
            creep.memory.taskId = null;
        }
    }
}

/**
 * Назначение задачи ремонтнику
 */
function assignRepairerTask(creep) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.REPAIRER);
    
    if (availableTasks.length > 0) {
        const repairTask = availableTasks.find(task => task.type === taskManager.TASK_TYPE.REPAIR);
        
        if (repairTask) {
            if (taskManager.assignTaskToCreep(repairTask.id, creep.name)) {
                creep.memory.taskId = repairTask.id;
            }
        }
    }
}

/**
 * Работа ремонтника
 */
function handleRepairWork(creep, task) {
    const structure = Game.getObjectById(task.target);
    
    if (structure) {
        if (creep.repair(structure) === ERR_NOT_ENOUGH_ENERGY) {
            // Нужно заполниться энергией
            const storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (structure) => structure.structureType === STRUCTURE_STORAGE
            });
            
            if (storage && storage.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage);
                }
            }
        } else if (creep.repair(structure) === ERR_NOT_IN_RANGE) {
            creep.moveTo(structure);
        }
    } else {
        taskManager.releaseTask(task.id);
        creep.memory.taskId = null;
    }
}

/**
 * Обработка апгрейдера
 */
function handleUpgrader(creep) {
    if (!creep.memory.taskId) {
        assignUpgraderTask(creep);
    }
    
    if (creep.memory.taskId) {
        const task = taskManager.getAllTasks().find(t => t.id === creep.memory.taskId);
        
        if (task && task.state === 'IN_PROGRESS') {
            handleUpgradeWork(creep, task);
        } else {
            creep.memory.taskId = null;
        }
    }
}

/**
 * Назначение задачи апгрейдеру
 */
function assignUpgraderTask(creep) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.UPGRADER);
    
    if (availableTasks.length > 0) {
        const upgradeTask = availableTasks.find(task => task.type === taskManager.TASK_TYPE.UPGRADE);
        
        if (upgradeTask) {
            if (taskManager.assignTaskToCreep(upgradeTask.id, creep.name)) {
                creep.memory.taskId = upgradeTask.id;
            }
        }
    }
}

/**
 * Работа апгрейдера
 */
function handleUpgradeWork(creep, task) {
    const controller = Game.getObjectById(task.target);
    
    if (controller) {
        if (creep.upgradeController(controller) === ERR_NOT_ENOUGH_ENERGY) {
            // Нужно заполниться энергией
            const storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: (structure) => structure.structureType === STRUCTURE_STORAGE
            });
            
            if (storage && storage.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage);
                }
            }
        } else if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller);
        }
    } else {
        taskManager.releaseTask(task.id);
        creep.memory.taskId = null;
    }
}

/**
 * Обработка спавнера
 */
function handleSpawner(creep) {
    // Спавнеры - это не крипы, а строения
    // Эта функция будет вызываться для строений спавнеров
    const spawner = creep; // Переделываем под строение
    
    if (!spawner.memory.taskId) {
        assignSpawnerTask(spawner);
    }
    
    if (spawner.memory.taskId) {
        const task = taskManager.getAllTasks().find(t => t.id === spawner.memory.taskId);
        
        if (task && task.state === 'IN_PROGRESS') {
            handleSpawnWork(spawner, task);
        } else {
            spawner.memory.taskId = null;
        }
    }
}

/**
 * Назначение задачи спавнеру
 */
function assignSpawnerTask(spawner) {
    const availableTasks = taskManager.getAvailableTasksForRole(taskManager.ROLE.SPAWNER);
    
    if (availableTasks.length > 0) {
        const spawnTask = availableTasks.find(task => task.type === taskManager.TASK_TYPE.SPAWN_CREEP);
        
        if (spawnTask) {
            if (taskManager.assignTaskToCreep(spawnTask.id, spawner.name)) {
                spawner.memory.taskId = spawnTask.id;
            }
        }
    }
}

/**
 * Работа спавнера
 */
function handleSpawnWork(spawner, task) {
    // Здесь должна быть логика спавна крипов
    // Пока оставим заглушку
    console.log(`Spawner ${spawner.name} working on task ${task.id}`);
}

module.exports = {
    manageCreeps,
    handleMiner,
    handleTaxi,
    handleCourier,
    handleBuilder,
    handleRepairer,
    handleUpgrader,
    handleSpawner,
    assignMinerToSource,
    assignTaxiTask,
    assignCourierTask,
    assignBuilderTask,
    assignRepairerTask,
    assignUpgraderTask,
    assignSpawnerTask
};