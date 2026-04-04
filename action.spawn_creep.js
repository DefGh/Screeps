const creepRoles = require("./creep.roles");
const constants = require("./constants");
const debug = require("./debug");
const tasks = require("./tasks");

function execute(spawn, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    if (spawn.spawning) {
        return false;
    }

    if (!action.data.creepName) {
        action.data.creepName = nextCreepName(action.data.role);
    }

    const roleSpec = creepRoles.get(action.data.role);

    if (!roleSpec) {
        debug.log(`[runner] unknown role ${action.data.role}`);
        return false;
    }

    const body = roleSpec.buildBody(spawn, action);

    if (body.length === 0) {
        return false;
    }

    const result = spawn.spawnCreep(
        body,
        action.data.creepName,
        {
            memory: createCreepMemory(spawn, action, roleSpec, body),
        }
    );

    if (result === OK) {
        return true;
    }

    if (
        result === ERR_BUSY ||
        result === ERR_NOT_ENOUGH_ENERGY ||
        result === ERR_RCL_NOT_ENOUGH
    ) {
        return false;
    }

    if (result === ERR_NAME_EXISTS) {
        action.data.creepName = nextCreepName(action.data.role);
        return false;
    }

    debug.log(`[runner] spawn ${spawn.name} failed ${action.type} with ${result}`);
    return false;
}

function onCompleted(action) {
    const task = tasks.getTask(action.taskId);

    if (!task || task.type !== constants.taskTypes.SPAWN_CREEP) {
        return;
    }

    task.donePercent = 100;
}

function onCreepDeath() {
}

function nextCreepName(role) {
    Memory.creepSequence += 1;
    return `${role}_${Memory.creepSequence}`;
}

function createCreepMemory(spawn, action, roleSpec, body) {
    let roleMemory = {};

    if (roleSpec.buildMemory) {
        roleMemory = roleSpec.buildMemory(spawn, action) || {};
    }
    else if (roleSpec.memory) {
        roleMemory = roleSpec.memory;
    }

    const memory = Object.assign({}, roleMemory, action.data.memory || {}, {
        role: action.data.role,
        originRoomName: spawn.room.name,
    });

    if (action.data.role === constants.roles.UNIVERSAL) {
        memory.generation = Array.isArray(body) ? body.length : 0;
    }

    return memory;
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
