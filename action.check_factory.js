const debug = require("./debug");
const tasks = require("./tasks");

function create(runCheck) {
    return {
        execute: function (room) {
            runCheck(room, {
                addTask: tasks.addTask,
                listTasks: tasks.listTasks,
                log: debug.log,
                removeTask: tasks.removeTask,
            });
            return true;
        },
        onCompleted: function (action) {
            const task = tasks.getTask(action.taskId);

            if (!task) {
                return;
            }

            task.donePercent = 100;
        },
        onCreepDeath: function () {
        },
    };
}

module.exports = create;
