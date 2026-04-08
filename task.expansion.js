const constants = require("./constants");
const resourceManager = require("./resource.manager");

function onCompleted() {
}

function tryDispatch(task, executor, ctx) {
    if (task.type !== constants.taskTypes.EXPANSION) {
        return [];
    }

    const expansion = getExpansion();
    const campaign = expansion.getActiveCampaign();

    if (
        !campaign ||
        task.data.campaignId !== campaign.campaignId
    ) {
        return [];
    }

    if (ctx.executorType === "room") {
        return tryDispatchRoom(task, executor, campaign);
    }

    if (ctx.executorType !== "creep" || !executor.memory) {
        return [];
    }

    if (executor.memory.expansionCampaignId !== campaign.campaignId) {
        return [];
    }

    if (executor.memory.role === constants.roles.SCOUT) {
        return tryDispatchScout(task, campaign);
    }

    if (executor.memory.role === constants.roles.CLAIMER) {
        return tryDispatchClaimer(task, campaign);
    }

    if (executor.memory.role === constants.roles.COLONIZER) {
        return tryDispatchColonizer(task, executor, campaign);
    }

    if (executor.memory.role === constants.roles.ATTACKER) {
        return tryDispatchAttacker(task, executor, campaign);
    }

    if (executor.memory.role === constants.roles.HEALER) {
        return tryDispatchHealer(task, executor, campaign);
    }

    if (executor.memory.role === constants.roles.DISMANTLER) {
        return tryDispatchDismantler(task, executor, campaign);
    }

    if (executor.memory.role === constants.roles.LIBERATOR) {
        return tryDispatchLiberator(task, executor, campaign);
    }

    return [];
}

function tryDispatchRoom(task, room, campaign) {
    const expansion = getExpansion();

    if (
        campaign.stage !== expansion.STAGES.BOOTSTRAP_SPAWN ||
        task.room !== campaign.originRoomName ||
        room.name !== campaign.originRoomName
    ) {
        return [];
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (!targetRoom) {
        return [];
    }

    if (getOwnedSpawn(targetRoom) || expansion.getSpawnSiteObject(campaign.targetRoomName)) {
        return [];
    }

    if (Object.keys(Game.constructionSites || {}).length >= MAX_CONSTRUCTION_SITES) {
        return [];
    }

    if (hasPendingPlacement(task, campaign.targetRoomName)) {
        return [];
    }

    const plan = expansion.getSpawnSitePlan(campaign.targetRoomName);

    if (!plan) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.PLACE_CONSTRUCTION_SITE,
            data: {
                roomName: campaign.targetRoomName,
                structureType: STRUCTURE_SPAWN,
                x: plan.x,
                y: plan.y,
            },
        },
    ];
}

function tryDispatchScout(task, campaign) {
    const expansion = getExpansion();

    if (task.room !== campaign.coordinatorRoomName) {
        return [];
    }

    if (isMilitaryStage(campaign) && campaign.targetRoomName) {
        return [
            {
                type: constants.actionTypes.SCOUT_ROOM,
                data: {
                    depth: 0,
                    firstHopRoomName: null,
                    roomName: campaign.targetRoomName,
                    sourceRoomName: null,
                },
            },
        ];
    }

    if (campaign.stage !== expansion.STAGES.SCOUT) {
        return [createRetireTemplate()];
    }

    const targetRoom = expansion.pickNextScoutRoom(task);

    if (!targetRoom || !targetRoom.roomName) {
        return [];
    }

    return [
        {
            type: constants.actionTypes.SCOUT_ROOM,
            data: {
                depth: targetRoom.depth,
                firstHopRoomName: targetRoom.firstHopRoomName || null,
                roomName: targetRoom.roomName,
                sourceRoomName: targetRoom.sourceRoomName || null,
            },
        },
    ];
}

function tryDispatchClaimer(task, campaign) {
    const expansion = getExpansion();

    if (task.room !== campaign.originRoomName) {
        return [];
    }

    if (campaign.stage !== expansion.STAGES.CLAIM) {
        return [createRetireTemplate()];
    }

    return [
        {
            type: constants.actionTypes.CLAIM_CONTROLLER,
            data: {
                roomName: campaign.targetRoomName,
            },
        },
    ];
}

function tryDispatchColonizer(task, creep, campaign) {
    const expansion = getExpansion();

    if (
        task.room !== campaign.originRoomName ||
        campaign.stage !== expansion.STAGES.BOOTSTRAP_SPAWN
    ) {
        return [];
    }

    const target = expansion.getSpawnSiteObject(campaign.targetRoomName);

    if (!target) {
        return [];
    }

    const remainingAmount = target.progressTotal - target.progress;

    if (remainingAmount <= 0) {
        return [];
    }

    const currentEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

    if (currentEnergy > 0) {
        return [
            createBuildTemplate(target.id, Math.min(currentEnergy, remainingAmount)),
        ];
    }

    const assignedAmount = Math.min(
        creep.store.getCapacity(RESOURCE_ENERGY),
        remainingAmount
    );
    const energyAction = resourceManager.reserve(creep, assignedAmount);

    if (!energyAction) {
        return [];
    }

    return [
        energyAction,
        createBuildTemplate(target.id, assignedAmount),
    ];
}

