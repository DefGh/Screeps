const store = require("./store");

function dispatchTask(executor) {
    const roomName = executor.memory.originRoomName;
    const queue = store.getPendingQueue(roomName, executor.memory.role);

    for (const taskId of queue) {
        return store.assignTask(executor, store.getTask(roomName, taskId));
    }

    return null;
}

module.exports = {
    dispatchTask,
};
