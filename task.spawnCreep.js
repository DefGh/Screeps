module.exports = {
    run(executer, task) {
        // Spawn is currently busy – keep task in progress
        if (executer.spawning) {
            return false;
        }

        const data = task.data || {};
        const { body, role } = data;

        // Invalid task data – complete to avoid being stuck
        if (!body || !role) {
            return true;
        }

        const memory = Object.assign({}, data);
        delete memory.body;

        const spawnResult = executer.spawnCreep(
            body,
            role.toUpperCase() + "_" + Game.time,
            { memory }
        );

        // Only report task finished when spawning successfully started
        return spawnResult === OK;
    },
};