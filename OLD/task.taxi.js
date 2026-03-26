const constants = require("./constants");
const movement = require("./movement");
const taskIndex = require("./task.index");

function run(creep, task) {
    if (
        !isValidTaxiTask(task) ||
        typeof creep.moveTo !== "function" ||
        typeof creep.pull !== "function" ||
        typeof creep.move !== "function"
    ) {
        return true;
    }

    const miner = Game.creeps[task.data.minerName];
    const targetPos = createRoomPosition(task.data.minerPos);

    if (!targetPos) {
        return false;
    }

    if (!miner) {
        return hasPendingSpawnForMiner(task.data.minerName) ? false : true;
    }

    if (miner.spawning) {
        return false;
    }

    if (isExactPosition(miner.pos, task.data.minerPos)) {
        return true;
    }

    if (!creep.pos.isNearTo(miner)) {
        movement.moveTo(creep, miner);
        return false;
    }

    const pullResult = creep.pull(miner);

    if (pullResult === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, miner);
        return false;
    }

    if (pullResult !== OK && pullResult !== ERR_TIRED && pullResult !== ERR_BUSY) {
        return false;
    }

    if (isExactPosition(creep.pos, task.data.minerPos)) {
         creep.move(miner);
    }
    else {
        movement.moveTo(creep, targetPos);
    }

    miner.move(creep);

    return false;
}

function findPullOutDirection(creep, miner) {
    for (let direction = TOP; direction <= TOP_LEFT; direction += 1) {
        const position = getAdjacentPosition(creep.pos, direction);

        if (!position) {
            continue;
        }

        if (position.x === miner.pos.x && position.y === miner.pos.y) {
            continue;
        }

        if (isWalkable(creep.room, position.x, position.y)) {
            return direction;
        }
    }

    return null;
}

function getAdjacentPosition(position, direction) {
    const offsetsByDirection = {
        [TOP]: { x: 0, y: -1 },
        [TOP_RIGHT]: { x: 1, y: -1 },
        [RIGHT]: { x: 1, y: 0 },
        [BOTTOM_RIGHT]: { x: 1, y: 1 },
        [BOTTOM]: { x: 0, y: 1 },
        [BOTTOM_LEFT]: { x: -1, y: 1 },
        [LEFT]: { x: -1, y: 0 },
        [TOP_LEFT]: { x: -1, y: -1 },
    };

    const offset = offsetsByDirection[direction];

    if (!offset) {
        return null;
    }

    const x = position.x + offset.x;
    const y = position.y + offset.y;

    if (x < 0 || x > 49 || y < 0 || y > 49) {
        return null;
    }

    return {
        x: x,
        y: y,
        roomName: position.roomName,
    };
}

function isWalkable(room, x, y) {
    if (!room) {
        return false;
    }

    if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const structure of structures) {
        if (isImpassableStructure(structure)) {
            return false;
        }
    }

    const creeps = room.lookForAt(LOOK_CREEPS, x, y);
    return creeps.length === 0;
}

function isImpassableStructure(structure) {
    if (!structure || !structure.structureType) {
        return false;
    }

    if (structure.structureType === STRUCTURE_ROAD) {
        return false;
    }

    if (structure.structureType === STRUCTURE_CONTAINER) {
        return false;
    }

    if (structure.structureType === STRUCTURE_RAMPART) {
        return !structure.my && !structure.isPublic;
    }

    if (typeof OBSTACLE_OBJECT_TYPES !== "undefined" && Array.isArray(OBSTACLE_OBJECT_TYPES)) {
        return OBSTACLE_OBJECT_TYPES.includes(structure.structureType);
    }

    return true;
}

function hasPendingSpawnForMiner(minerName) {
    for (const task of taskIndex.getTasksByType(constants.taskTypes.SPAWN_CREEP)) {
        if (!task.data) {
            continue;
        }

        if (task.data.creepName !== minerName) {
            continue;
        }

        if (
            task.status === constants.taskStatuses.PENDING ||
            task.status === constants.taskStatuses.IN_PROGRESS
        ) {
            return true;
        }
    }

    return false;
}

function createRoomPosition(position) {
    if (
        !position ||
        typeof position.x !== "number" ||
        typeof position.y !== "number" ||
        typeof position.roomName !== "string"
    ) {
        return null;
    }

    return new RoomPosition(position.x, position.y, position.roomName);
}

function isExactPosition(position, targetPos) {
    return Boolean(
        position &&
        targetPos &&
        position.x == targetPos.x &&
        position.y == targetPos.y &&
        position.roomName == targetPos.roomName
    );
}

function isValidTaxiTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.TAXI &&
        task.data &&
        typeof task.data.roomName === "string" &&
        typeof task.data.minerName === "string" &&
        typeof task.data.sourceId === "string" &&
        task.data.minerPos &&
        typeof task.data.minerPos.x === "number" &&
        typeof task.data.minerPos.y === "number" &&
        typeof task.data.minerPos.roomName === "string"
    );
}

function resolveTaxiTaskRoomName(task) {
    return validate(task) ? task.data.roomName : null;
}

function canExecute(executor, task) {
    if (
        !validate(task) ||
        !executor ||
        !executor.memory ||
        typeof executor.moveTo !== "function" ||
        typeof executor.pull !== "function" ||
        typeof executor.move !== "function"
    ) {
        return false;
    }

    if (executor.memory.originRoomName !== resolveTaxiTaskRoomName(task)) {
        return false;
    }

    const miner = Game.creeps[task.data.minerName];

    if (miner) {
        return !miner.spawning;
    }

    return !hasPendingSpawnForMiner(task.data.minerName);
}

function validate(task) {
    return isValidTaxiTask(task);
}

function getOwnerRoom(task) {
    return validate(task) ? task.data.roomName : null;
}

module.exports = {
    canExecute,
    getOwnerRoom,
    run,
    validate,
};
