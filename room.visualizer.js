const constants = require('constants');
const resourceManager = require('resource.manager');

module.exports = {
    /**
     * Основная функция визуализации комнаты
     * Вызывается каждый тик из main.js
     */
    visualize: function() {
        // Проверяем, есть ли визуализатор в комнате
        if (!Game.spawns['Spawn1'] || !Game.spawns['Spawn1'].room) {
            return;
        }
        
        const room = Game.spawns['Spawn1'].room;
        const visual = new RoomVisual(room.name);
        
        // Рисуем информацию о задачах
        this.drawTasksInfo(visual);
        
        // Рисуем информацию о резервах ресурсов
        this.drawResourcesInfo(visual);
        
        // Рисуем позиции шахтеров
        this.drawMinerPositions(visual);
    },

    /**
     * Отображение информации о задачах
     */
    drawTasksInfo: function(visual) {
        if (!Memory.tasks) {
            return;
        }

        const tasks = Memory.tasks;
        const pendingTasks = [];
        const inProgressTasks = [];
        
        // Сортируем задачи по приоритету
        for (let taskId in tasks) {
            const task = tasks[taskId];
            if (task.status === 'pending') {
                pendingTasks.push(task);
            } else if (task.status === 'inProgress') {
                inProgressTasks.push(task);
            }
        }
        
        // Сортируем по приоритету (чем меньше число, тем выше приоритет)
        pendingTasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        inProgressTasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        // Позиция для отображения (левый верхний угол)
        let x = 2;
        let y = 2;

        // Заголовок
        visual.text('📋 ЗАДАЧИ', x, y, { color: '#ffffff', fontSize: 10, backgroundColor: '#333333', backgroundPadding: 0.2 });
        y += 1.2;

        // Отображаем активные задачи
        if (inProgressTasks.length > 0) {
            visual.text('🔄 В РАБОТЕ:', x, y, { color: '#00ff00', fontSize: 8 });
            y += 1;
            
            for (let task of inProgressTasks) {
                this.drawTaskLine(visual, x, y, task, '#00ff00');
                y += 0.8;
            }
            y += 0.2;
        }

        // Отображаем ожидающие задачи
        if (pendingTasks.length > 0) {
            visual.text('⏳ В ОЧЕРЕДИ:', x, y, { color: '#ffff00', fontSize: 8 });
            y += 1;
            
            for (let task of pendingTasks) {
                this.drawTaskLine(visual, x, y, task, '#ffff00');
                y += 0.8;
            }
        } else {
            visual.text('Нет ожидающих задач', x, y, { color: '#888888', fontSize: 8 });
        }
    },

    /**
     * Рисует одну строку с информацией о задаче
     */
    drawTaskLine: function(visual, x, y, task, color) {
        // Тип задачи
        let taskText = `[${task.type}] `;
        
        // Дополнительная информация в зависимости от типа
        if (task.type === constants.taskTypes.SPAWN_CREEP) {
            taskText += `role:${task.data.role} `;
        } else if (task.type === constants.taskTypes.MINE) {
            taskText += `source:${task.data.sourceId?.slice(-4) || 'unknown'} `;
        }
        
        // Исполнители
        const execCount = task.executers ? task.executers.length : 0;
        taskText += `exec:${execCount}/${task.maxExecuters || 1} `;
        
        // Приоритет
        taskText += `p:${task.priority || 0}`;
        
        // Цвет в зависимости от приоритета
        let textColor = color;
        if (task.priority <= 3) {
            textColor = '#ff0000'; // Высокий приоритет - красный
        } else if (task.priority <= 7) {
            textColor = '#ffff00'; // Средний приоритет - желтый
        }
        
        visual.text(taskText, x, y, { color: textColor, fontSize: 7 });
    },

    /**
     * Отображение информации о резервах ресурсов
     */
    drawResourcesInfo: function(visual) {
        if (!Memory.resourceManager) {
            return;
        }

        const resourceManager = require('resource.manager');
        const info = resourceManager.getReservationsInfo();
        
        // Позиция (правый верхний угол)
        let x = 45;
        let y = 2;

        // Заголовок
        visual.text('🔋 РЕСУРСЫ', x, y, { color: '#ffffff', fontSize: 10, backgroundColor: '#333333', backgroundPadding: 0.2 });
        y += 1.2;

        // Общая информация
        visual.text(`Доступно: ${info.available}`, x, y, { color: '#00ff00', fontSize: 8 });
        y += 0.8;
        visual.text(`Зарезервировано: ${info.totalReserved}`, x, y, { color: '#ff0000', fontSize: 8 });
        y += 0.8;
        visual.text(`Активных резервов: ${info.count}`, x, y, { color: '#ffff00', fontSize: 8 });
        y += 1;

        // Список активных резервов
        if (info.count > 0) {
            visual.text('Резервы:', x, y, { color: '#ffffff', fontSize: 8 });
            y += 0.8;
            
            for (let creepId in info.reservations) {
                const amount = info.reservations[creepId];
                const creep = Game.getObjectById(creepId);
                const creepName = creep ? creep.name : 'unknown';
                visual.text(`${creepName}: ${amount}`, x, y, { color: '#888888', fontSize: 7 });
                y += 0.7;
            }
        } else {
            visual.text('Нет активных резервов', x, y, { color: '#888888', fontSize: 8 });
        }
    },

    /**
     * Отображение позиций шахтеров
     */
    drawMinerPositions: function(visual) {
        if (!Memory.minerPositions) {
            return;
        }

        // Рисуем маркеры для каждой позиции шахтера
        for (let sourceId in Memory.minerPositions) {
            const position = Memory.minerPositions[sourceId];
            
            // Проверяем, что позиция в текущей комнате
            if (position.roomName === Game.spawns['Spawn1'].room.name) {
                // Рисуем маркер позиции
                visual.circle(position.x, position.y, { 
                    radius: 0.5, 
                    fill: 'transparent', 
                    stroke: '#00ffff', 
                    strokeWidth: 0.15 
                });
                
                // Рисуем крестик в центре
                visual.line(position.x - 0.3, position.y, position.x + 0.3, position.y, { color: '#00ffff', width: 0.1 });
                visual.line(position.x, position.y - 0.3, position.x, position.y + 0.3, { color: '#00ffff', width: 0.1 });
                
                // Подпись с ID источника (последние 4 символа)
                visual.text(sourceId.slice(-4), position.x + 0.5, position.y - 0.5, { 
                    color: '#00ffff', 
                    fontSize: 6,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backgroundPadding: 0.1
                });
            }
        }

        // Проверяем, есть ли активные задачи на добычу и отображаем их
        if (Memory.tasks) {
            for (let taskId in Memory.tasks) {
                const task = Memory.tasks[taskId];
                if (task.type === constants.taskTypes.MINE && task.status === 'inProgress') {
                    const position = task.data.position;
                    if (position && position.roomName === Game.spawns['Spawn1'].room.name) {
                        // Рисуем более яркий маркер для активной задачи
                        visual.circle(position.x, position.y, { 
                            radius: 0.6, 
                            fill: 'transparent', 
                            stroke: '#ff0000', 
                            strokeWidth: 0.2 
                        });
                        
                        // Индикатор активной задачи
                        visual.text('⛏️', position.x, position.y - 0.8, { 
                            color: '#ff0000', 
                            fontSize: 10 
                        });
                    }
                }
            }
        }
    }
};