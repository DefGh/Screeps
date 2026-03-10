const constants = require('constants');
const common = require('common');

module.exports = {
    tryAddTask: function (task, id) {
        // Validate task structure
        if (!task || !task.type || !task.data) {
            return false;
        }
        if (!Memory.tasks) {
            Memory.tasks = {};
        }
        // Check for existing duplicates
        for (let existingTaskId in Memory.tasks) {
            let existingTask = Memory.tasks[existingTaskId];
            // Skip if task types don't match
            if (existingTask.type !== task.type) {
                continue;
            }
            // Compare data objects for duplicates
            if (this.areTaskDataEqual(existingTask.data, task.data)) {
                return false;
            }
        }
        // Generate unique task ID
        let completeTask = {
            id: id,
            type: task.type,
            status: constants.taskStatuses.PENDING,
            canExecute: task.canExecute || [],
            repeatable: task.repeatable || false,
            maxExecuters: task.maxExecuters || 1,
            priority: task.priority || 0,
            data: task.data,
            executers: [] // New field for assigned executers
        };
        // Add task to memory
        Memory.tasks[id] = completeTask;
        return true;
    },
    areTaskDataEqual: function (data1, data2) {
        // Handle null/undefined cases
        if (!data1 && !data2) return true;
        if (!data1 || !data2) return false;
        // Get all keys from both objects
        let keys1 = Object.keys(data1);
        let keys2 = Object.keys(data2);
        // Check if same number of keys
        if (keys1.length !== keys2.length) return false;
        // Check each key-value pair
        for (let key of keys1) {
            if (!keys2.includes(key)) return false;
            let val1 = data1[key];
            let val2 = data2[key];
            // Handle different value types
            if (typeof val1 !== typeof val2) return false;
            if (typeof val1 === 'object' && val1 !== null) {
                // Recursively compare nested objects
                if (!this.areTaskDataEqual(val1, val2)) return false;
            } else if (val1 !== val2) {
                return false;
            }
        }
        return true;
    },
    generateTasks: function () {
        if (!Memory) {
            Memory = {};
        }
        if (!Memory.tasks) {
            Memory.tasks = {};
        }
        let tasks = Memory.tasks;
        // Ensure we always have 3 universal creeps
        let universalCreeps = 0;
        for (let name in Game.creeps) {
            let creep = Game.creeps[name];
            if (creep.memory.role === constants.roles.UNIVERSAL) {
                universalCreeps++;
            }
        }
        // Check how many universal spawn tasks already exist
        let existingUniversalTasks = 0;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.SPAWN_CREEP && task.data.role === constants.roles.UNIVERSAL) {
                existingUniversalTasks++;
            }
        }

        // Calculate how many more universal creeps we need
        let neededUniversalCreeps = Math.max(0, 3 - universalCreeps - existingUniversalTasks);
        // Create spawn tasks for the needed universal creeps
        for (let i = 0; i < neededUniversalCreeps; i++) {
            this.spawnCreepTask(constants.roles.UNIVERSAL, 1);
        }
        // Always generate transfer energy task (low priority, repeatable)
        this.generateTransferEnergyTask();
        // Add miner spawn task if needed
        this.checkAndAddMinerTask();
        // Generate construction tasks
        const constructionManager = require('construction.manager');
        constructionManager.generateTasks();
        // Assign executers to available tasks
        this.assignExecutersToTasks();
    },
    generateTransferEnergyTask: function () {
        let tasks = Memory.tasks;
        let hasTransferTask = false;
        // Check if transfer energy task already exists
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.TRANSFER_ENERGY) {
                hasTransferTask = true;
                break;
            }
        }
        if (!hasTransferTask) {
            let newTaskId = 'transferEnergy' + Game.time;
            tasks[newTaskId] = this.baseTask(
                newTaskId,
                constants.taskTypes.TRANSFER_ENERGY,
                {},
                [constants.roles.UNIVERSAL],
                true, // Repeatable
                999, // Many creeps can do this simultaneously
                999
            );
        }
    },
    spawnCreepTask: function (role, priority, additionalData) {
        let body = common.buildBody(role);
        let newTaskId = 'spawnCreep' + role + Game.time;
        //        
        let tasks = Memory.tasks;
        let taskData = {
            role: role,
            body: body,
        };
        // Добавляем дополнительные данные, если они есть
        if (additionalData) {
            Object.assign(taskData, additionalData);
        }
        tasks[newTaskId] = this.baseTask(
            newTaskId,
            constants.taskTypes.SPAWN_CREEP,
            taskData,
            [constants.roles.SPAWNER],
            false,
            1,
            priority
        );
    },

    baseTask: function (id, type, data, canExecute, repeatable, maxExecuters, priority) {
        return {
            id: id,
            type: type,
            status: constants.taskStatuses.PENDING,
            canExecute: canExecute,
            repeatable: repeatable,
            maxExecuters: maxExecuters,
            priority: priority,
            data: data,
            executers: []
        };
    },
    checkAndAddMinerTask: function () {
        // Инициализация памяти для хранения позиций шахтеров
        if (!Memory.minerPositions) {
            Memory.minerPositions = {};
        }
        let tasks = Memory.tasks;
        let room = Game.spawns['Spawn1'].room;
        if (!room) {
            return;
        }
        // Получаем все источники в комнате
        let sources = room.find(FIND_SOURCES);
        for (let source of sources) {
            // Проверяем, есть ли уже шахтер, работающий на этом источнике
            let existingMiner = this.findMinerForSource(source.id);
            if (existingMiner) {
                continue;
            }
            // Проверяем, есть ли уже задача на создание шахтера для этого источника
            let existingTask = this.findMinerTaskForSource(source.id);
            if (existingTask) {
                continue;
            }
            // Проверяем наличие врагов рядом с источником
            if (this.hasEnemiesNearSource(source)) {
                continue;
            }
            // Рассчитываем позицию для шахтера
            let minerPosition = this.getOrCreateMinerPosition(source);
            if (!minerPosition) {
                continue;
            }
            // Создаем задачу на создание шахтера
            this.spawnMinerTask(source.id, minerPosition);
        }
    },
    findMinerForSource: function (sourceId) {
        for (let name in Game.creeps) {
            let creep = Game.creeps[name];
            if (creep.memory.role === constants.roles.MINER && creep.memory.sourceId === sourceId) {
                return creep;
            }
        }
        return null;
    },
    findMinerTaskForSource: function (sourceId) {
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.SPAWN_CREEP &&
                task.data &&
                task.data.role === constants.roles.MINER &&
                task.data.sourceId === sourceId) {
                return task;
            }
        }
        return null;
    },
    hasEnemiesNearSource: function (source) {
        // Проверяем вражеские крипы в радиусе 15 клеток
        let hostileCreeps = source.pos.findInRange(FIND_HOSTILE_CREEPS, 15);
        // Проверяем вражеские сооружения в радиусе 15 клеток
        let hostileStructures = source.pos.findInRange(FIND_HOSTILE_STRUCTURES, 15);
        return hostileCreeps.length > 0 || hostileStructures.length > 0;
    },
    getOrCreateMinerPosition: function (source) {
        // Проверяем, есть ли уже сохраненная позиция для этого источника
        if (Memory.minerPositions[source.id]) {
            return Memory.minerPositions[source.id];
        }
        // Ищем путь от спавна до источника, игнорируя препятствия
        let spawn = Game.spawns['Spawn1'];
        if (!spawn) {
            return null;
        }
        // Ищем путь от спавна до источника с помощью PathFinder.search
        let result = PathFinder.search(spawn.pos, { pos: source.pos, range: 1 }, {
            plainCost: 1,
            swampCost: 5,
            maxOps: 1000,
            roomCallback: function (roomName) {
                let room = Game.rooms[roomName];
                if (!room) return false;
                // Создаем cost matrix для комнаты
                let costs = new PathFinder.CostMatrix();
                // Игнорируем крипов и разрушаемые сооружения
                room.find(FIND_CREEPS).forEach(function (creep) {
                    costs.set(creep.pos.x, creep.pos.y, 0xff);
                });
                room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return structure.structureType !== STRUCTURE_ROAD &&
                            structure.structureType !== STRUCTURE_CONTAINER &&
                            structure.structureType !== STRUCTURE_RAMPART;
                    }
                }).forEach(function (structure) {
                    costs.set(structure.pos.x, structure.pos.y, 0xff);
                });
                return costs;
            }
        });
        if (result.incomplete || result.path.length === 0) {
            return null;
        }
        // Берем последнюю точку пути (ближайшую к источнику)
        let lastPoint = result.path[result.path.length - 1];
        // Проверяем, что позиция позволяет добывать энергию из источника
        let range = source.pos.getRangeTo(lastPoint.x, lastPoint.y);
        if (range > 3) {
            return null;
        }
        // Проверяем, что позиция в пределах комнаты и не на стене
        if (lastPoint.x < 0 || lastPoint.x > 49 || lastPoint.y < 0 || lastPoint.y > 49) {
            return null;
        }
        let terrain = source.room.getTerrain().get(lastPoint.x, lastPoint.y);
        if (terrain === TERRAIN_MASK_WALL) {
            return null;
        }
        // Формируем позицию
        let position = {
            x: lastPoint.x,
            y: lastPoint.y,
            roomName: source.pos.roomName
        };
        // Сохраняем позицию для повторного использования
        Memory.minerPositions[source.id] = position;
        return position;
    },
    spawnMinerTask: function (sourceId, position) {
        let additionalData = {
            sourceId: sourceId,
            position: position
        };
        this.spawnCreepTask(constants.roles.MINER, 5, additionalData);
    },
    getMineTaskForMiner: function () {
        // Ищем доступную задачу на добычу
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.MINE && task.status === constants.taskStatuses.PENDING) {
                return task;
            }
        }
        return null;
    },
    // NEW METHODS FOR EXECUTER MANAGEMENT
    assignExecutersToTasks: function () {
        // Check all pending tasks and assign available executers
        let tasks = Memory.tasks;
        // Extract all pending tasks that need executers assigned
        let pendingTasks = [];
        for (let taskId in tasks) {
            let task = tasks[taskId];
            
            if (task.executers.length < task.maxExecuters) {
                pendingTasks.push(task);
            }
        }

        console.log(`[TaskManager] Found ${pendingTasks.length} pending tasks needing executers`);

        // Sort by priority (1 = highest, 999 = lowest)
        // Lower numbers = higher priority
        pendingTasks.sort((a, b) => {
            const priorityA = a.priority || 999;
            const priorityB = b.priority || 999;
            return priorityA - priorityB;
        });
        
        console.log(`[TaskManager] Processing tasks in priority order:`);
        for (let task of pendingTasks) {
            console.log(`  - Task ${task.id} (${task.type}) - Priority: ${task.priority || 999}, Max executers: ${task.maxExecuters}, Current: ${task.executers.length}`);
        }
        
        for (let task of pendingTasks) {
            console.log(`[TaskManager] Assigning executers to task ${task.id} (${task.type})`);
            let initialExecuters = task.executers.length;
            while (task.executers.length < task.maxExecuters) {
                if (!this.assignExecuterToTask(task)) {
                    console.log(`[TaskManager] No more available executers for task ${task.id}`);
                    break; // No more available executers
                }
            }
            let assignedCount = task.executers.length - initialExecuters;
            console.log(`[TaskManager] Assigned ${assignedCount} executers to task ${task.id}, total: ${task.executers.length}/${task.maxExecuters}`);
        }
    },

    assignExecuterToTask: function (task) {
        // Find available creeps that can execute this task
        for (let name in Game.creeps) {
            let creep = Game.creeps[name];
            // Check if creep can execute this task and is not already assigned
            if (task.canExecute.includes(creep.memory.role) &&
                !task.executers.includes(creep.id) &&
                !this.isCreepAssignedToTask(creep.id)) {
                // Assign creep to task
                task.executers.push(creep.id);
                creep.memory.task = task;
                creep.memory.taskExecutionData = null;
                // Mark task as in progress if it's not repeatable
                if (!task.repeatable) {
                    task.status = constants.taskStatuses.inProgress;
                }
                return true;
            }
        }
        // Find available spawns that can execute this task
        for (let name in Game.spawns) {
            let spawn = Game.spawns[name];
            // Check if spawn can execute this task and is not already assigned
            if (task.canExecute.includes(constants.roles.SPAWNER) &&
                !task.executers.includes(spawn.id) &&
                !this.isSpawnAssignedToTask(spawn.id)) {
                // Check if spawn is not currently busy
                if (spawn.spawning) {
                    continue; // Skip busy spawns
                }
                // Assign spawn to task
                task.executers.push(spawn.id);
                spawn.memory = spawn.memory || {};
                spawn.memory.task = task;
                spawn.memory.taskExecutionData = null;
                // Mark task as in progress if it's not repeatable
                if (!task.repeatable) {
                    task.status = constants.taskStatuses.inProgress;
                }
                return true;
            }
        }
        return false;
    },
    isCreepAssignedToTask: function (creepId) {
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.executers.includes(creepId)) {
                return true;
            }
        }
        return false;
    },
    isSpawnAssignedToTask: function (spawnId) {
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.executers.includes(spawnId)) {
                return true;
            }
        }
        return false;
    },
    checkExecutersHealth: function () {
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            let aliveExecuters = [];
            for (let executerId of task.executers) {
                let creep = Game.getObjectById(executerId);
                if (creep) {
                    aliveExecuters.push(executerId);
                } else {
                }
            }
            task.executers = aliveExecuters;
        }
    },
    handleTaskCompletion: function (task, executer) {
        // Handle task completion for a specific executer
        console.log('Task with id: ', task.id, ' finished by ', executer.name)

        // Remove executer from task
        let index = task.executers.indexOf(executer.id);
        if (index !== -1) {
            task.executers.splice(index, 1);
        }
        // Clear executer's task memory
        if (executer.memory) {
            delete executer.memory.task;
            delete executer.memory.taskExecutionData;
        }
        if (!task.repeatable) {
            delete Memory.tasks[task.id];
        }
    },
    // NEW METHODS FOR EXECUTER EXECUTION
    runExecuters: function () {
        // Main method to run all assigned executers
        let tasks = Memory.tasks;
        let totalExecuters = 0;
        // Process all tasks with assigned executers
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.executers && task.executers.length > 0) {
                totalExecuters += task.executers.length;
                this.processTaskExecuters(task);
            }
        }
    },
    processTaskExecuters: function (task) {
        // Process all executers assigned to a specific task
        let aliveExecuters = [];
        for (let executerId of task.executers) {
            let executer = Game.getObjectById(executerId);
            if (!executer) {
                // Executer is dead, skip and will be cleaned up later
                continue;
            }
            aliveExecuters.push(executerId);
            // Run the task for this executer
            const finished = this.runExecuter(executer, task);
            // If task is finished, handle completion
            if (finished) {
                this.handleTaskCompletion(task, executer);
            }
        }
        // Update task with alive executers
        task.executers = aliveExecuters;
    },
    runExecuter: function (executer, task) {
        // Handle task execution for a specific executer
        let taskProcessor = require('task.' + task.type);
        // Initialize task execution data if not exists
        if (!executer.memory.taskExecutionData) {
            executer.memory.taskExecutionData = null;
        }
        // Run the task
        let finished = taskProcessor.run(executer, task);
        return finished;
    },
}
