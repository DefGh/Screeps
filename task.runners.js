const constants = require("./constants");
const movement = require("./movement");

function runTask(executor, task) {
    if (task.type === constants.taskTypes.SPAWN_CREEP) {
        return runSpawnTask(executor, task);
    }

    if (task.type === constants.taskTypes.MINE) {
        return runMineTask(executor, task);
    }

    if (task.type === constants.taskTypes.TRANSFER_ENERGY) {
        return runTransferTask(executor, task);
    }

    if (task.type === constants.taskTypes.BUILD) {
        return runBuildTask(executor, task);
    }

    if (task.type === constants.taskTypes.DEFEND_ROOM) {
        return runDefendTask(executor, task);
    }

    if (task.type === constants.taskTypes.SCOUT_ROOM) {
        return runScoutTask(executor, task);
    }

    if (task.type === constants.taskTypes.CLAIM_ROOM) {
        return runClaimTask(executor, task);
    }

    if (task.type === constants.taskTypes.BOOTSTRAP_SPAWN) {
        return runBootstrapTask(executor, task);
    }

    return true;
}

function runSpawnTask(spawn, task) {
    const creepName = buildCreepName(task);
    const memory = Object.assign({}, task.data.memory || {}, {
        originRoomName: task.roomName,
        role: task.data.role,
    });
    const result = spawn.spawnCreep(task.data.body, creepName, {
        memory: memory,
    });

    if (result === OK) {
        return true;
    }

    if (result === ERR_BUSY || result === ERR_NOT_ENOUGH_ENERGY || result === ERR_NAME_EXISTS) {
        return false;
    }

    return true;
}

function runMineTask(creep, task) {
    const source = Game.getObjectById(task.data.sourceId);

    if (!isExactPosition(creep.pos, task.data.minerPos)) {
        movement.moveTo(creep, new RoomPosition(
            task.data.minerPos.x,
            task.data.minerPos.y,
            task.data.minerPos.roomName
        ));
        return false;
    }

    if (getFreeEnergyCapacity(creep) <= 0) {
        creep.drop(RESOURCE_ENERGY);
    }

    const result = creep.harvest(source);

    if (
        result === OK ||
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_TIRED ||
        result === ERR_BUSY
    ) {
        return false;
    }

    return result !== ERR_NOT_IN_RANGE;
}

function runTransferTask(creep, task) {
    if (task.data.stage === constants.transferStages.COLLECT) {
        return runTransferCollectStage(creep, task);
    }

    if (task.data.stage === constants.transferStages.DELIVER) {
        return runTransferDeliverStage(creep, task);
    }

    return true;
}

function runTransferCollectStage(creep, task) {
    const currentEnergy = getUsedEnergy(creep);

    if (
        task.data.collectRemainingAmount <= 0 ||
        getFreeEnergyCapacity(creep) <= 0 ||
        currentEnergy >= task.data.remainingAmount
    ) {
        task.data.stage = constants.transferStages.DELIVER;
        return false;
    }

    const source = Game.getObjectById(task.data.sourceId);
    const energyBefore = getUsedEnergy(creep);
    let result = ERR_INVALID_TARGET;

    if (task.data.sourceKind === "source") {
        result = creep.harvest(source);
    }
    else if (task.data.sourceKind === "container") {
        result = creep.withdraw(source, RESOURCE_ENERGY, task.data.collectRemainingAmount);
    }
    else if (task.data.sourceKind === "pile") {
        result = creep.pickup(source);
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, source);
        return false;
    }

    if (result === OK) {
        const collectedAmount = Math.max(0, getUsedEnergy(creep) - energyBefore);
        task.data.collectRemainingAmount = Math.max(0, task.data.collectRemainingAmount - collectedAmount);

        if (
            task.data.collectRemainingAmount <= 0 ||
            getFreeEnergyCapacity(creep) <= 0 ||
            getUsedEnergy(creep) >= task.data.remainingAmount
        ) {
            task.data.remainingAmount = Math.min(task.data.remainingAmount, getUsedEnergy(creep));
            task.data.stage = constants.transferStages.DELIVER;
        }

        return false;
    }

    if (
        result === ERR_NOT_ENOUGH_RESOURCES ||
        result === ERR_FULL
    ) {
        if (getUsedEnergy(creep) > 0) {
            task.data.remainingAmount = Math.min(task.data.remainingAmount, getUsedEnergy(creep));
            task.data.stage = constants.transferStages.DELIVER;
            return false;
        }

        return true;
    }

    return result === ERR_BUSY ? false : true;
}

