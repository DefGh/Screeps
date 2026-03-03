const constants = require('constants');
const taskManager = require('task.manager');

module.exports = {
    initializeRoom: function() {
        if (Memory.roomInitialized) {
            return; // Комната уже инициализирована
        }
        
        let room = Game.spawns['Spawn1'].room;
        if (!room) {
                        return;
        }
        
                
        // Инициализация памяти
        Memory.minerPositions = {};
        Memory.sourceTasks = {};
        
        // Получаем все источники в комнате
        let sources = room.find(FIND_SOURCES);
                
        let createdTasks = 0;
        
        // Для каждого источника рассчитываем позицию и создаем задачу
        for (let source of sources) {
                        
            // Проверяем, есть ли враги рядом с источником
            if (this.hasEnemiesNearSource(source)) {
                                continue;
            }
            
            // Рассчитать позицию для шахтера
            let position = this.calculateMinerPosition(source);
            if (position) {
                Memory.minerPositions[source.id] = position;
                                
                // Создать задачу на добычу для этого источника
                this.createMineTaskForSource(source.id, position);
                createdTasks++;
            } else {
                            }
        }
        
        Memory.roomInitialized = true;
            },
    
    calculateMinerPosition: function(source) {
        let spawn = Game.spawns['Spawn1'];
        if (!spawn) {
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
        
        return position;
    },
    
    createMineTaskForSource: function(sourceId, position) {
        let taskData = {
            type: constants.taskTypes.MINE,
            canExecute: [constants.roles.MINER],
            repeatable: true,
            maxExecuters: 1, // Один шахтер на источник
            priority: 5,
            data: {
                sourceId: sourceId,
                position: position
            }
        };
        
        let success = taskManager.tryAddTask(taskData);
        if (success) {
            Memory.sourceTasks[sourceId] = true;
                    } else {
                    }
    },
    
    hasEnemiesNearSource: function(source) {
        // Проверяем вражеские крипы в радиусе 15 клеток
        let hostileCreeps = source.pos.findInRange(FIND_HOSTILE_CREEPS, 15);
        
        // Проверяем вражеские сооружения в радиусе 15 клеток
        let hostileStructures = source.pos.findInRange(FIND_HOSTILE_STRUCTURES, 15);
        
        return hostileCreeps.length > 0 || hostileStructures.length > 0;
    }
}