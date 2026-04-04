const tasks = require("./tasks");

function execute(room, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const targetRoom = action.data.roomName
        ? Game.rooms[action.data.roomName]
        : room;

    if (!targetRoom) {
        return true;
    }

    if (hasStructureOrSite(targetRoom, action.data)) {
        return true;
    }

    const result = targetRoom.createConstructionSite(
        action.data.x,
        action.data.y,
        action.data.structureType
    );

    return (
        result === OK ||
        result === ERR_FULL ||
        result === ERR_INVALID_TARGET ||
        result === ERR_NOT_OWNER ||
        result === ERR_RCL_NOT_ENOUGH
    );
}

function onCompleted() {
}

function onCreepDeath() {
}

function hasStructureOrSite(room, data) {
    const structures = room.lookForAt(LOOK_STRUCTURES, data.x, data.y);

    for (const structure of structures) {
        if (structure.structureType === data.structureType) {
            return true;
        }
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, data.x, data.y);

    for (const site of sites) {
        if (site.structureType === data.structureType) {
            return true;
        }
    }

    return false;
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
