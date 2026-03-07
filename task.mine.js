const constants = require("constants");
const taskManager = require("task.manager");

module.exports = {
    run(executer, task) {
        const { sourceId, position } = task.data || {};

        // Invalid task data – complete to avoid being stuck
        if (!sourceId || !position) {
            return true;
        }

        const source = Game.getObjectById(sourceId);

        // Source not found – nothing to mine
        if (!source) {
            return true;
        }

        const atMiningPosition =
            executer.pos.x === position.x && executer.pos.y === position.y;

        // On mining position – harvest in a loop
        if (atMiningPosition) {
            const result = executer.harvest(source);

            if (result === ERR_NOT_ENOUGH_RESOURCES) {
                // Source is empty, keep waiting at the spot
                return false;
            }

            // Either successfully mined or got another recoverable error – retry next tick
            return false;
        }

        // Not on mining position – ensure there is a taxi task to pull this creep
        taskManager.tryAddTask(
            {
                type: constants.taskTypes.TAXI,
                canExecute: [constants.roles.UNIVERSAL],
                repeatable: false,
                maxExecuters: 1,
                priority: 1,
                data: {
                    whom: executer.id,
                    where: position,
                },
            },
            "taxi" + executer.id
        );

        return false;
    },
};
