const constants = require("./constants");
const planner = require("./planner.spawn_rings");

function onCompleted() {
}

function tryDispatch(task, room, ctx) {
    if (
        task.type !== constants.taskTypes.SYNC_TOWERS ||
        ctx.executorType !== "room" ||
        room.name !== task.room ||
        !room.controller ||
        !room.controller.my
    ) {
        return [];
    }

    const allowedCount =
        CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
    const activePlacementActions =
        planner.getActivePlacementActions(task, STRUCTURE_TOWER);
    const progress =
        planner.countOwnedStructures(room, STRUCTURE_TOWER) +
        planner.countOwnedSites(room, STRUCTURE_TOWER) +
        activePlacementActions.length;

    if (progress >= allowedCount) {
        ctx.removeTask(task.id);
        return [];
    }

    if (
        Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES ||
        activePlacementActions.length > 0
    ) {
        return [];
    }

    const nextPosition =
        planner.findNextSpawnRingPosition(room, activePlacementActions);

    if (!nextPosition) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: room.name,
                structureType: STRUCTURE_TOWER,
                x: nextPosition.x,
                y: nextPosition.y,
            },
        },
    ];
}

module.exports = {
    onCompleted,
    tryDispatch,
};
