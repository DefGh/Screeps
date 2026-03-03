constants = require('constants');

module.exports = {

    getTask: function (role) {
        if (!Memory.tasks) {
            //console.log('Initializing Memory.tasks');
            Memory.tasks = {};
        }

        this.generateTasks();
        
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
        
        // Sort by priority (highest first)
        availableTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        // Return the highest priority task
        if (availableTasks.length > 0) {
            let selectedTask = availableTasks[0];
            //console.log('Task assigned to role:', role, 'Type:', selectedTask.type, 'Priority:', selectedTask.priority);
            return selectedTask;
        }
        
        return null;
    },
    generateTasks: function () {
        //console.log('Generating tasks...');
        
        if (!Memory) {
            Memory = {};
        }
        if (!Memory.tasks) {
            Memory.tasks = {};
        }
        let tasks = Memory.tasks;
        //console.log('Current number of tasks:', Object.keys(tasks).length);
        //console.log('Current number of creeps:', Object.keys(Game.creeps).length);

        // if no creeps -> spawn creep task
        if (Object.keys(Game.creeps).length === 0) {
            //console.log('No creeps found, checking for universal spawn task...');
            let hasUniversalTask = false;
            for (let taskId in tasks) {
                let task = tasks[taskId];
                if (task.type === constants.taskTypes.SPAWN_CREEP && task.data.role === constants.roles.UNIVERSAL) {
                    //console.log('Found existing universal spawn task:', taskId);
                    hasUniversalTask = true;
                    break;
                }
            }
            if (!hasUniversalTask) {
                //console.log('No universal spawn task found, creating new one...');
                this.spawnCreepTask(constants.roles.UNIVERSAL);
            }
        } else {
            //console.log('Creeps exist, skipping spawn task generation');
        }

        // Always generate transfer energy task (low priority, repeatable)
        this.generateTransferEnergyTask();

        // Add miner spawn task if needed
        this.checkAndAddMinerTask();

    },

    generateTransferEnergyTask: function () {
        //console.log('Generating transfer energy task...');
        
        let tasks = Memory.tasks;
        let hasTransferTask = false;
        
        // Check if transfer energy task already exists
        for (let taskId in tasks) {
            let task = tasks[taskId];
            if (task.type === constants.taskTypes.TRANSFER_ENERGY) {
                //console.log('Transfer energy task already exists:', taskId);
                hasTransferTask = true;
                break;
            }
        }
        
        if (!hasTransferTask) {
            //console.log('Creating new transfer energy task...');
            let newTaskId = 'transferEnergy' + Game.time;
            
            tasks[newTaskId] = this.baseTask(
                newTaskId,
                constants.taskTypes.TRANSFER_ENERGY,
                {
                    // No specific data needed - creeps will find sources/destinations dynamically
                },
                [constants.roles.UNIVERSAL], // Universal role can handle transfer tasks
                true, // Repeatable - always available
                999 // Many creeps can do this simultaneously
            );
            
            //console.log('Transfer energy task created successfully');
        }
    },

    spawnCreepTask: function (role, additionalData) {
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
            1
        );
        //console.log('Spawn task created successfully');
    },

    baseTask: function (id, type, data, canExecute, repeatable, maxExecuters) {

        return {
            id: id,
            type: type,
            status: 'pending',
            canExecute: canExecute,
            repeatable: repeatable,
            maxExecuters: maxExecuters,
            priority: constants.taskPriorities[type] || 5, // Default priority if not defined
            data: data
        };
    },

    checkAndAddMinerTask: function () {
        //console.log('Checking for miner tasks...');
        
        // Инициализация памяти для хранения позиций шахтеров
        if (!Memory.minerPositions) {
            Memory.minerPositions = {};
        }
        
        let tasks = Memory.tasks;
        let room = Game.spawns['Spawn1'].room;
        
        if (!room) {
            //console.log('No room found for spawn');
            return;
        }
        
        // Получаем все источники в комнате
        let sources = room.find(FIND_SOURCES);
        //console.log('Found', sources.length, 'sources in room');
        
        for (let source of sources) {
            // Проверяем, есть ли уже шахтер, работающий на этом источнике
            let existingMiner = this.findMinerForSource(source.id);
            if (existingMiner) {
                //console.log('Source', source.id, 'already has miner:', existingMiner.name);
                continue;
            }
            
            // Проверяем, есть ли уже задача на создание шахтера для этого источника
            let existingTask = this.findMinerTaskForSource(source.id);
            if (existingTask) {
                //console.log('Source', source.id, 'already has miner task:', existingTask.id);
                continue;
            }
            
            // Проверяем наличие врагов рядом с источником
            if (this.hasEnemiesNearSource(source)) {
                //console.log('Source', source.id, 'has enemies nearby, skipping');
                continue;
            }
            
            // Рассчитываем позицию для шахтера
            let minerPosition = this.getOrCreateMinerPosition(source);
            if (!minerPosition) {
                //console.log('Could not find suitable position for source', source.id);
                continue;
            }
            
            // Проверяем, достаточно ли энергии для создания шахтера
            let minerBody = common.buildBody(constants.roles.MINER);
            let totalCost = minerBody.reduce((sum, part) => sum + constants.BodyParts[part].cost, 0);
            
            if (room.energyAvailable < totalCost) {
                console.log('Not enough energy to spawn miner for source', source.id, '- need:', totalCost, 'have:', room.energyAvailable);
                continue;
            }
            
            // Создаем задачу на создание шахтера
            this.spawnMinerTask(source.id, minerPosition);
            //console.log('Created miner task for source', source.id, 'at position:', minerPosition);
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
            //console.log('Using existing position for source', source.id);
            return Memory.minerPositions[source.id];
        }
        
        // Ищем путь от спавна до источника, игнорируя препятствия
        let spawn = Game.spawns['Spawn1'];
        if (!spawn) {
            //console.log('No spawn found for position calculation');
            return null;
        }
        
        // Ищем путь от спавна до источника
        let path = spawn.pos.findPathTo(source.pos, {
            ignoreCreeps: true,
            ignoreDestructibleStructures: true,
            ignoreRoads: true,
        });
        
        if (path.length === 0) {
            //console.log('No path found from spawn to source', source.id);
            return null;
        }
        
        // Берем последнюю точку пути (ближайшую к источнику)
        let lastPoint = path[path.length - 1];
        
        // Проверяем, что позиция позволяет добывать энергию из источника
        let range = source.pos.getRangeTo(lastPoint.x, lastPoint.y);
        if (range > 3) {
            //console.log('Path endpoint too far from source:', range);
            return null;
        }
        
        // Проверяем, что позиция в пределах комнаты и не на стене
        if (lastPoint.x < 0 || lastPoint.x > 49 || lastPoint.y < 0 || lastPoint.y > 49) {
            //console.log('Path endpoint outside room bounds');
            return null;
        }
        
        let terrain = source.room.getTerrain().get(lastPoint.x, lastPoint.y);
        if (terrain === TERRAIN_MASK_WALL) {
            //console.log('Path endpoint on wall');
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
        //console.log('Calculated new position for source', source.id, ':', position);
        
        return position;
    },


    spawnMinerTask: function (sourceId, position) {
        //console.log('Creating miner task for source', sourceId);
        
        let additionalData = {
            sourceId: sourceId,
            position: position
        };
        
        this.spawnCreepTask(constants.roles.MINER, additionalData);
        
        //console.log('Miner task created successfully for source', sourceId);
    },



}