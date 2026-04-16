const constants = require("./constants");
const longRangeMining = require("./long_range_mining");
const resourceManager = require("./resource.manager");
const renewUniversal = require("./renew.universal");

const HAULER_RENEW_TARGET_TTL = 1400;

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
        return tryDispatchSpawn(task, executor, ctx);
    }

    if (ctx.executorType === "room") {
        return tryDispatchRoom(task, executor);
    }

    if (ctx.executorType === "creep") {
        return tryDispatchCreep(task, executor, ctx);
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

function tryDispatchSpawn(task, spawn, ctx) {
    if (spawn.room.name !== task.room) {
        return [];
    }

    if (
        ctx &&
        ctx.listTasks &&
        renewUniversal.hasActiveRenewTaskForSpawn(task.room, spawn.name, ctx.listTasks)
    ) {
        return [];
    }

    if (task.data.isRemote) {
        const renewAction = tryDispatchRemoteHaulerRenew(task, spawn);

        if (renewAction.length > 0) {
            return renewAction;
        }
    }

    if (countUniversals(task.room) < 3) {
        return [];
    }

    if (task.data.isRemote) {
        return tryDispatchRemoteSpawn(task);
    }

    if (findLiveMiner(task.room, task.data.sourceId) || hasActiveSpawnAction(task, constants.roles.MINER)) {
        return [];
    }

    return [createMinerSpawnTemplate(task)];
}

function tryDispatchRemoteSpawn(task) {
    const miner = findLiveMiner(task.room, task.data.sourceId);

    if (!miner && !hasActiveSpawnAction(task, constants.roles.MINER)) {
        return [createMinerSpawnTemplate(task)];
    }

    if (
        !miner ||
        findLiveHauler(task.room, task.data.sourceId) ||
        hasActiveSpawnAction(task, constants.roles.HAULER)
    ) {
        return [];
    }

    const container = longRangeMining.getRemoteContainer(task.data.anchor);

    if (!container || !task.data.deliveryTargetId) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.SPAWN_CREEP,
            data: {
                memory: {
                    anchor: task.data.anchor,
                    deliveryTargetId: task.data.deliveryTargetId,
                    sourceId: task.data.sourceId,
                    sourceRoomName: task.data.sourceRoomName,
                },
                role: constants.roles.HAULER,
            },
        },
    ];
}

function tryDispatchRemoteHaulerRenew(task, spawn) {
    const primarySpawn = renewUniversal.getPrimarySpawn(task.room);
    const hauler = findLiveHauler(task.room, task.data.sourceId);

    if (
        !primarySpawn ||
        primarySpawn.name !== spawn.name ||
        spawn.spawning ||
        !hauler ||
        !spawn.pos.isNearTo(hauler) ||
        !hauler.memory.restoreTtl ||
        !Number.isFinite(hauler.ticksToLive) ||
        hauler.ticksToLive >= HAULER_RENEW_TARGET_TTL
    ) {
        return [];
    }

    return [
        createRenewCreepTemplate(spawn.name, hauler.name, HAULER_RENEW_TARGET_TTL),
    ];
}

