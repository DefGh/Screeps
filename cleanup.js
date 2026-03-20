function cleanupDeadCreeps() {
    for (const name in Memory.creeps) {
        if (Game.creeps[name]) {
            continue;
        }

        const creepMemory = Memory.creeps[name];

        if (creepMemory && creepMemory.taskId && Memory.tasks[creepMemory.taskId]) {
            delete Memory.tasks[creepMemory.taskId];
        }

        delete Memory.creeps[name];
    }
}

module.exports = {
    cleanupDeadCreeps,
};
