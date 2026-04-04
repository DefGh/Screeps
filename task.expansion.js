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

function createRetireTemplate() {
    return {
        type: constants.actionTypes.RETIRE_CREEP,
        data: {},
    };
}

function getExpansion() {
    return require("./expansion");
}

module.exports = {
    onCompleted,
    tryDispatch,
};