function runTransferDeliverStage(creep, task) {
    if (task.data.remainingAmount <= 0) {
        return true;
    }

    if (getUsedEnergy(creep) <= 0) {
        return true;
    }

    const target = Game.getObjectById(task.data.targetId);
    let result = ERR_INVALID_TARGET;
    const energyBefore = getUsedEnergy(creep);

    if (task.data.targetType === "controller") {
        result = creep.upgradeController(target);
    }
    else {
        const transferAmount = Math.min(task.data.remainingAmount, getUsedEnergy(creep));
        result = creep.transfer(target, RESOURCE_ENERGY, transferAmount);
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target);
        return false;
    }

    if (result === OK) {
        const spent = Math.max(0, energyBefore - getUsedEnergy(creep));
        task.data.remainingAmount = Math.max(0, task.data.remainingAmount - spent);
        return task.data.remainingAmount <= 0;
    }

    if (
        result === ERR_BUSY ||
        result === ERR_TIRED
    ) {
        return false;
    }

    return true;
}

function runBuildTask(creep, task) {
    if (task.data.stage === constants.buildStages.COLLECT) {
        return runBuildCollectStage(creep, task);
    }

    if (task.data.stage === constants.buildStages.BUILD) {
        return runBuildWorkStage(creep, task);
    }

    return true;
}

function runBuildCollectStage(creep, task) {
    const currentEnergy = getUsedEnergy(creep);

    if (
        task.data.collectRemainingAmount <= 0 ||
        getFreeEnergyCapacity(creep) <= 0 ||
        currentEnergy >= task.data.remainingAmount
    ) {
        task.data.stage = constants.buildStages.BUILD;
        return false;
    }

    const source = Game.getObjectById(task.data.sourceId);
    const energyBefore = getUsedEnergy(creep);
    let result = ERR_INVALID_TARGET;

    if (task.data.sourceKind === "source") {
        result = creep.harvest(source);
    }
    else if (task.data.sourceKind === "container") {
        result = creep.withdraw(source, RESOURCE_ENERGY, task.data.collectRemainingAmount);
    }
    else if (task.data.sourceKind === "pile") {
        result = creep.pickup(source);
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, source);
        return false;
    }

    if (result === OK) {
        const collectedAmount = Math.max(0, getUsedEnergy(creep) - energyBefore);
        task.data.collectRemainingAmount = Math.max(0, task.data.collectRemainingAmount - collectedAmount);

        if (
            task.data.collectRemainingAmount <= 0 ||
            getFreeEnergyCapacity(creep) <= 0 ||
            getUsedEnergy(creep) >= task.data.remainingAmount
        ) {
            task.data.remainingAmount = Math.min(task.data.remainingAmount, getUsedEnergy(creep));
            task.data.stage = constants.buildStages.BUILD;
        }

        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES || result === ERR_FULL) {
        if (getUsedEnergy(creep) > 0) {
            task.data.remainingAmount = Math.min(task.data.remainingAmount, getUsedEnergy(creep));
            task.data.stage = constants.buildStages.BUILD;
            return false;
        }

        return true;
    }

    return result === ERR_BUSY ? false : true;
}

function runBuildWorkStage(creep, task) {
    const target = Game.getObjectById(task.data.targetId);

    if (getUsedEnergy(creep) <= 0) {
        return true;
    }

    const energyBefore = getUsedEnergy(creep);
    const result = creep.build(target);

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target);
        return false;
    }

    if (result === OK) {
        const spent = Math.max(0, energyBefore - getUsedEnergy(creep));
        task.data.remainingAmount = Math.max(0, task.data.remainingAmount - spent);
        return task.data.remainingAmount <= 0 || target.progress >= target.progressTotal;
    }

    if (result === ERR_BUSY || result === ERR_TIRED) {
        return false;
    }

    return true;
}

