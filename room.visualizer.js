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
        let taskText = `${task.type} / `;
        
        // Исполнители (только имена)
        const execCount = task.executers ? task.executers.length : 0;
        if (execCount > 0) {
            const executorNames = [];
            for (let creepId of task.executers) {
                const creep = Game.getObjectById(creepId);
                if (creep) {
                    executorNames.push(creep.name);
                }
            }
            taskText += executorNames.join(', ');
        } else {
            taskText += 'нет исполнителей';
        }
        
        // Цвет в зависимости от приоритета
        let textColor = color;
        if (task.priority <= 3) {
            textColor = '#ff0000'; // Высокий приоритет - красный
        } else if (task.priority <= 7) {
            textColor = '#ffff00'; // Средний приоритет - желтый
        }
        
        // Левое выравнивание
        visual.text(taskText, x, y, { 
            color: textColor, 
            fontSize: 7,
            align: 'left'
        });
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
};