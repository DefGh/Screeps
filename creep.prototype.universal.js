/**
 * Прототип для роли Universal (Универсальный крип)
 * Особенности: Может выполнять любые задачи, заменяет такси
 */

const taskManager = require('./taskManager');

/**
 * Основная функция управления универсальным крипом
 */
Creep.prototype.runUniversal = function() {
    // Если универсальный крип не имеет задачи, ищем приоритетную задачу
    if (!this.hasTask()) {
        this.findAndAssignTask();
    }
    
    // Выполняем основную логику
    if (this.hasTask()) {
        this.performTask();
    } else {
        // Если нет задачи, ищем любую доступную задачу
        this.findAnyTask();
    }
}

/**
 * Поиск и назначение задачи
 */
Creep.prototype.findAndAssignTask = function() {
    // Проверяем, не выполняем ли мы уже задачу
    if (this.memory.taskId) {
        return;
    }
    
    // Ищем приоритетные задачи
    const priorityTasks = this.findPriorityTasks();
    
    if (priorityTasks.length > 0) {
        // Берем первую приоритетную задачу
        const task = priorityTasks[0];
        
        if (this.assignTask(task.id)) {
            // Задача назначена, начинаем выполнение
            this.performTask();
        }
    } else {
        // Нет приоритетных задач, ищем любую доступную
        this.findAnyTask();
    }
}

/**
 * Поиск приоритетных задач
 */
Creep.prototype.findPriorityTasks = function() {
    const availableTasks = this.getAvailableTasks();
    
    // Сортируем задачи по приоритету
    return availableTasks.sort((a, b) => {
        const priorityOrder = {
            [taskManager.TASK_TYPE.UPGRADE]: 6,
            [taskManager.TASK_TYPE.BUILD]: 5,
            [taskManager.TASK_TYPE.REPAIR]: 4,
            [taskManager.TASK_TYPE.MINE_SOURCE]: 3,
            [taskManager.TASK_TYPE.COLLECT_FROM_PILE]: 2,
            [taskManager.TASK_TYPE.DELIVER_MINER]: 1
        };
        
        return (priorityOrder[b.type] || 0) - (priorityOrder[a.type] || 0);
    });
}

/**
 * Поиск любой доступной задачи (если нет приоритетных)
 */
Creep.prototype.findAnyTask = function() {
    const availableTasks = this.getAvailableTasks();
    
    if (availableTasks.length > 0) {
        // Берем первую доступную задачу
        const task = availableTasks[0];
        
        if (this.assignTask(task.id)) {
            this.performTask();
        }
    }
}

/**
 * Выполнение задачи (универсальное)
 */
Creep.prototype.performTask = function() {
    const task = this.getTask();
    
    if (!task) {
        this.releaseTask();
        return;
    }
    
    // Кэшируем тип задачи для избежания частых переключений
    if (!this.memory.currentTaskType) {
        this.memory.currentTaskType = task.type;
    }
    
    // Выполняем текущую задачу до конца
    switch (this.memory.currentTaskType) {
        case taskManager.TASK_TYPE.MINE_SOURCE:
            this.performUniversalMining(task);
            break;
        case taskManager.TASK_TYPE.DELIVER_MINER:
            this.performUniversalDelivery(task);
            break;
        case taskManager.TASK_TYPE.COLLECT_FROM_PILE:
            this.performUniversalCollection(task);
            break;
        case taskManager.TASK_TYPE.BUILD:
            this.performUniversalBuilding(task);
            break;
        case taskManager.TASK_TYPE.REPAIR:
            this.performUniversalRepair(task);
            break;
        case taskManager.TASK_TYPE.UPGRADE:
            this.performUniversalUpgrade(task);
            break;
        default:
            this.releaseTask();
            break;
    }
}

/**
 * Универсальная добыча энергии (если майнеры заняты)
 */
