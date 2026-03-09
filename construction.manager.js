const constants = require('constants');
const taskManager = require('task.manager');

module.exports = {
    generateTasks: function() {
        // Инициализация таймера в памяти
        if (!Memory.constructionTimer) {
            Memory.constructionTimer = 0;
        }
        
        // Увеличиваем счетчик каждый тик
        Memory.constructionTimer++;
        
        // Выполняем генерацию задач только раз в 30 тиков
        if (Memory.constructionTimer >= 30) {
            Memory.constructionTimer = 0; // Обнуляем счетчик
            
            // Проверяем количество активных строительных задач (не больше 3)
            const activeConstructionTasks = this.getActiveConstructionTasksCount();
            if (activeConstructionTasks >= 3) {
                return; // Не создаем новые задачи, если уже есть 3 активные
            }
            
            // Генерируем все типы строительных задач
            this.buildRoadsToSources();
            this.buildRoadToController();
            this.buildExtensions();
            this.buildContainers();
        }
    },
    
    getActiveConstructionTasksCount: function() {
        const tasks = Memory.tasks || {};
        let count = 0;
        
        for (let taskId in tasks) {
            const task = tasks[taskId];
            if (task.type === constants.taskTypes.CONSTRUCT && 
                (task.status === 'pending' || task.status === 'inProgress')) {
                count++;
            }
        }
        
        return count;
    },
    
    buildRoadsToSources: function() {
        const spawn = Game.spawns['Spawn1'];
        if (!spawn || !spawn.room) {
            return;
        }
        
        const room = spawn.room;
        const sources = room.find(FIND_SOURCES);
        
        for (let source of sources) {
            // Проверяем, есть ли уже задача на постройку дороги к этому источнику
            if (this.hasConstructionTaskForSource(source.id, constants.constructionTypes.ROAD)) {
                continue;
            }
            
            // Проверяем наличие врагов рядом с источником
            if (this.hasEnemiesNearSource(source)) {
                continue;
            }
            
            // Получаем путь от спавна до источника
            const path = this.getShortestPath(spawn.pos, source.pos);
            if (!path || path.length === 0) {
                continue;
            }
            
            // Создаем задачу на постройку дороги шириной 3 клетки
            this.createRoadConstructionTask(source.id, path, 'source');
        }
    },
    
    buildRoadToController: function() {
        const spawn = Game.spawns['Spawn1'];
        if (!spawn || !spawn.room) {
            return;
        }
        
        const room = spawn.room;
        const controller = room.controller;
        
        if (!controller) {
            return;
        }
        
        // Проверяем, есть ли уже задача на постройку дороги до контроллера
        if (this.hasConstructionTaskForController(constants.constructionTypes.ROAD)) {
            return;
        }
        
        // Проверяем наличие врагов рядом с контроллером
        if (this.hasEnemiesNearController()) {
            return;
        }
        
        // Получаем путь от спавна до контроллера
        const path = this.getShortestPath(spawn.pos, controller.pos);
        if (!path || path.length === 0) {
            return;
        }
        
        // Создаем задачу на постройку дороги шириной 3 клетки
        this.createRoadConstructionTask('controller', path, 'controller');
    },
    
    buildExtensions: function() {
        const spawn = Game.spawns['Spawn1'];
        if (!spawn) {
            return;
        }
        
        // Ищем свободные позиции вокруг спавнера для extension
        const extensionPositions = this.findExtensionPositions(spawn.pos);
        
        for (let pos of extensionPositions) {
            // Проверяем, есть ли уже задача на постройку extension в этой позиции
            if (this.hasConstructionTaskAtPosition(pos, constants.constructionTypes.EXTENSION)) {
                continue;
            }
            
            // Проверяем, есть ли уже построенное extension в этой позиции
            const existingStructure = pos.lookFor(LOOK_STRUCTURES);
            if (existingStructure.some(s => s.structureType === STRUCTURE_EXTENSION)) {
                continue;
            }
            
            // Создаем задачу на постройку extension
            this.createConstructionTask(pos, constants.constructionTypes.EXTENSION, 'extension');
        }
    },
    
    buildContainers: function() {
        // Используем позиции шахтеров из room.initializer.js
        if (!Memory.minerPositions) {
            return;
        }
        
        for (let sourceId in Memory.minerPositions) {
            const minerPos = Memory.minerPositions[sourceId];
            
            // Преобразуем позицию из объекта в RoomPosition
            const pos = new RoomPosition(minerPos.x, minerPos.y, minerPos.roomName);
            
            // Проверяем, есть ли уже задача на постройку контейнера в этой позиции
            if (this.hasConstructionTaskAtPosition(pos, constants.constructionTypes.CONTAINER)) {
                continue;
            }
            
            // Проверяем, есть ли уже построенный контейнер в этой позиции
            const existingStructure = pos.lookFor(LOOK_STRUCTURES);
            if (existingStructure.some(s => s.structureType === STRUCTURE_CONTAINER)) {
                continue;
            }
            
            // Создаем задачу на постройку контейнера
            this.createConstructionTask(pos, constants.constructionTypes.CONTAINER, 'container');
        }
    },
    
    getShortestPath: function(fromPos, toPos) {
        const result = PathFinder.search(fromPos, { pos: toPos, range: 1 }, {
            plainCost: 1,
            swampCost: 5,
            maxOps: 1000,
            roomCallback: function(roomName) {
                const room = Game.rooms[roomName];
                if (!room) return false;
                
                const costs = new PathFinder.CostMatrix();
                
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
        
        return result.incomplete ? null : result.path;
    },
    
    createRoadConstructionTask: function(targetId, path, targetType) {
        // Создаем 3 параллельные линии для дороги шириной 3 клетки
        const roadPositions = [];
        
        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            const pos = new RoomPosition(point.x, point.y, point.roomName);
            
            // Добавляем основную позицию и две соседние для ширины 3 клетки
            roadPositions.push(pos);
            roadPositions.push(this.getAdjacentPosition(pos, 'left'));
            roadPositions.push(this.getAdjacentPosition(pos, 'right'));
        }
        
        // Удаляем дубликаты позиций
        const uniquePositions = this.removeDuplicatePositions(roadPositions);
        
        // Создаем задачу для каждой позиции дороги
        for (let pos of uniquePositions) {
            if (!pos) continue;
            
            // Проверяем, есть ли уже построенная дорога в этой позиции
            const existingStructure = pos.lookFor(LOOK_STRUCTURES);
            if (existingStructure.some(s => s.structureType === STRUCTURE_ROAD)) {
                continue;
            }
            
            // Проверяем, есть ли уже задача на постройку дороги в этой позиции
            if (this.hasConstructionTaskAtPosition(pos, constants.constructionTypes.ROAD)) {
                continue;
            }
            
            this.createConstructionTask(pos, constants.constructionTypes.ROAD, 'road', targetId, targetType);
        }
    },
    
    getAdjacentPosition: function(pos, direction) {
        let x = pos.x;
        let y = pos.y;
        
        if (direction === 'left') {
            y = y - 1;
        } else if (direction === 'right') {
            y = y + 1;
        }
        
        // Проверяем границы комнаты
        if (x < 0 || x > 49 || y < 0 || y > 49) {
            return null;
        }
        
        return new RoomPosition(x, y, pos.roomName);
    },
    
    findExtensionPositions: function(spawnPos) {
        const positions = [];
        const radius = 3; // Ищем в радиусе 3 клеток от спавнера
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = spawnPos.x + dx;
                const y = spawnPos.y + dy;
                
                // Проверяем границы комнаты
                if (x < 0 || x > 49 || y < 0 || y > 49) {
                    continue;
                }
                
                // Пропускаем позицию спавнера
                if (x === spawnPos.x && y === spawnPos.y) {
                    continue;
                }
                
                const pos = new RoomPosition(x, y, spawnPos.roomName);
                const terrain = pos.lookFor(LOOK_TERRAIN)[0];
                
                // Проверяем, что позиция не на стене
                if (terrain !== 'wall') {
                    positions.push(pos);
                }
            }
        }
        
        return positions;
    },
    
    createConstructionTask: function(pos, structureType, structureName, targetId, targetType) {
        const id = structureName + '_' + pos.x + '_' + pos.y + '_' + Game.time;
        
        // Создаем Construction Site
        const constructionResult = pos.createConstructionSite(structureType);
        let constructionSiteId = null;
        
        if (constructionResult === OK) {
            // Находим созданную строительную площадку
            const constructionSites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
            const constructionSite = constructionSites.find(site => site.structureType === structureType);
            if (constructionSite) {
                constructionSiteId = constructionSite.id;
            }
        }
        
        const taskData = {
            id: id,
            type: constants.taskTypes.CONSTRUCT,
            canExecute: [constants.roles.UNIVERSAL],
            repeatable: false,
            maxExecuters: 2, // 2 исполнителя на задачу
            priority: constants.taskPriorities.CONSTRUCT,
            data: {
                structureType: structureType,
                position: {
                    x: pos.x,
                    y: pos.y,
                    roomName: pos.roomName
                },
                targetId: targetId,
                targetType: targetType,
                constructionSiteId: constructionSiteId // Привязываем Construction Site к задаче
            }
        };
        
        taskManager.tryAddTask(taskData, id);
    },
    
    hasConstructionTaskForSource: function(sourceId, structureType) {
        const tasks = Memory.tasks || {};
        
        for (let taskId in tasks) {
            const task = tasks[taskId];
            if (task.type === constants.taskTypes.CONSTRUCT &&
                task.data.structureType === structureType &&
                task.data.targetId === sourceId &&
                task.data.targetType === 'source') {
                return true;
            }
        }
        
        return false;
    },
    
    hasConstructionTaskForController: function(structureType) {
        const tasks = Memory.tasks || {};
        
        for (let taskId in tasks) {
            const task = tasks[taskId];
            if (task.type === constants.taskTypes.CONSTRUCT &&
                task.data.structureType === structureType &&
                task.data.targetType === 'controller') {
                return true;
            }
        }
        
        return false;
    },
    
    hasConstructionTaskAtPosition: function(pos, structureType) {
        const tasks = Memory.tasks || {};
        
        for (let taskId in tasks) {
            const task = tasks[taskId];
            if (task.type === constants.taskTypes.CONSTRUCT &&
                task.data.structureType === structureType &&
                task.data.position.x === pos.x &&
                task.data.position.y === pos.y &&
                task.data.position.roomName === pos.roomName) {
                return true;
            }
        }
        
        return false;
    },
    
    removeDuplicatePositions: function(positions) {
        const unique = [];
        const seen = new Set();
        
        for (let pos of positions) {
            if (!pos) continue;
            
            const key = pos.x + '_' + pos.y + '_' + pos.roomName;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(pos);
            }
        }
        
        return unique;
    },
    
    hasEnemiesNearSource: function(source) {
        const hostileCreeps = source.pos.findInRange(FIND_HOSTILE_CREEPS, 15);
        const hostileStructures = source.pos.findInRange(FIND_HOSTILE_STRUCTURES, 15);
        return hostileCreeps.length > 0 || hostileStructures.length > 0;
    },
    
    hasEnemiesNearController: function() {
        const spawn = Game.spawns['Spawn1'];
        if (!spawn || !spawn.room) {
            return false;
        }
        
        const room = spawn.room;
        const controller = room.controller;
        
        if (!controller) {
            return false;
        }
        
        const hostileCreeps = controller.pos.findInRange(FIND_HOSTILE_CREEPS, 15);
        const hostileStructures = controller.pos.findInRange(FIND_HOSTILE_STRUCTURES, 15);
        return hostileCreeps.length > 0 || hostileStructures.length > 0;
    }
};