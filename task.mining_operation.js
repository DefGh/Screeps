const constants = require("./constants");

function onCompleted() {
}

function tryDispatch(task, executor, ctx) {
    if (task.type !== constants.taskTypes.MINING_OPERATION) {
        return [];
    }

    if (isPausedByNearbyEnemy(task)) {
        return [];
    }

    if (ctx.executorType === "spawn") {
        return tryDispatchSpawn(task, executor);
    }

    if (ctx.executorType === "room") {
        return tryDispatchRoom(task, executor);
    }

    if (ctx.executorType === "creep") {
        return tryDispatchCreep(task, executor);
    }

    return [];
}

function isPausedByNearbyEnemy(task) {
    if ((task.data.blockedUntil || 0) > Game.time) {
        return true;
    }

    if (!task.data.anchor) {
        return false;
    }

    const room = Game.rooms[task.data.anchor.roomName];

    if (!room) {
        return false;
    }

    if (!hasEnemyNearAnchor(room, task.data.anchor)) {
        delete task.data.blockedUntil;
        return false;
    }

    task.data.blockedUntil = Game.time + 100;
    return true;
}

function tryDispatchSpawn(task, spawn) {
    if (spawn.room.name !== task.room) {
        return [];
    }

    if (findLiveMiner(task.room, task.data.sourceId) || hasActiveAction(task, constants.actionTypes.SPAWN_CREEP)) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.SPAWN_CREEP,
            data: {
                memory: {
                    anchor: task.data.anchor,
                    sourceId: task.data.sourceId,
                },
                role: constants.roles.MINER,
            },
        },
    ];
}

function tryDispatchRoom(task, room) {
    if (
        room.name !== task.room ||
        hasContainerOrSiteAt(room, task.data.anchor) ||
        hasActiveAction(task, constants.actionTypes.PLACE_CONSTRUCTION_SITE)
    ) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: task.data.anchor.roomName,
                structureType: STRUCTURE_CONTAINER,
                x: task.data.anchor.x,
                y: task.data.anchor.y,
            },
        },
    ];
}

function tryDispatchCreep(task, creep) {
    if (creep.memory.role === constants.roles.MINER) {
        return tryDispatchMiner(task, creep);
    }

    if (
        creep.memory.role !== constants.roles.UNIVERSAL ||
        creep.memory.originRoomName !== task.room
    ) {
        return [];
    }

    const miner = findLiveMiner(task.room, task.data.sourceId);

    if (
        !miner ||
        isAtAnchor(miner, task.data.anchor) ||
        hasActiveAction(task, constants.actionTypes.TAXI)
    ) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.TAXI,
            data: {
                passengerName: miner.name,
                roomName: task.data.anchor.roomName,
                x: task.data.anchor.x,
                y: task.data.anchor.y,
            },
        },
    ];
}

function tryDispatchMiner(task, creep) {
    if (
        creep.memory.originRoomName !== task.room ||
        creep.memory.sourceId !== task.data.sourceId ||
        !isAtAnchor(creep, task.data.anchor) ||
        hasActiveAction(task, constants.actionTypes.MINE)
    ) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.MINE,
            data: {
                sourceId: task.data.sourceId,
            },
        },
    ];
}

function findLiveMiner(roomName, sourceId) {
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role === constants.roles.MINER &&
            creep.memory.originRoomName === roomName &&
            creep.memory.sourceId === sourceId
        ) {
            return creep;
        }
    }

    return null;
}

function hasActiveAction(task, actionType) {
    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (action && action.type === actionType && action.status !== "done") {
            return true;
        }
    }

    return false;
}

function hasContainerOrSiteAt(room, anchor) {
    const structures = room.lookForAt(LOOK_STRUCTURES, anchor.x, anchor.y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_CONTAINER) {
            return true;
        }
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, anchor.x, anchor.y);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_CONTAINER) {
            return true;
        }
    }

    return false;
}

function hasEnemyNearAnchor(room, anchor) {
    const anchorPosition = new RoomPosition(anchor.x, anchor.y, anchor.roomName);
    const hostileCreeps = anchorPosition.findInRange(FIND_HOSTILE_CREEPS, 10);

    if (hostileCreeps.length > 0) {
        return true;
    }

    const hostileStructures = anchorPosition.findInRange(FIND_HOSTILE_STRUCTURES, 10);

    return hostileStructures.length > 0;
}

function isAtAnchor(creep, anchor) {
    return (
        creep.pos.roomName === anchor.roomName &&
        creep.pos.x === anchor.x &&
        creep.pos.y === anchor.y
    );
}

module.exports = {
    onCompleted,
    tryDispatch,
};