function runDefendTask(creep, task) {
    if (!creep.room || creep.room.name !== task.data.roomName) {
        movement.moveTo(creep, new RoomPosition(25, 25, task.data.roomName));
        return false;
    }

    const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);

    if (hostiles.length === 0) {
        return true;
    }

    const target = creep.pos.findClosestByRange(hostiles);
    const result = creep.attack(target);

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, target);
        return false;
    }

    return result === OK ? false : result === ERR_BUSY || result === ERR_TIRED ? false : true;
}

function runScoutTask(creep, task) {
    if (creep.room && creep.room.name === task.data.targetRoomName) {
        return true;
    }

    movement.moveTo(creep, new RoomPosition(25, 25, task.data.targetRoomName));
    return false;
}

function runClaimTask(creep, task) {
    const room = Game.rooms[task.data.targetRoomName] || creep.room;
    const controller = room && room.controller;

    if (controller && controller.my) {
        return true;
    }

    if (!controller) {
        movement.moveTo(creep, new RoomPosition(25, 25, task.data.targetRoomName));
        return false;
    }

    const result = creep.claimController(controller);

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, controller);
        return false;
    }

    if (result === OK) {
        return true;
    }

    if (result === ERR_GCL_NOT_ENOUGH) {
        return true;
    }

    if (result === ERR_BUSY || result === ERR_TIRED) {
        return false;
    }

    return true;
}

function runBootstrapTask(creep, task) {
    if (hasOwnedSpawnInRoom(task.data.targetRoomName)) {
        return true;
    }

    if (!creep.room || creep.room.name !== task.data.targetRoomName) {
        task.data.stage = "move";
        movement.moveTo(creep, new RoomPosition(25, 25, task.data.targetRoomName));
        return false;
    }

    const targetRoom = creep.room;
    const targetPos = resolveBootstrapTargetPos(targetRoom, task);

    if (!targetPos) {
        return false;
    }

    const spawnSite = ensureBootstrapSpawnSite(targetRoom, task, targetPos);

    if (hasOwnedSpawnInRoom(task.data.targetRoomName)) {
        return true;
    }

    if (getUsedEnergy(creep) <= 0) {
        task.data.stage = "collect";
        return runBootstrapCollectStage(creep, task, targetRoom);
    }

    task.data.stage = "build";

    if (!spawnSite) {
        return false;
    }

    const result = creep.build(spawnSite);

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, spawnSite);
        return false;
    }

    if (result === OK || result === ERR_BUSY || result === ERR_TIRED) {
        return false;
    }

    if (result === ERR_NOT_ENOUGH_RESOURCES) {
        task.data.stage = "collect";
        return false;
    }

    return result === ERR_INVALID_TARGET ? hasOwnedSpawnInRoom(task.data.targetRoomName) : false;
}

function runBootstrapCollectStage(creep, task, room) {
    const source = findBootstrapEnergySource(room);

    if (!source) {
        return false;
    }

    let result = ERR_INVALID_TARGET;

    if (source.kind === "source") {
        result = creep.harvest(source.object);
    }
    else if (source.kind === "container") {
        result = creep.withdraw(source.object, RESOURCE_ENERGY);
    }
    else if (source.kind === "pile") {
        result = creep.pickup(source.object);
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, source.object);
        return false;
    }

    if (result === OK || result === ERR_BUSY || result === ERR_TIRED) {
        return false;
    }

    return getUsedEnergy(creep) > 0 ? false : true;
}

function ensureBootstrapSpawnSite(room, task, targetPos) {
    const existingSpawn = findOwnedSpawnAt(room, targetPos);

    if (existingSpawn) {
        return null;
    }

    const existingSite = findOwnedSpawnSiteAt(room, targetPos);

    if (existingSite) {
        return existingSite;
    }

    const result = room.createConstructionSite(targetPos.x, targetPos.y, STRUCTURE_SPAWN);

    if (result === OK || result === ERR_FULL) {
        return findOwnedSpawnSiteAt(room, targetPos);
    }

    if (result === ERR_INVALID_TARGET) {
        task.data.targetPos = null;
    }

    return null;
}