function tryDispatchAttacker(task, creep, campaign) {
    if (!isAssignedToMilitaryRoom(task.room, campaign)) {
        return [];
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (!targetRoom) {
        return [createMoveTemplate(25, 25, campaign.targetRoomName)];
    }

    const target = findAttackerTarget(targetRoom, creep);

    if (target) {
        return [createAttackTemplate(target.id)];
    }

    return [createControllerHoldTemplate(targetRoom.controller, campaign.targetRoomName)];
}

function tryDispatchDismantler(task, creep, campaign) {
    if (!isAssignedToMilitaryRoom(task.room, campaign)) {
        return [];
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (!targetRoom) {
        return [createMoveTemplate(25, 25, campaign.targetRoomName)];
    }

    const target = findDismantlerTarget(targetRoom, creep);

    if (target) {
        return [createDismantleTemplate(target.id)];
    }

    return [createControllerHoldTemplate(targetRoom.controller, campaign.targetRoomName)];
}

function tryDispatchHealer(task, creep, campaign) {
    if (!isAssignedToMilitaryRoom(task.room, campaign)) {
        return [];
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (!targetRoom) {
        return [createMoveTemplate(25, 25, campaign.targetRoomName)];
    }

    const wounded = findMostWoundedSiegeCreep(campaign.campaignId, targetRoom.name);

    if (wounded) {
        return [createHealTemplate(wounded.id)];
    }

    const escort = findEscortTarget(creep, campaign.campaignId, targetRoom.name);

    if (escort) {
        return [createHealTemplate(escort.id)];
    }

    return [createControllerHoldTemplate(targetRoom.controller, campaign.targetRoomName)];
}

function tryDispatchLiberator(task, executor, campaign) {
    const expansion = getExpansion();

    if (task.room !== campaign.originRoomName) {
        return [];
    }

    const targetRoom = Game.rooms[campaign.targetRoomName];

    if (!targetRoom) {
        return [createMoveTemplate(25, 25, campaign.targetRoomName)];
    }

    if (campaign.stage === expansion.STAGES.SIEGE_CLEAR) {
        return [createControllerHoldTemplate(targetRoom.controller, campaign.targetRoomName)];
    }

    if (
        campaign.stage !== expansion.STAGES.SIEGE_CONTROLLER ||
        !targetRoom.controller
    ) {
        return [];
    }

    if (targetRoom.controller.owner || targetRoom.controller.reservation) {
        return [
            {
                type: constants.actionTypes.ATTACK_CONTROLLER,
                data: {
                    roomName: campaign.targetRoomName,
                },
            },
        ];
    }

    return [
        {
            type: constants.actionTypes.CLAIM_CONTROLLER,
            data: {
                roomName: campaign.targetRoomName,
            },
        },
    ];
}

function hasPendingPlacement(task, roomName) {
    for (const actionId of task.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.type === constants.actionTypes.PLACE_CONSTRUCTION_SITE &&
            action.status !== "done" &&
            action.data.roomName === roomName &&
            action.data.structureType === STRUCTURE_SPAWN
        ) {
            return true;
        }
    }

    return false;
}

function getOwnedSpawn(room) {
    const spawns = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_SPAWN;
    });

    return spawns[0] || null;
}

function createBuildTemplate(targetId, amount) {
    const target = Game.getObjectById(targetId);

    return {
        type: constants.actionTypes.BUILD,
        data: {
            amount: amount,
            done: 0,
            roomName: target && target.pos ? target.pos.roomName : undefined,
            targetId: targetId,
            x: target && target.pos ? target.pos.x : undefined,
            y: target && target.pos ? target.pos.y : undefined,
        },
    };
}

function createAttackTemplate(targetId) {
    return {
        type: constants.actionTypes.ATTACK_TARGET,
        data: {
            targetId: targetId,
        },
    };
}

function createHealTemplate(targetId) {
    return {
        type: constants.actionTypes.HEAL_TARGET,
        data: {
            targetId: targetId,
        },
    };
}

function createDismantleTemplate(targetId) {
    return {
        type: constants.actionTypes.DISMANTLE_TARGET,
        data: {
            targetId: targetId,
        },
    };
}

function createMoveTemplate(x, y, roomName) {
    return {
        type: constants.actionTypes.GO_TO_TARGET,
        data: {
            roomName: roomName,
            x: x,
            y: y,
        },
    };
}

function createControllerHoldTemplate(controller, fallbackRoomName) {
    return createMoveTemplate(25, 25, controller ? controller.pos.roomName : fallbackRoomName);
}

function createRetireTemplate() {
    return {
        type: constants.actionTypes.RETIRE_CREEP,
        data: {},
    };
}

