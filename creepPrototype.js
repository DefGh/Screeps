/**
 * Общий прототип для всех крипов
 * Содержит базовые функции и логику выполнения задач
 */

const taskManager = require('./taskManager');

// Расширяем прототип крипов
Creep.prototype.hasTask = function() {
    return this.memory.taskId !== undefined && this.memory.taskId !== null;
};

Creep.prototype.getTask = function() {
    if (!this.hasTask()) {
        return null;
    }
    
    return Game.tasks[this.memory.taskId] || null;
};

Creep.prototype.assignTask = function(taskId) {
    const task = Game.tasks[taskId];
    if (!task) {
        return false;
    }
    
    // Проверяем, может ли крип выполнить эту задачу
    if (!task.roles.includes(this.memory.role)) {
        return false;
    }
    
    // Проверяем, не занят ли крип
    if (this.hasTask()) {
        return false;
    }
    
    // Назначаем задачу
    this.memory.taskId = taskId;
    task.assignedCreeps.push(this.name);
    task.state = 'IN_PROGRESS';
    
    return true;
};

Creep.prototype.releaseTask = function() {
    if (!this.hasTask()) {
        return false;
    }
    
    const task = this.getTask();
    if (task) {
        // Удаляем крипа из списка назначенных
        task.assignedCreeps = task.assignedCreeps.filter(name => name !== this.name);
        
        // Если задача больше никем не выполняется, меняем состояние
        if (task.assignedCreeps.length === 0) {
            task.state = 'PENDING';
        }
    }
    
    this.memory.taskId = null;
    return true;
};

Creep.prototype.completeTask = function() {
    if (!this.hasTask()) {
        return false;
    }
    
    const task = this.getTask();
    if (task) {
        if (task.infinite) {
            // Для бесконечных задач перезапускаем их
            task.state = 'PENDING';
            task.progress = 0;
            task.assignedCreeps = [];
        } else {
            task.state = 'COMPLETED';
        }
    }
    
    this.memory.taskId = null;
    return true;
};

Creep.prototype.updateTaskProgress = function(progress) {
    if (!this.hasTask()) {
        return false;
    }
    
    const task = this.getTask();
    if (task && task.state === 'IN_PROGRESS') {
        task.progress = Math.min(progress, task.maxProgress);
        return true;
    }
    return false;
};

Creep.prototype.moveToTaskTarget = function(range = 1) {
    const task = this.getTask();
    if (!task) {
        return ERR_INVALID_TARGET;
    }
    
    const target = Game.getObjectById(task.target);
    if (!target) {
        return ERR_INVALID_TARGET;
    }
    
    return this.moveTo(target, { range: range });
};

Creep.prototype.isAtTaskTarget = function(range = 1) {
    const task = this.getTask();
    if (!task) {
        return false;
    }
    
    const target = Game.getObjectById(task.target);
    if (!target) {
        return false;
    }
    
    return this.pos.inRangeTo(target, range);
};

Creep.prototype.getAvailableTasks = function() {
    const tasks = Object.values(Game.tasks).filter(task => 
        task.state === 'PENDING' && 
        task.roles.includes(this.memory.role) &&
        (!task.room || task.room === this.room.name)
    );
    
    return taskManager.sortTasksByPriority(tasks);
};

Creep.prototype.findBestTask = function() {
    const availableTasks = this.getAvailableTasks();
    
    // Приоритет: задачи без группы > задачи с минимальным количеством назначенных
    const singleTasks = availableTasks.filter(task => !task.groupSize || task.groupSize === 1);
    const groupTasks = availableTasks.filter(task => task.groupSize && task.groupSize > 1);
    
    // Сначала ищем одиночные задачи
    if (singleTasks.length > 0) {
        return singleTasks[0];
    }
    
    // Затем ищем групповые задачи с наименьшим количеством назначенных
    groupTasks.sort((a, b) => {
        const aAssigned = a.assignedCreeps.length;
        const bAssigned = b.assignedCreeps.length;
        return aAssigned - bAssigned;
    });
    
    // Возвращаем первую доступную групповую задачу
    return groupTasks.find(task => task.assignedCreeps.length < task.groupSize) || null;
};

