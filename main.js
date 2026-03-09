const taskManager = require("task.manager");
const common = require("common");
const constants = require("constants");
const roomInitializer = require("room.initializer");

module.exports.loop = function () {
    // Инициализация комнаты (один раз в начале)
    roomInitializer.initializeRoom();

    // Check executers health and handle deaths
    taskManager.checkExecutersHealth();

    // Assign tasks to available executers and generate new ones
    taskManager.assignExecutersToTasks();
    taskManager.generateTasks();

    // Run all assigned executers through the task manager
    taskManager.runExecuters();
};