Creep.prototype.performUniversalMining = function(task) {
    const source = Game.getObjectById(task.target);
    
    if (!source) {
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип
    if (this.carry.energy >= this.carryCapacity) {
        // Крип полон, идем выгружать
        this.performUniversalUnload();
        return;
    }
    
    // Добываем энергию
    const result = this.harvest(source);
    
    if (result === OK) {
        // Успешно добываем энергию
        this.updateTaskProgress(this.carry.energy);
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к источнику
        this.moveTo(source);
    }
}

/**
 * Универсальная доставка майнера (заменяет такси)
 */
Creep.prototype.performUniversalDelivery = function(task) {
    const source = Game.getObjectById(task.target);
    
    if (!source) {
        this.releaseTask();
        return;
    }
    
    // Ищем майнера для доставки
    const miner = this.findMinerForDelivery(source);
    
    if (miner) {
        // Найден майнер для доставки
        if (this.pos.isEqualTo(source.pos)) {
            // Майнер доставлен, завершаем задачу
            this.completeTask();
            // Сбрасываем кэшированный тип задачи
            delete this.memory.currentTaskType;
        } else {
            // Двигаемся к источнику с майнером
            this.moveTo(source);
        }
    } else {
        // Нет майнера для доставки
        this.releaseTask();
    }
}

/**
 * Универсальный сбор из кучи
 */
Creep.prototype.performUniversalCollection = function(task) {
    const pile = Game.getObjectById(task.target);
    
    if (!pile) {
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип
    if (this.carry.energy >= this.carryCapacity) {
        // Крип полон, идем выгружать
        this.performUniversalUnload();
        return;
    }
    
    // Собираем ресурсы из кучи
    const result = this.pickup(pile);
    
    if (result === OK) {
        // Успешно подобрали ресурс
        this.updateTaskProgress(this.carry.energy);
        
        // Проверяем, пуста ли куча
        if (pile.amount <= 0) {
            this.completeTask();
            // Сбрасываем кэшированный тип задачи
            delete this.memory.currentTaskType;
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к куче
        this.moveTo(pile);
    } else if (result === ERR_FULL) {
        // Крип полон, идем выгружать
        this.performUniversalUnload();
    }
}

/**
 * Универсальное строительство
 */
Creep.prototype.performUniversalBuilding = function(task) {
    const site = Game.getObjectById(task.target);
    
    if (!site) {
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (this.carry.energy === 0) {
        // Нужно заполниться энергией
        this.performUniversalRefill();
        return;
    }
    
    // Строим конструкцию
    const result = this.build(site);
    
    if (result === OK) {
        // Успешно построили
        this.updateTaskProgress(this.carry.energy);
        
        // Проверяем, завершена ли постройка
        if (site.progress >= site.progressTotal) {
            this.completeTask();
            // Сбрасываем кэшированный тип задачи
            delete this.memory.currentTaskType;
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к строительной площадке
        this.moveTo(site);
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Нужно заполниться энергией
        this.performUniversalRefill();
    }
}

/**
 * Универсальный ремонт
 */
Creep.prototype.performUniversalRepair = function(task) {
    const structure = Game.getObjectById(task.target);
    
    if (!structure) {
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (this.carry.energy === 0) {
        // Нужно заполниться энергией
        this.performUniversalRefill();
        return;
    }
    
    // Ремонтируем структуру
    const result = this.repair(structure);
    
    if (result === OK) {
        // Успешно отремонтировали
        this.updateTaskProgress(this.carry.energy);
        
        // Проверяем, завершен ли ремонт
        if (structure.hits >= structure.hitsMax) {
            this.completeTask();
            // Сбрасываем кэшированный тип задачи
            delete this.memory.currentTaskType;
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к структуре
        this.moveTo(structure);
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Нужно заполниться энергией
        this.performUniversalRefill();
    }
}

/**
 * Универсальный апгрейд
 */
Creep.prototype.performUniversalUpgrade = function(task) {
    const controller = Game.getObjectById(task.target);
    
    if (!controller) {
        this.releaseTask();
        return;
    }
    
    // Проверяем, заполнен ли крип энергией
    if (this.carry.energy === 0) {
        // Нужно заполниться энергией
        this.performUniversalRefill();
        return;
    }
    
    // Апгрейдим контроллер
    const result = this.upgradeController(controller);
    
    if (result === OK) {
        // Успешно апгрейднули
        this.updateTaskProgress(this.carry.energy);
        
        // Проверяем, завершен ли апгрейд (для бесконечных задач это не нужно)
        // Но если задача не бесконечная, можно завершить
        const task = this.getTask();
        if (task && !task.infinite) {
            this.completeTask();
            // Сбрасываем кэшированный тип задачи
            delete this.memory.currentTaskType;
        }
    } else if (result === ERR_NOT_IN_RANGE) {
        // Двигаемся к контроллеру
        this.moveTo(controller);
    } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        // Нужно заполниться энергией
        this.performUniversalRefill();
    }
}

/**
 * Универсальное заполнение энергии
 */
Creep.prototype.performUniversalRefill = function() {
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
 * Универсальная выгрузка ресурсов
 */
Creep.prototype.performUniversalUnload = function() {
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
 * Поиск майнера для доставки (аналогично такси)
 */
Creep.prototype.findMinerForDelivery = function(taxi, source) {
    // Ищем майнера, который не привязан к источнику и находится рядом
    const miners = taxi.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: (creep) => 
            creep.memory.role === taskManager.ROLE.MINER && 
            !creep.memory.sourceId &&
            !creep.hasTask()
    });
    
    return miners[0] || null;
}

/**
 * Проверка состояния универсального крипа
 */
Creep.prototype.checkUniversalStatus = function() {
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

module.exports = {};