function tryDispatchRoom(task, room) {
    const anchorRoom = getAnchorRoom(room, task.data.anchor);

    if (
        room.name !== task.room ||
        !anchorRoom ||
        hasContainerOrSiteAt(anchorRoom, task.data.anchor) ||
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

function tryDispatchCreep(task, creep, ctx) {
    if (creep.memory.role === constants.roles.MINER) {
        return tryDispatchMiner(task, creep);
    }

    if (creep.memory.role === constants.roles.HAULER) {
        return tryDispatchHauler(task, creep, ctx);
    }

    if (
        creep.memory.role !== constants.roles.UNIVERSAL ||
        creep.memory.originRoomName !== task.room
    ) {
        return [];
    }

    const taxiAction = tryDispatchTaxi(task);

    if (taxiAction.length > 0) {
        return taxiAction;
    }

    if (task.data.isRemote) {
        return tryDispatchRemoteBuilder(task, creep);
    }

    return [];
}

function tryDispatchTaxi(task) {
    if (task.data.isRemote) {
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

function tryDispatchRemoteBuilder(task, creep) {
    const site = longRangeMining.getRemoteContainerSite(task.data.anchor);

    if (
        !site ||
        hasActiveAction(task, constants.actionTypes.BUILD)
    ) {
        return [];
    }

    const remainingAmount = Math.max(0, site.progressTotal - site.progress);

    if (remainingAmount <= 0) {
        return [];
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy > 0) {
        return [createBuildTemplate(site, Math.min(currentEnergy, remainingAmount))];
    }

    const assignedAmount = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        remainingAmount
    );
    const energyAction = resourceManager.reserveInRoom(
        creep,
        assignedAmount,
        task.data.anchor.roomName
    );

    if (!energyAction) {
        return [];
    }

    return [
        energyAction,
        createBuildTemplate(site, assignedAmount),
    ];
}

function tryDispatchMiner(task, creep) {
    if (
        creep.memory.originRoomName !== task.room ||
        creep.memory.sourceId !== task.data.sourceId
    ) {
        return [];
    }

    if (!isAtAnchor(creep, task.data.anchor)) {
        if (
            task.data.isRemote &&
            creep.getActiveBodyparts(MOVE) > 0 &&
            !hasActiveAction(task, constants.actionTypes.GO_TO_TARGET)
        ) {
            return [
                {
                    type: constants.actionTypes.GO_TO_TARGET,
                    data: {
                        roomName: task.data.anchor.roomName,
                        x: task.data.anchor.x,
                        y: task.data.anchor.y,
                    },
                },
            ];
        }

        return [];
    }

    if (hasActiveAction(task, constants.actionTypes.MINE)) {
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

function tryDispatchHauler(task, creep, ctx) {
    if (
        !task.data.isRemote ||
        creep.memory.originRoomName !== task.room ||
        creep.memory.sourceId !== task.data.sourceId
    ) {
        return [];
    }

    if (creep.memory.restoreTtl) {
        ensureHaulerRenewTask(task, creep, ctx);
        return tryDispatchHaulerRenew(task, creep);
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy > 0) {
        const deliveryTarget = Game.getObjectById(task.data.deliveryTargetId);

        if (
            !deliveryTarget ||
            deliveryTarget.store.getFreeCapacity(RESOURCE_ENERGY) <= 0
        ) {
            return [];
        }

        creep.memory.tripPhase = "deliver";
        return [
            {
                type: constants.actionTypes.TRANSFER_ENERGY,
                data: {
                    amount: currentEnergy,
                    done: 0,
                    targetId: deliveryTarget.id,
                },
            },
        ];
    }

    if (creep.memory.tripPhase === "deliver") {
        creep.memory.restoreTtl = true;
        ensureHaulerRenewTask(task, creep, ctx);
        return tryDispatchHaulerRenew(task, creep);
    }

    const container = longRangeMining.getRemoteContainer(task.data.anchor);

    if (!container) {
        return [];
    }

    const amount = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        container.store.getUsedCapacity(RESOURCE_ENERGY)
    );

    if (amount <= 0) {
        return [];
    }

    creep.memory.tripPhase = "pickup";
    return [
        {
            type: constants.actionTypes.TAKE_RESOURCE,
            data: {
                amount: amount,
                fromId: container.id,
                roomName: task.data.anchor.roomName,
                x: task.data.anchor.x,
                y: task.data.anchor.y,
            },
        },
    ];
}

function tryDispatchHaulerRenew(task, creep) {
    if (isHaulerRenewComplete(creep)) {
        clearHaulerRenewState(creep);
        return [];
    }

    const primarySpawn = renewUniversal.getPrimarySpawn(task.room);

    if (!primarySpawn) {
        return [];
    }

    return [
        createMoveToRenewTemplate(primarySpawn.name, creep.name, HAULER_RENEW_TARGET_TTL),
    ];
}

function countUniversals(roomName) {
    var count = 0;
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role === constants.roles.UNIVERSAL &&
            creep.memory.originRoomName === roomName
        ) {
            count++;
        }
    }

    return count;
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

function findLiveHauler(roomName, sourceId) {
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.role === constants.roles.HAULER &&
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

function hasActiveSpawnAction(task, role) {
    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.SPAWN_CREEP &&
            action.status !== "done" &&
            action.data &&
            action.data.role === role
        ) {
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

function createMinerSpawnTemplate(task) {
    return {
        type: constants.actionTypes.SPAWN_CREEP,
        data: {
            memory: {
                anchor: task.data.anchor,
                sourceId: task.data.sourceId,
                sourceRoomName: task.data.sourceRoomName || task.data.anchor.roomName,
            },
            role: constants.roles.MINER,
        },
    };
}

function createBuildTemplate(target, amount) {
    return {
        type: constants.actionTypes.BUILD,
        data: {
            amount: amount,
            done: 0,
            roomName: target.pos.roomName,
            targetId: target.id,
            x: target.pos.x,
            y: target.pos.y,
        },
    };
}

function createMoveToRenewTemplate(spawnName, targetCreepName, renewUntil) {
    return {
        type: constants.actionTypes.MOVE_TO_RENEW,
        data: {
            renewUntil: renewUntil,
            spawnName: spawnName,
            targetCreepName: targetCreepName,
        },
    };
}

function createRenewCreepTemplate(spawnName, targetCreepName, renewUntil) {
    return {
        type: constants.actionTypes.RENEW_CREEP,
        data: {
            renewUntil: renewUntil,
            spawnName: spawnName,
            targetCreepName: targetCreepName,
        },
    };
}

function getAnchorRoom(originRoom, anchor) {
    if (!anchor) {
        return null;
    }

    if (anchor.roomName === originRoom.name) {
        return originRoom;
    }

    return Game.rooms[anchor.roomName] || null;
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

function isHaulerRenewComplete(creep) {
    return !!(
        creep &&
        Number.isFinite(creep.ticksToLive) &&
        creep.ticksToLive >= HAULER_RENEW_TARGET_TTL
    );
}

function clearHaulerRenewState(creep) {
    delete creep.memory.restoreTtl;
    delete creep.memory.tripPhase;
}

function ensureHaulerRenewTask(task, creep, ctx) {
    if (
        !ctx ||
        !ctx.addTask ||
        !ctx.listTasks ||
        !creep.memory.restoreTtl
    ) {
        return;
    }

    const spawn = renewUniversal.getPrimarySpawn(task.room);

    if (!spawn) {
        return;
    }

    const matchedTasks = ctx.listTasks(task.room).filter(function (roomTask) {
        return (
            roomTask.type === constants.taskTypes.RENEW_HAULER &&
            roomTask.data.sourceId === task.data.sourceId
        );
    });

    if (matchedTasks.length > 0) {
        matchedTasks[0].data.renewUntil = HAULER_RENEW_TARGET_TTL;
        matchedTasks[0].data.spawnName = spawn.name;
        matchedTasks[0].data.targetCreepName = creep.name;

        if (ctx.removeTask) {
            for (let index = 1; index < matchedTasks.length; index += 1) {
                ctx.removeTask(matchedTasks[index].id);
            }
        }

        return;
    }

    ctx.addTask(constants.taskTypes.RENEW_HAULER, task.room, {
        renewUntil: HAULER_RENEW_TARGET_TTL,
        spawnName: spawn.name,
        sourceId: task.data.sourceId,
        targetCreepName: creep.name,
    });
}

module.exports = {
    onCompleted,
    tryDispatch,
};