function resolveBootstrapTargetPos(room, task) {
    if (task.data.targetPos && isValidBootstrapPos(room, task.data.targetPos)) {
        return task.data.targetPos;
    }

    for (let x = 4; x <= 45; x += 1) {
        for (let y = 4; y <= 45; y += 1) {
            const pos = {
                roomName: room.name,
                x: x,
                y: y,
            };

            if (isValidBootstrapPos(room, pos)) {
                task.data.targetPos = pos;
                return pos;
            }
        }
    }

    return null;
}

function isValidBootstrapPos(room, pos) {
    if (pos.roomName !== room.name) {
        return false;
    }

    const terrain = room.getTerrain();

    if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);

    for (const structure of structures) {
        if (structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_RAMPART) {
            return false;
        }
    }

    return countOpenNeighbors(room, pos) >= constants.bootstrap.MIN_OPEN_NEIGHBORS;
}

function countOpenNeighbors(room, pos) {
    let count = 0;

    for (let x = pos.x - 1; x <= pos.x + 1; x += 1) {
        for (let y = pos.y - 1; y <= pos.y + 1; y += 1) {
            if (x === pos.x && y === pos.y) {
                continue;
            }

            if (x < 0 || x > 49 || y < 0 || y > 49) {
                continue;
            }

            if (room.getTerrain().get(x, y) === TERRAIN_MASK_WALL) {
                continue;
            }

            count += 1;
        }
    }

    return count;
}

function findBootstrapEnergySource(room) {
    const piles = room.find(FIND_DROPPED_RESOURCES, {
        filter: function (resource) {
            return resource.resourceType === RESOURCE_ENERGY && resource.amount > 0;
        },
    });

    if (piles.length > 0) {
        return {
            kind: "pile",
            object: piles[0],
        };
    }

    const containers = room.find(FIND_STRUCTURES, {
        filter: function (structure) {
            return (
                (
                    structure.structureType === STRUCTURE_CONTAINER ||
                    structure.structureType === STRUCTURE_STORAGE
                ) &&
                getUsedEnergy(structure) > 0
            );
        },
    });

    if (containers.length > 0) {
        return {
            kind: "container",
            object: containers[0],
        };
    }

    const sources = room.find(FIND_SOURCES);

    if (sources.length > 0) {
        return {
            kind: "source",
            object: sources[0],
        };
    }

    return null;
}

function hasOwnedSpawnInRoom(roomName) {
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];

        if (spawn.room.name === roomName) {
            return true;
        }
    }

    const room = Game.rooms[roomName];
    return Boolean(room && room.controller && room.controller.my && room.find(FIND_MY_SPAWNS).length > 0);
}

function findOwnedSpawnAt(room, pos) {
    const spawns = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);

    for (const structure of spawns) {
        if (structure.structureType === STRUCTURE_SPAWN && structure.my) {
            return structure;
        }
    }

    return null;
}

function findOwnedSpawnSiteAt(room, pos) {
    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_SPAWN && site.my) {
            return site;
        }
    }

    return null;
}

function buildCreepName(task) {
    return [
        task.data.role,
        task.roomName,
        Game.time,
        Math.floor(Math.random() * 1000),
    ].join("-");
}

function isExactPosition(position, targetPos) {
    return (
        position.x === targetPos.x &&
        position.y === targetPos.y &&
        position.roomName === targetPos.roomName
    );
}

function getUsedEnergy(object) {
    if (object.store) {
        return object.store.getUsedCapacity(RESOURCE_ENERGY) || object.store[RESOURCE_ENERGY] || 0;
    }

    if (object.carry) {
        return object.carry[RESOURCE_ENERGY];
    }

    return object.energy || 0;
}

function getFreeEnergyCapacity(object) {
    if (object.store) {
        return object.store.getFreeCapacity(RESOURCE_ENERGY) || 0;
    }

    if (object.storeCapacity) {
        return Math.max(0, object.storeCapacity - object.store[RESOURCE_ENERGY]);
    }

    if (object.energyCapacity) {
        return Math.max(0, object.energyCapacity - object.energy);
    }

    return 0;
}

module.exports = {
    runTask,
};