Creep.prototype.performTask = function() {
    const task = this.getTask();
    if (!task) {
        return ERR_INVALID_TARGET;
    }
    
    switch (task.type) {
        case taskManager.TASK_TYPE.MINE_SOURCE:
            return this.performMineSourceTask(task);
        case taskManager.TASK_TYPE.DELIVER_MINER:
            return this.performDeliverMinerTask(task);
        case taskManager.TASK_TYPE.COLLECT_FROM_PILE:
            return this.performCollectFromPileTask(task);
        case taskManager.TASK_TYPE.BUILD:
            return this.performBuildTask(task);
        case taskManager.TASK_TYPE.REPAIR:
            return this.performRepairTask(task);
        case taskManager.TASK_TYPE.UPGRADE:
            return this.performUpgradeTask(task);
        default:
            return ERR_INVALID_ARGS;
    }
};

// Базовые функции выполнения задач (будут переопределены в ролях)
Creep.prototype.performMineSourceTask = function(task) {
    const source = Game.getObjectById(task.target);
    if (!source) {
        this.releaseTask();
        return ERR_INVALID_TARGET;
    }
    
    return this.harvest(source);
};

Creep.prototype.performDeliverMinerTask = function(task) {
    const source = Game.getObjectById(task.target);
    if (!source) {
        this.releaseTask();
        return ERR_INVALID_TARGET;
    }
    
    // Ищем майнера для доставки
    const miner = this.findMinerForDelivery();
    if (!miner) {
        return ERR_NOT_FOUND;
    }
    
    if (this.pos.isEqualTo(source.pos)) {
        // Майнер доставлен, завершаем задачу
        this.completeTask();
        return OK;
    } else {
        return this.moveTo(source);
    }
};

Creep.prototype.performCollectFromPileTask = function(task) {
    const pile = Game.getObjectById(task.target);
    if (!pile) {
        this.releaseTask();
        return ERR_INVALID_TARGET;
    }
    
    if (this.pickup(pile) === ERR_NOT_IN_RANGE) {
        return this.moveTo(pile);
    }
    
    return OK;
};

Creep.prototype.performBuildTask = function(task) {
    const site = Game.getObjectById(task.target);
    if (!site) {
        this.releaseTask();
        return ERR_INVALID_TARGET;
    }
    
    if (this.build(site) === ERR_NOT_ENOUGH_ENERGY) {
        return this.refillEnergy();
    }
    
    return this.build(site);
};

Creep.prototype.performRepairTask = function(task) {
    const structure = Game.getObjectById(task.target);
    if (!structure) {
        this.releaseTask();
        return ERR_INVALID_TARGET;
    }
    
    if (this.repair(structure) === ERR_NOT_ENOUGH_ENERGY) {
        return this.refillEnergy();
    }
    
    return this.repair(structure);
};

Creep.prototype.performUpgradeTask = function(task) {
    const controller = Game.getObjectById(task.target);
    if (!controller) {
        this.releaseTask();
        return ERR_INVALID_TARGET;
    }
    
    if (this.upgradeController(controller) === ERR_NOT_ENOUGH_ENERGY) {
        return this.refillEnergy();
    }
    
    return this.upgradeController(controller);
};

// Вспомогательные функции
Creep.prototype.refillEnergy = function() {
    const storage = this.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_STORAGE
    });
    
    if (storage && storage.store[RESOURCE_ENERGY] > 0) {
        if (this.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            return this.moveTo(storage);
        }
    }
    
    return ERR_NOT_ENOUGH_ENERGY;
};

Creep.prototype.findMinerForDelivery = function() {
    return this.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: (creep) => 
            creep.memory.role === taskManager.ROLE.MINER && 
            !creep.memory.sourceId &&
            creep.memory.taskId === undefined
    })[0] || null;
};

module.exports = {};