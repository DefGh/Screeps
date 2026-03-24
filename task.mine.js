const constants = require("./constants");
const resourceManager = require("./resource.manager");
const sourceManager = require("./source.manager");
const taskHelpers = require("./task.helpers");

function run(creep, task) {
    if (!isValidMineTask(task) || typeof creep.harvest !== "function") {
        return true;
    }

    if (creep.spawning) {
        return false;
    }

    const source = taskHelpers.resolveObject(task.data.sourceId);

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
    return taskHelpers.hasTaskDataFields(task, constants.taskTypes.MINE, {
        roomName: "string",
        sourceId: "string",
    });
}

function canExecute(executor, task) {
    return Boolean(
        validate(task) &&
        taskHelpers.canExecuteTaskInRoom(executor, task.data.roomName, ["harvest"])
    );
}

function validate(task) {
    return isValidMineTask(task);
}

function getOwnerRoom(task) {
    return taskHelpers.getTaskOwnerRoom(task, validate, "roomName");
}

module.exports = {
    canExecute,
    getOwnerRoom,
    run,
    validate,
};
