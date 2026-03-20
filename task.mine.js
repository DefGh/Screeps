const constants = require("./constants");
const resourceManager = require("./resource.manager");
const sourceManager = require("./source.manager");

function run(creep, task) {
    if (!isValidMineTask(task) || typeof creep.harvest !== "function") {
        return true;
    }

    if (creep.spawning) {
        return false;
    }

    const source = resolveObject(task.data.sourceId);

    if (!source) {
        return false;
    }

    const minerPos = sourceManager.getMinerPos(task.data.sourceId);

    if (!minerPos || !isExactPosition(creep.pos, minerPos)) {
        return false;
    }

    const result = creep.harvest(source);

    if (result === OK) {
        resourceManager.invalidateResourcePlanCache();
    }

    if (
        result === OK ||
        result === ERR_BUSY ||
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_TIRED ||
        result === ERR_NOT_IN_RANGE
    ) {
        return false;
    }

    return false;
}

function resolveObject(objectId) {
    if (!objectId) {
        return null;
    }

    return Game.getObjectById(objectId);
}

function isExactPosition(position, targetPos) {
    return Boolean(
        position &&
        targetPos &&
        position.x === targetPos.x &&
        position.y === targetPos.y &&
        position.roomName === targetPos.roomName
    );
}

function isValidMineTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.MINE &&
        task.data &&
        typeof task.data.sourceId === "string"
    );
}

function canExecute(executor, task) {
    return isValidMineTask(task) && typeof executor.harvest === "function";
}

module.exports = {
    canExecute,
    run,
};
