const taskManager = require("task.manager");
const common = require("common");
const constants = require("constants");
const roomInitializer = require("room.initializer");
const roomVisualizer = require("room.visualizer");
const constructionManager = require("construction.manager");

require("creep.prototype")

module.exports.loop = function () {
    // Инициализация комнаты (один раз в начале)
    roomInitializer.initializeRoom();

    // Визуализация комнаты (отображение задач и резервов ресурсов)
    roomVisualizer.visualize();

    // Check executers health and handle deaths
    taskManager.checkExecutersHealth();

    // Assign tasks to available executers and generate new ones
    taskManager.assignExecutersToTasks();
    taskManager.generateTasks();
    constructionManager.generateTasks();

    // Run all assigned executers through the task manager
    taskManager.runExecuters();

    for(var i in Memory.creeps) {
        if(!Game.creeps[i]) {
            delete Memory.creeps[i];
            delete Memory.resourceManager.reservations[i];
        }
    }
};
