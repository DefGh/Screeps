const store = require("./store");

function cleanupDeadCreeps() {
    const deathsByOriginRoom = {};

    for (const name in Memory.creeps) {
        if (Game.creeps[name]) {
            continue;
        }

        const creepMemory = Memory.creeps[name];
        const originRoomName = creepMemory.originRoomName;

        if (originRoomName) {
            deathsByOriginRoom[originRoomName] = (deathsByOriginRoom[originRoomName] || 0) + 1;
            store.markRoomDirty(originRoomName, "creepDeath");
        }

        if (creepMemory.taskRoomName && creepMemory.taskId) {
            store.removeTask(creepMemory.taskRoomName, creepMemory.taskId, {
                clearAssignments: true,
            });
        }

        delete Memory.creeps[name];
    }

    return deathsByOriginRoom;
}

module.exports = {
    cleanupDeadCreeps,
};
