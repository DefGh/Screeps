taskManager = require('task.manager');;
common = require('common');
constants = require('constants');
roomInitializer = require('room.initializer');

module.exports.loop = function () {
    // Инициализация комнаты (один раз в начале)
    roomInitializer.initializeRoom();

    // Check executers health and handle deaths
    taskManager.checkExecutersHealth();

    // Assign tasks to available executers
    taskManager.assignExecutersToTasks();

    // Run all assigned executers through the task manager
    taskManager.runExecuters();
}

