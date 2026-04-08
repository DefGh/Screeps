const actions = require("./actions");
const constants = require("./constants");
const dispatcher = require("./dispatcher");
const dispatcherCleanup = require("./dispatcher.cleanup");
const tasks = require("./tasks");

function run() {
    runRooms();
    runSpawns();
    runCreeps();
    runTowers();
}

function runRooms() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (!room.controller || !room.controller.my) {
            continue;
        }

        runExecutor(
            room,
            getRoomState(room),
            dispatcher.askRoom
        );
    }
}

function runSpawns() {
    for (const spawnName in Game.spawns) {
        runExecutor(
            Game.spawns[spawnName],
            getSpawnState(Game.spawns[spawnName]),
            dispatcher.askSpawn
        );
    }
}

function runCreeps() {
    for (const creepName in Game.creeps) {
        runExecutor(
            Game.creeps[creepName],
            getCreepState(Game.creeps[creepName]),
            dispatcher.askCreep
        );
    }
}

function runTowers() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (!room.controller || !room.controller.my) {
            continue;
        }

        const towers = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
            return structure.structureType === STRUCTURE_TOWER;
        });

        for (const tower of towers) {
            runExecutor(
                tower,
                getTowerState(tower),
                dispatcher.askTower
            );
        }
    }
}

function runExecutor(executor, state, askForActions) {
    let action = peekAction(state);

    if (!action) {
        queueActions(state, askForActions(executor));
        action = peekAction(state);
    }

    if (!action) {
        return;
    }

    const handler = actions.get(action.type);

    if (!handler) {
        return;
    }

    action.status = "running";

    if (!handler.execute(executor, action)) {
        return;
    }

    handler.onCompleted(action);
    completeAction(state, action);
}

function getRoomState(room) {
    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    if (!Memory.rooms[room.name]) {
        Memory.rooms[room.name] = {};
    }

    if (!Memory.rooms[room.name].actionIds) {
        Memory.rooms[room.name].actionIds = [];
    }

    return Memory.rooms[room.name];
}

function getSpawnState(spawn) {
    if (!Memory.spawns) {
        Memory.spawns = {};
    }

    if (!Memory.spawns[spawn.name]) {
        Memory.spawns[spawn.name] = {};
    }

    if (!Memory.spawns[spawn.name].actionIds) {
        Memory.spawns[spawn.name].actionIds = [];
    }

    return Memory.spawns[spawn.name];
}

function getCreepState(creep) {
    if (!creep.memory.actionIds) {
        creep.memory.actionIds = [];
    }

    return creep.memory;
}

function getTowerState(tower) {
    if (!Memory.towers) {
        Memory.towers = {};
    }

    if (!Memory.towers[tower.id]) {
        Memory.towers[tower.id] = {};
    }

    if (!Memory.towers[tower.id].actionIds) {
        Memory.towers[tower.id].actionIds = [];
    }

    return Memory.towers[tower.id];
}

function peekAction(state) {
    while (state.actionIds.length > 0) {
        const actionId = state.actionIds[0];
        const action = Memory.Dispatcher.actionsById[actionId];

        if (action && action.status !== "done") {
            return action;
        }

        state.actionIds.shift();
    }

    return null;
}

function queueActions(state, actionsToQueue) {
    if (!actionsToQueue || actionsToQueue.length === 0) {
        return;
    }

    for (const action of actionsToQueue) {
        state.actionIds.push(action.id);
    }
}

function completeAction(state, action) {
    const task = tasks.getTask(action.taskId);

    state.actionIds.shift();
    action.status = "done";
    action.finishedAt = Game.time;

    if (task) {
        dispatcherCleanup.normalizeTaskAssignments(task);

        if (isTerminalAction(action.type) && task.donePercent >= 100) {
            tasks.onCompleted(task, action);
        }
    }

    delete Memory.Dispatcher.actionsById[action.id];
}

function isTerminalAction(actionType) {
    return (
        actionType === constants.actionTypes.ATTACK_CONTROLLER ||
        actionType === constants.actionTypes.ATTACK_TARGET ||
        actionType === constants.actionTypes.DISMANTLE_TARGET ||
        actionType === constants.actionTypes.BUILD ||
        actionType === constants.actionTypes.REPAIR ||
        actionType === constants.actionTypes.CLAIM_CONTROLLER ||
        actionType === constants.actionTypes.CHECK_UNIVERSAL_RENEW ||
        actionType === constants.actionTypes.CHECK_FILL_ENERGY ||
        actionType === constants.actionTypes.CHECK_FILL_EXTENSION ||
        actionType === constants.actionTypes.CHECK_FILL_SPAWN ||
        actionType === constants.actionTypes.CHECK_FILL_TOWER ||
        actionType === constants.actionTypes.CHECK_EXPANSION ||
        actionType === constants.actionTypes.CHECK_LONG_RANGE_MINING ||
        actionType === constants.actionTypes.CHECK_UPGRADE_CONTROLLER ||
        actionType === constants.actionTypes.GO_TO_TARGET ||
        actionType === constants.actionTypes.MOVE_TO_RENEW ||
        actionType === constants.actionTypes.CHECK_UNIVERSALS ||
        actionType === constants.actionTypes.PLACE_CONSTRUCTION_SITE ||
        actionType === constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT ||
        actionType === constants.actionTypes.RENEW_CREEP ||
        actionType === constants.actionTypes.RETIRE_CREEP ||
        actionType === constants.actionTypes.SCOUT_ROOM ||
        actionType === constants.actionTypes.SCOUT_OUTPOST_ROOM ||
        actionType === constants.actionTypes.SPAWN_CREEP ||
        actionType === constants.actionTypes.SYNC_MINING_OPERATIONS ||
        actionType === constants.actionTypes.SYNC_ROOM_BUILDER ||
        actionType === constants.actionTypes.SYNC_TOWER_OPERATIONS ||
        actionType === constants.actionTypes.TAXI ||
        actionType === constants.actionTypes.HEAL_TARGET ||
        actionType === constants.actionTypes.TOWER_ATTACK ||
        actionType === constants.actionTypes.TOWER_HEAL ||
        actionType === constants.actionTypes.TOWER_REPAIR ||
        actionType === constants.actionTypes.TRANSFER_ENERGY ||
        actionType === constants.actionTypes.UPGRADE_CONTROLLER
    );
}

module.exports = {
    run,
};
