const tasks = require("./tasks");

function execute(room, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    if (hasStructureOrSite(room, action.data)) {
        return true;
    }

    const result = room.createConstructionSite(
        action.data.x,
        action.data.y,
        action.data.structureType
    );

    return (
        result === OK ||
        result === ERR_FULL ||
        result === ERR_INVALID_TARGET
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
