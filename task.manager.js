constants = require('constants');

module.exports = {

    getTask: function (role) {
        if (!Memory.tasks) {
            Memory.tasks = {};
        }

        this.generateTasks();
        
        // Special handling for miners - they should get mine tasks first
        if (role === constants.roles.MINER) {
            let mineTask = this.getMineTaskForMiner();
            if (mineTask) {
                return mineTask;
            }
        }
        
        // Search for existing tasks that match this role, sorted by priority
        let tasks = Memory.tasks;
        let availableTasks = [];
        
        // Collect all available tasks for this role
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.canExecute && task.canExecute.includes(role) && task.status === 'pending') {
                availableTasks.push(task);
            }
        }
        
        // Sort by priority (lowest first)
        availableTasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        
        // Return the highest priority task
        if (availableTasks.length > 0) {
            let selectedTask = availableTasks[0];
            return selectedTask;
        }
        
        return null;
    },

    tryAddTask: function(task) {
        // Validate task structure
        if (!task || !task.type || !task.data) {
            console.log('Invalid task structure - missing type or data');
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
                console.log('Duplicate task found - not adding:', task.type);
                return false;
            }
        }

        // Generate unique task ID
        let newTaskId = task.type + '_' + Game.time;
        
        // Create complete task object with default values if not provided
        let completeTask = {
            id: newTaskId,
            type: task.type,
            status: 'pending',
            canExecute: task.canExecute || [],
            repeatable: task.repeatable || false,
            maxExecuters: task.maxExecuters || 1,
            priority: task.priority || 0,
            data: task.data,
            executers: [] // New field for assigned executers
        };

        // Add task to memory
        Memory.tasks[newTaskId] = completeTask;
        console.log('Task added successfully:', newTaskId, 'Type:', task.type);
        
        return true;
    },

    areTaskDataEqual: function(data1, data2) {
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
        //console.log('Creating spawn creep task for role:', role);
        let body = common.buildBody(role);
        //console.log('Generated body parts:', body);

        let newTaskId = 'spawnCreep' + role + Game.time;
        //console.log('New task ID:', newTaskId);
        
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
        //console.log('Spawn task created successfully');
    },

    baseTask: function (id, type, data, canExecute, repeatable, maxExecuters, priority) {
        return {
            id: id,
            type: type,
            status: 'pending',
            canExecute: canExecute,
            repeatable: repeatable,
            maxExecuters: maxExecuters,
            priority: priority,
            data: data,
            executers: []
        };
    },

    checkAndAddMinerTask: function () {
        console.log('Checking for miner tasks...');
        
        // Инициализация памяти для хранения позиций шахтеров
        if (!Memory.minerPositions) {
            Memory.minerPositions = {};
        }
        
        let tasks = Memory.tasks;
        let room = Game.spawns['Spawn1'].room;
        
        if (!room) {
            console.log('No room found for spawn');
            return;
        }
        
        // Получаем все источники в комнате
        let sources = room.find(FIND_SOURCES);
        console.log('Found', sources.length, 'sources in room');
        
        for (let source of sources) {
            // Проверяем, есть ли уже шахтер, работающий на этом источнике
            let existingMiner = this.findMinerForSource(source.id);
            if (existingMiner) {
                console.log('Source', source.id, 'already has miner:', existingMiner.name);
                continue;
            }
            
            // Проверяем, есть ли уже задача на создание шахтера для этого источника
            let existingTask = this.findMinerTaskForSource(source.id);
            if (existingTask) {
                console.log('Source', source.id, 'already has miner task:', existingTask.id);
                continue;
            }
            
            // Проверяем наличие врагов рядом с источником
            if (this.hasEnemiesNearSource(source)) {
                console.log('Source', source.id, 'has enemies nearby, skipping');
                continue;
            }
            
            // Рассчитываем позицию для шахтера
            let minerPosition = this.getOrCreateMinerPosition(source);
            if (!minerPosition) {
                console.log('Could not find suitable position for source', source.id);
                continue;
            }
                        
            // Создаем задачу на создание шахтера
            this.spawnMinerTask(source.id, minerPosition);
            console.log('Created miner task for source', source.id, 'at position:', minerPosition);
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
            console.log('Using existing position for source', source.id);
            return Memory.minerPositions[source.id];
        }
        
        // Ищем путь от спавна до источника, игнорируя препятствия
        let spawn = Game.spawns['Spawn1'];
        if (!spawn) {
            console.log('No spawn found for position calculation');
            return null;
        }
        
        // Ищем путь от спавна до источника с помощью PathFinder.search
        let result = PathFinder.search(spawn.pos, { pos: source.pos, range: 1 }, {
            plainCost: 1,
            swampCost: 5,
            maxOps: 1000,
            roomCallback: function(roomName) {
                let room = Game.rooms[roomName];
                if (!room) return false;
                
                // Создаем cost matrix для комнаты
                let costs = new PathFinder.CostMatrix();
                
                // Игнорируем крипов и разрушаемые сооружения
                room.find(FIND_CREEPS).forEach(function(creep) {
                    costs.set(creep.pos.x, creep.pos.y, 0xff);
                });
                
                room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return structure.structureType !== STRUCTURE_ROAD &&
                               structure.structureType !== STRUCTURE_CONTAINER &&
                               structure.structureType !== STRUCTURE_RAMPART;
                    }
                }).forEach(function(structure) {
                    costs.set(structure.pos.x, structure.pos.y, 0xff);
                });
                
                return costs;
            }
        });
        
        if (result.incomplete || result.path.length === 0) {
            console.log('No path found from spawn to source', source.id);
            return null;
        }
        
        // Берем последнюю точку пути (ближайшую к источнику)
        let lastPoint = result.path[result.path.length - 1];
        
        // Проверяем, что позиция позволяет добывать энергию из источника
        let range = source.pos.getRangeTo(lastPoint.x, lastPoint.y);
        if (range > 3) {
            console.log('Path endpoint too far from source:', range);
            return null;
        }
        
        // Проверяем, что позиция в пределах комнаты и не на стене
        if (lastPoint.x < 0 || lastPoint.x > 49 || lastPoint.y < 0 || lastPoint.y > 49) {
            console.log('Path endpoint outside room bounds');
            return null;
        }
        
        let terrain = source.room.getTerrain().get(lastPoint.x, lastPoint.y);
        if (terrain === TERRAIN_MASK_WALL) {
            console.log('Path endpoint on wall');
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
        console.log('Calculated new position for source', source.id, ':', position);
        
        return position;
    },

    spawnMinerTask: function (sourceId, position) {
        console.log('Creating miner task for source', sourceId);
        
        let additionalData = {
            sourceId: sourceId,
            position: position
        };
        
        this.spawnCreepTask(constants.roles.MINER, 5, additionalData);
        
        console.log('Miner task created successfully for source', sourceId);
    },

    checkAndGenerateMineTasks: function() {
        let tasks = Memory.tasks;
        let room = Game.spawns['Spawn1'].room;
        
        if (!room) {
            return;
        }
        
        // Get all miners
        let miners = [];
        for (let name in Game.creeps) {
            let creep = Game.creeps[name];
            if (creep.memory.role === constants.roles.MINER) {
                miners.push(creep);
            }
        }
        
        // Generate mine tasks for each miner
        for (let miner of miners) {
            let sourceId = miner.memory.sourceId;
            if (sourceId) {
                // Check if mine task already exists for this miner
                let existingTask = this.findMineTaskForMiner(miner.id);
                if (!existingTask) {
                    // Create mine task
                    this.createMineTask(miner.id, sourceId);
                }
            }
        }
    },

    findMineTaskForMiner: function(minerId) {
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.MINE && 
                task.data && 
                task.data.minerId === minerId) {
                return task;
            }
        }
        return null;
    },

    createMineTask: function(minerId, sourceId) {
        let miner = Game.creeps[minerId];
        if (!miner) return;
        
        let newTaskId = 'mine' + minerId + Game.time;
        
        Memory.tasks[newTaskId] = this.baseTask(
            newTaskId,
            constants.taskTypes.MINE,
            {
                minerId: minerId,
                sourceId: sourceId,
                position: miner.memory.position
            },
            [constants.roles.MINER],
            true, // Repeatable - miner should keep mining
            1,
            5 // Medium priority
        );
    },

    getMineTaskForMiner: function() {
        // Ищем доступную задачу на добычу
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.MINE && task.status === 'pending') {
                return task;
            }
        }
        return null;
    },

    // NEW METHODS FOR EXECUTER MANAGEMENT

    assignExecutersToTasks: function() {
        // Check all pending tasks and assign available executers
        let tasks = Memory.tasks;
        
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.status === 'pending' && task.executers.length < task.maxExecuters) {
                this.assignExecuterToTask(task);
            }
        }
    },

    assignExecuterToTask: function(task) {
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
                    task.status = 'inProgress';
                }
                
                console.log('Assigned creep', creep.name, 'to task', task.type);
                return true;
            }
        }
        return false;
    },

    isCreepAssignedToTask: function(creepId) {
        let tasks = Memory.tasks;
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.executers.includes(creepId)) {
                return true;
            }
        }
        return false;
    },

    checkExecutersHealth: function() {
        let tasks = Memory.tasks;
        
        for (let taskId in tasks) {
            let task = tasks[taskId];
            let aliveExecuters = [];
            
            for (let executerId of task.executers) {
                let creep = Game.getObjectById(executerId);
                if (creep) {
                    aliveExecuters.push(executerId);
                } else {
                    console.log('Executer', executerId, 'died, removing from task', task.type);
                }
            }
            
            task.executers = aliveExecuters;
            
            // If task is not repeatable and has no executers, mark as failed
            if (!task.repeatable && task.executers.length === 0 && task.status === 'inProgress') {
                task.status = 'failed';
            }
        }
    },

    handleExecuterDeath: function(creepId) {
        let tasks = Memory.tasks;
        
        for (let taskId in tasks) {
            let task = tasks[taskId];
            let index = task.executers.indexOf(creepId);
            if (index !== -1) {
                task.executers.splice(index, 1);
                console.log('Removed dead executer', creepId, 'from task', task.type);
                
                // Try to reassign if there are available slots
                if (task.executers.length < task.maxExecuters) {
                    this.assignExecuterToTask(task);
                }
            }
        }
    },

    completeTask: function(taskId, success) {
        let task = Memory.tasks[taskId];
        if (!task) return;

        if (task.repeatable) {
            // For repeatable tasks, just mark as pending and clear executers
            task.status = 'pending';
            task.executers = [];
        } else {
            // For non-repeatable tasks, remove from memory
            delete Memory.tasks[taskId];
        }
        
        console.log('Task', taskId, 'completed:', success ? 'SUCCESS' : 'FAILED');
    }
}