function isMilitaryStage(campaign) {
    const expansion = getExpansion();

    return (
        campaign.strategy === expansion.STRATEGIES.MILITARY &&
        (
            campaign.stage === expansion.STAGES.SIEGE_CLEAR ||
            campaign.stage === expansion.STAGES.SIEGE_CONTROLLER
        )
    );
}

function isAssignedToMilitaryRoom(roomName, campaign) {
    return !!(
        roomName &&
        Array.isArray(campaign.stagingRoomNames) &&
        campaign.stagingRoomNames.includes(roomName)
    );
}

function findAttackerTarget(room, creep) {
    const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    const healerCreeps = hostileCreeps.filter(function (hostileCreep) {
        return hostileCreep.getActiveBodyparts(HEAL) > 0;
    });

    return (
        pickClosestTarget(creep, healerCreeps) ||
        pickClosestTarget(creep, hostileCreeps) ||
        pickClosestTarget(creep, findHostileStructuresByType(room, STRUCTURE_TOWER)) ||
        pickClosestTarget(creep, findHostileStructuresByType(room, STRUCTURE_SPAWN)) ||
        pickClosestTarget(creep, findOtherHostileStructures(room))
    );
}

function findDismantlerTarget(room, creep) {
    return (
        pickClosestTarget(creep, findCriticalRamparts(room)) ||
        pickClosestTarget(creep, findHostileStructuresByType(room, STRUCTURE_TOWER)) ||
        pickClosestTarget(creep, findHostileStructuresByType(room, STRUCTURE_SPAWN)) ||
        pickClosestTarget(creep, findOtherHostileStructures(room))
    );
}

function findCriticalRamparts(room) {
    const ramparts = [];

    for (const structure of room.find(FIND_HOSTILE_STRUCTURES)) {
        if (
            structure.structureType !== STRUCTURE_TOWER &&
            structure.structureType !== STRUCTURE_SPAWN
        ) {
            continue;
        }

        const structuresAtPosition = room.lookForAt(LOOK_STRUCTURES, structure.pos.x, structure.pos.y);

        for (const otherStructure of structuresAtPosition) {
            if (otherStructure.structureType === STRUCTURE_RAMPART) {
                ramparts.push(otherStructure);
            }
        }
    }

    return ramparts;
}

function findHostileStructuresByType(room, structureType) {
    return room.find(FIND_HOSTILE_STRUCTURES).filter(function (structure) {
        return structure.structureType === structureType;
    });
}

function findOtherHostileStructures(room) {
    return room.find(FIND_HOSTILE_STRUCTURES).filter(function (structure) {
        return structure.structureType !== STRUCTURE_CONTROLLER;
    });
}

function findMostWoundedSiegeCreep(campaignId, roomName) {
    const wounded = [];

    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (
            creep.memory.expansionCampaignId !== campaignId ||
            creep.pos.roomName !== roomName ||
            creep.hits >= creep.hitsMax ||
            !isSiegeRole(creep.memory.role)
        ) {
            continue;
        }

        wounded.push(creep);
    }

    wounded.sort(function (left, right) {
        const leftMissing = left.hitsMax - left.hits;
        const rightMissing = right.hitsMax - right.hits;

        if (leftMissing !== rightMissing) {
            return rightMissing - leftMissing;
        }

        return left.name.localeCompare(right.name);
    });

    return wounded[0] || null;
}

function findEscortTarget(creep, campaignId, roomName) {
    const escorts = [];

    for (const creepName in Game.creeps) {
        const otherCreep = Game.creeps[creepName];

        if (
            otherCreep.memory.expansionCampaignId !== campaignId ||
            otherCreep.pos.roomName !== roomName ||
            (
                otherCreep.memory.role !== constants.roles.ATTACKER &&
                otherCreep.memory.role !== constants.roles.DISMANTLER
            )
        ) {
            continue;
        }

        escorts.push(otherCreep);
    }

    return pickClosestTarget(creep, escorts);
}

function isSiegeRole(role) {
    return (
        role === constants.roles.ATTACKER ||
        role === constants.roles.HEALER ||
        role === constants.roles.DISMANTLER ||
        role === constants.roles.LIBERATOR
    );
}

function pickClosestTarget(creep, targets) {
    if (!targets || targets.length === 0) {
        return null;
    }

    targets.sort(function (left, right) {
        const rangeDelta = creep.pos.getRangeTo(left) - creep.pos.getRangeTo(right);

        if (rangeDelta !== 0) {
            return rangeDelta;
        }

        if (left.pos.x !== right.pos.x) {
            return left.pos.x - right.pos.x;
        }

        if (left.pos.y !== right.pos.y) {
            return left.pos.y - right.pos.y;
        }

        return String(left.id || left.name || "").localeCompare(String(right.id || right.name || ""));
    });

    return targets[0];
}

function getExpansion() {
    return require("./expansion");
}

module.exports = {
    onCompleted,
    tryDispatch,
};
