const constants = require('constants');
const taskManager = require('task.manager');

module.exports = {
    generateTasks() {
        // Инициализация таймера в памяти
        if (!Memory.constructionTimer) {
            Memory.constructionTimer = 0;
        }
        
        // Увеличиваем счетчик каждый тик
        Memory.constructionTimer++;
        
        // Выполняем генерацию задач только раз в 30 тиков
        if (Memory.constructionTimer >= 30) {
            Memory.constructionTimer = 0; // Обнуляем счетчик
                
            const activeConstructionTasks = this.getActiveConstructionTasksCount();
            if (activeConstructionTasks >= 3) {
                return; 
            }

            if (this.buildContainers()) {
                return; 
            }

        }
    },

    getActiveConstructionTasksCount() {
        var room = Game.spawns['Spawn1'].room;
        return room.find(FIND_CONSTRUCTION_SITES).length;
    },

    buildContainers() {

        let pos = Memory.minerPositions;

        for (let source in pos) {
            
            var poss = pos[source];
            let position = new RoomPosition(poss.x, poss.y, poss.roomName);

            if (createConstructionTask( position, STRUCTURE_CONTAINER, 'container')){
                return true;
            }

        }

    },

    createConstructionTask(pos, structureType, structureName) {
        // Проверяем, что позиция не на стене
        const terrain = pos.lookFor(LOOK_TERRAIN)[0];
        if (terrain === 'wall') {
            return false; // Не создаем задачу на постройку на стене
        }
        
        // Проверяем, что позиция не занята другим сооружением
        const existingStructures = pos.lookFor(LOOK_STRUCTURES);
        if (existingStructures.length > 0) {
            return false; // Не создаем задачу, если позиция занята
        }
        
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
                constructionSiteId: constructionSiteId // Привязываем Construction Site к задаче
            }
        };
        
        return taskManager.tryAddTask(taskData, id);
    },
    


};