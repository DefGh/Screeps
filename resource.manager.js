const constants = require("./constants");

const resourcePlanRoles = {
    SOURCE: "source",
    TARGET: "target",
    BOTH: "both",
};

const resourceDemandModes = {
    FINITE: "finite",
    OPEN_ENDED: "openEnded",
};

const resourceSupplyModes = {
    FINITE: "finite",
    OPEN_ENDED: "openEnded",
};

let resourcePlanCache = {
    tick: null,
    version: 0,
    plansByKey: {},
};

function buildTransferEnergyTaskData(creep) {
    if (!creep || !creep.room) {
        return null;
    }

    const request = findBestEnergyRequest(creep);

    if (!request || request.remainingAmount <= 0) {
        return null;
    }

    const currentEnergy = getUsedEnergy(creep);
    const startsWithEnergy = currentEnergy > 0;
    const transportAmount = startsWithEnergy ? currentEnergy : getFreeEnergyCapacity(creep);

    if (transportAmount <= 0) {
        return null;
    }

    let amount = Math.min(transportAmount, request.remainingAmount);

    if (amount <= 0) {
        return null;
    }

    if (startsWithEnergy) {
        return {
            resourceType: RESOURCE_ENERGY,
            sourceId: null,
            sourceType: null,
            targetId: request.object.id,
            targetType: request.type,
            amount: amount,
            remainingAmount: amount,
            collectRemainingAmount: 0,
            stage: constants.transferEnergyTaskStages.DELIVER,
        };
    }

    const source = findBestEnergySource(creep);

    if (!source || source.remainingAmount <= 0) {
        return null;
    }

    if (!isOpenEndedSourceType(source.type)) {
        amount = Math.min(amount, source.remainingAmount);
    }

    if (amount <= 0) {
        return null;
    }

    return {
        resourceType: RESOURCE_ENERGY,
        sourceId: source.object.id,
        sourceType: source.type,
        targetId: request.object.id,
        targetType: request.type,
        amount: amount,
        remainingAmount: amount,
        collectRemainingAmount: amount,
        stage: constants.transferEnergyTaskStages.COLLECT,
    };
}

function getRoomResourcePlan(room, resourceType) {
    const targetResourceType = resourceType || RESOURCE_ENERGY;

    if (!room || !room.name) {
        return [];
    }

    if (resourcePlanCache.tick !== Game.time) {
        resourcePlanCache.tick = Game.time;
        resourcePlanCache.plansByKey = {};
    }

    const cacheKey = buildRoomPlanCacheKey(room.name, targetResourceType);

    if (!resourcePlanCache.plansByKey[cacheKey]) {
        resourcePlanCache.plansByKey[cacheKey] = buildRoomResourcePlan(room, targetResourceType);
    }

    return resourcePlanCache.plansByKey[cacheKey];
}

function invalidateResourcePlanCache() {
    resourcePlanCache.version += 1;
    resourcePlanCache.tick = null;
    resourcePlanCache.plansByKey = {};
}

function getAvailableSourceEnergy(sourceType, source, currentTaskId) {
    if (!source) {
        return 0;
    }

    if (isOpenEndedSourceType(sourceType)) {
        return Infinity;
    }

    const entry = getResourcePlanEntry(source.room, RESOURCE_ENERGY, source.id);
    const baseAvailable = entry ? entry.baseAvailable : getBaseSourceEnergy(sourceType, source);
    let available = entry ? entry.effectiveAvailable : baseAvailable;

    if (currentTaskId) {
        available += getTaskOutgoingReservationForObject(source.id, currentTaskId, RESOURCE_ENERGY);
    }

    return Math.max(0, Math.min(baseAvailable, available));
}

function getRemainingTargetDemand(targetType, target, creep, currentTaskId) {
    if (!target) {
        return 0;
    }

    if (isOpenEndedTargetType(targetType)) {
        return getOpenEndedTargetDemand(targetType, target, creep);
    }

    const entry = getResourcePlanEntry(target.room, RESOURCE_ENERGY, target.id);
    const baseDemand = entry ? entry.baseDemand : getBaseTargetDemand(targetType, target, creep);
    let demand = entry ? entry.effectiveDemand : baseDemand;

    if (currentTaskId && shouldReserveIncoming(targetType)) {
        demand += getTaskIncomingReservationForObject(target.id, currentTaskId, RESOURCE_ENERGY);
    }

    return Math.max(0, Math.min(baseDemand, demand));
}

function findBestEnergyRequest(creep) {
    const room = creep.room;
    const targetTypes = constants.transferEnergyTargetTypes;
    const plan = getRoomResourcePlan(room, RESOURCE_ENERGY);

    const spawnOrExtension = chooseClosestPlanEntry(creep, plan, [
        targetTypes.SPAWN,
        targetTypes.EXTENSION,
    ], function (entry) {
        return getPlanEntryDemand(entry, creep, null) > 0;
    });

    if (spawnOrExtension) {
        return {
            type: spawnOrExtension.objectType,
            object: spawnOrExtension.object,
            remainingAmount: getPlanEntryDemand(spawnOrExtension, creep, null),
        };
    }

    if (getActiveWorkParts(creep) > 0) {
        const constructionSite = chooseClosestPlanEntry(
            creep,
            plan,
            [targetTypes.CONSTRUCTION_SITE],
            function (entry) {
                return getPlanEntryDemand(entry, creep, null) > 0;
            }
        );

        if (constructionSite) {
            return {
                type: constructionSite.objectType,
                object: constructionSite.object,
                remainingAmount: getPlanEntryDemand(constructionSite, creep, null),
            };
        }
    }

    if (room.controller && room.controller.my && getActiveWorkParts(creep) > 0) {
        const controller = chooseClosestPlanEntry(creep, plan, [targetTypes.CONTROLLER], function (entry) {
            return getPlanEntryDemand(entry, creep, null) > 0;
        });

        if (controller) {
            return {
                type: controller.objectType,
                object: controller.object,
                remainingAmount: getPlanEntryDemand(controller, creep, null),
            };
        }
    }

    const container = chooseClosestPlanEntry(creep, plan, [targetTypes.CONTAINER], function (entry) {
        return getPlanEntryDemand(entry, creep, null) > 0;
    });

    if (container) {
        return {
            type: container.objectType,
            object: container.object,
            remainingAmount: getPlanEntryDemand(container, creep, null),
        };
    }

    return null;
}

function findBestEnergySource(creep) {
    const room = creep.room;
    const sourceTypes = constants.transferEnergySourceTypes;
    const plan = getRoomResourcePlan(room, RESOURCE_ENERGY);

    const nearbyStoredEnergy = chooseClosestPlanEntry(creep, plan, [sourceTypes.PILE, sourceTypes.CONTAINER], function (entry) {
        return getPlanEntryAvailable(entry, null) > 0;
    });

    if (nearbyStoredEnergy) {
        return {
            type: nearbyStoredEnergy.objectType,
            object: nearbyStoredEnergy.object,
            remainingAmount: getPlanEntryAvailable(nearbyStoredEnergy, null),
        };
    }

    const source = chooseClosestPlanEntry(creep, plan, [sourceTypes.SOURCE], function (entry) {
        return getPlanEntryAvailable(entry, null) > 0;
    });

    if (source) {
        return {
            type: source.objectType,
            object: source.object,
            remainingAmount: getPlanEntryAvailable(source, null),
        };
    }

    return null;
}

function buildRoomResourcePlan(room, resourceType) {
    const entriesById = {};

    collectEnergySupplies(room, resourceType, entriesById);
    collectEnergyDemands(room, resourceType, entriesById);
    applyTaskReservations(entriesById, resourceType);

    const plan = [];

    for (const objectId in entriesById) {
        const entry = entriesById[objectId];
        entry.effectiveAvailable = Math.max(0, entry.baseAvailable - entry.reservedOutgoing);
        entry.effectiveDemand = entry.demandMode === resourceDemandModes.FINITE
            ? Math.max(0, entry.baseDemand - entry.reservedIncoming)
            : entry.baseDemand;
        entry.role = getPlanEntryRole(entry);
        delete entry.hasSupply;
        delete entry.hasDemand;
        plan.push(entry);
    }

    return plan;
}

function collectEnergySupplies(room, resourceType, entriesById) {
    for (const source of room.find(FIND_SOURCES)) {
        const entry = ensurePlanEntry(
            entriesById,
            source.id,
            source,
            constants.transferEnergySourceTypes.SOURCE,
            resourceType
        );
        entry.baseAvailable = 0;
        entry.supplyMode = resourceSupplyModes.OPEN_ENDED;
        entry.hasSupply = true;
    }

    for (const pile of room.find(FIND_DROPPED_RESOURCES, {
        filter: function (resource) {
            return resource.resourceType === resourceType;
        },
    })) {
        const entry = ensurePlanEntry(
            entriesById,
            pile.id,
            pile,
            constants.transferEnergySourceTypes.PILE,
            resourceType
        );
        entry.baseAvailable = getBaseSourceEnergy(constants.transferEnergySourceTypes.PILE, pile);
        entry.hasSupply = true;
    }

    for (const container of room.find(FIND_STRUCTURES, {
        filter: function (structure) {
            return structure.structureType === STRUCTURE_CONTAINER;
        },
    })) {
        const entry = ensurePlanEntry(
            entriesById,
            container.id,
            container,
            constants.transferEnergyTargetTypes.CONTAINER,
            resourceType
        );
        entry.baseAvailable = getBaseSourceEnergy(constants.transferEnergySourceTypes.CONTAINER, container);
        entry.hasSupply = true;
    }
}

function collectEnergyDemands(room, resourceType, entriesById) {
    for (const structure of room.find(FIND_MY_STRUCTURES, {
        filter: function (candidate) {
            return (
                candidate.structureType === STRUCTURE_SPAWN ||
                candidate.structureType === STRUCTURE_EXTENSION
            );
        },
    })) {
        const targetType = getTargetTypeFromStructure(structure);
        const entry = ensurePlanEntry(entriesById, structure.id, structure, targetType, resourceType);
        entry.baseDemand = getBaseTargetDemand(targetType, structure, null);
        entry.hasDemand = true;
    }

    for (const container of room.find(FIND_STRUCTURES, {
        filter: function (structure) {
            return structure.structureType === STRUCTURE_CONTAINER;
        },
    })) {
        const entry = ensurePlanEntry(
            entriesById,
            container.id,
            container,
            constants.transferEnergyTargetTypes.CONTAINER,
            resourceType
        );
        entry.baseDemand = getBaseTargetDemand(constants.transferEnergyTargetTypes.CONTAINER, container, null);
        entry.hasDemand = true;
    }

    if (room.controller && room.controller.my) {
        const controller = room.controller;
        const entry = ensurePlanEntry(
            entriesById,
            controller.id,
            controller,
            constants.transferEnergyTargetTypes.CONTROLLER,
            resourceType
        );
        entry.baseDemand = 0;
        entry.demandMode = resourceDemandModes.OPEN_ENDED;
        entry.hasDemand = true;
    }

    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        const entry = ensurePlanEntry(
            entriesById,
            site.id,
            site,
            constants.transferEnergyTargetTypes.CONSTRUCTION_SITE,
            resourceType
        );
        entry.baseDemand = getBaseTargetDemand(constants.transferEnergyTargetTypes.CONSTRUCTION_SITE, site, null);
        entry.hasDemand = true;
    }
}

function ensurePlanEntry(entriesById, objectId, object, objectType, resourceType) {
    if (!entriesById[objectId]) {
        entriesById[objectId] = {
            objectId: objectId,
            object: object,
            objectType: objectType,
            resourceType: resourceType,
            role: resourcePlanRoles.TARGET,
            baseAvailable: 0,
            reservedOutgoing: 0,
            effectiveAvailable: 0,
            baseDemand: 0,
            reservedIncoming: 0,
            effectiveDemand: 0,
            demandMode: resourceDemandModes.FINITE,
            supplyMode: resourceSupplyModes.FINITE,
            hasSupply: false,
            hasDemand: false,
        };
    }

    const entry = entriesById[objectId];
    entry.object = object;
    entry.objectType = objectType;
    entry.resourceType = resourceType;

    return entry;
}

function applyTaskReservations(entriesById, resourceType) {
    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!isTransferEnergyTask(task) || getTransferTaskResourceType(task) !== resourceType) {
            continue;
        }

        if (task.data.sourceId && entriesById[task.data.sourceId]) {
            entriesById[task.data.sourceId].reservedOutgoing += getOutgoingReservationAmount(task);
        }

        if (task.data.targetId && entriesById[task.data.targetId]) {
            entriesById[task.data.targetId].reservedIncoming += getIncomingReservationAmount(task);
        }
    }
}

function getPlanEntryRole(entry) {
    if (entry.hasSupply && entry.hasDemand) {
        return resourcePlanRoles.BOTH;
    }

    if (entry.hasSupply) {
        return resourcePlanRoles.SOURCE;
    }

    return resourcePlanRoles.TARGET;
}

function getResourcePlanEntry(room, resourceType, objectId) {
    if (!room || !objectId) {
        return null;
    }

    const plan = getRoomResourcePlan(room, resourceType);

    for (const entry of plan) {
        if (entry.objectId === objectId) {
            return entry;
        }
    }

    return null;
}

function chooseClosestPlanEntry(executor, plan, objectTypes, predicate) {
    const matchingObjects = [];
    const matchingEntriesById = {};

    for (const entry of plan) {
        if (!entry || !entry.object || !objectTypes.includes(entry.objectType)) {
            continue;
        }

        if (predicate && !predicate(entry)) {
            continue;
        }

        matchingObjects.push(entry.object);
        matchingEntriesById[entry.objectId] = entry;
    }

    const closestObject = chooseClosest(executor, matchingObjects);

    if (!closestObject) {
        return null;
    }

    return matchingEntriesById[closestObject.id] || null;
}

function getPlanEntryAvailable(entry, currentTaskId) {
    if (!entry) {
        return 0;
    }

    if (entry.supplyMode === resourceSupplyModes.OPEN_ENDED) {
        return Infinity;
    }

    let available = entry.effectiveAvailable;

    if (currentTaskId) {
        available += getTaskOutgoingReservationForObject(entry.objectId, currentTaskId, entry.resourceType);
    }

    return Math.max(0, Math.min(entry.baseAvailable, available));
}

function getPlanEntryDemand(entry, creep, currentTaskId) {
    if (!entry) {
        return 0;
    }

    if (entry.demandMode === resourceDemandModes.OPEN_ENDED) {
        return getOpenEndedTargetDemand(entry.objectType, entry.object, creep);
    }

    let demand = entry.effectiveDemand;

    if (currentTaskId && shouldReserveIncoming(entry.objectType)) {
        demand += getTaskIncomingReservationForObject(entry.objectId, currentTaskId, entry.resourceType);
    }

    return Math.max(0, Math.min(entry.baseDemand, demand));
}

function getOpenEndedTargetDemand(targetType, target, creep) {
    if (targetType === constants.transferEnergyTargetTypes.CONTROLLER) {
        return Math.max(getEnergyCapacity(creep), getActiveWorkParts(creep));
    }

    return getBaseTargetDemand(targetType, target, creep);
}

function getTaskIncomingReservationForObject(targetId, currentTaskId, resourceType) {
    const task = Memory.tasks[currentTaskId];

    if (
        !isTransferEnergyTask(task) ||
        task.data.targetId !== targetId ||
        getTransferTaskResourceType(task) !== resourceType
    ) {
        return 0;
    }

    return getIncomingReservationAmount(task);
}

function getTaskOutgoingReservationForObject(sourceId, currentTaskId, resourceType) {
    const task = Memory.tasks[currentTaskId];

    if (
        !isTransferEnergyTask(task) ||
        task.data.sourceId !== sourceId ||
        getTransferTaskResourceType(task) !== resourceType
    ) {
        return 0;
    }

    return getOutgoingReservationAmount(task);
}

function getIncomingReservationAmount(task) {
    return typeof task.data.remainingAmount === "number" ? task.data.remainingAmount : 0;
}

function getOutgoingReservationAmount(task) {
    if (typeof task.data.collectRemainingAmount === "number") {
        return task.data.collectRemainingAmount;
    }

    return typeof task.data.remainingAmount === "number" ? task.data.remainingAmount : 0;
}

function shouldReserveIncoming(targetType) {
    return targetType !== constants.transferEnergyTargetTypes.CONTROLLER;
}

function getTransferTaskResourceType(task) {
    if (task && task.data && typeof task.data.resourceType === "string") {
        return task.data.resourceType;
    }

    return RESOURCE_ENERGY;
}

function getBaseSourceEnergy(sourceType, source) {
    if (!source) {
        return 0;
    }

    if (sourceType === constants.transferEnergySourceTypes.SOURCE) {
        return typeof source.energy === "number" ? source.energy : 0;
    }

    if (sourceType === constants.transferEnergySourceTypes.PILE) {
        return source.resourceType === RESOURCE_ENERGY ? source.amount : 0;
    }

    if (sourceType === constants.transferEnergySourceTypes.CONTAINER) {
        return getUsedEnergy(source);
    }

    return 0;
}

function isOpenEndedSourceType(sourceType) {
    return sourceType === constants.transferEnergySourceTypes.SOURCE;
}

function getBaseTargetDemand(targetType, target, creep) {
    if (!target) {
        return 0;
    }

    if (
        targetType === constants.transferEnergyTargetTypes.SPAWN ||
        targetType === constants.transferEnergyTargetTypes.EXTENSION ||
        targetType === constants.transferEnergyTargetTypes.CONTAINER
    ) {
        return getFreeEnergyOfTarget(target);
    }

    if (targetType === constants.transferEnergyTargetTypes.CONTROLLER) {
        return Math.max(getEnergyCapacity(creep), getActiveWorkParts(creep));
    }

    if (targetType === constants.transferEnergyTargetTypes.CONSTRUCTION_SITE) {
        return Math.ceil((target.progressTotal - target.progress) / getBuildPower());
    }

    return 0;
}

function isOpenEndedTargetType(targetType) {
    return targetType === constants.transferEnergyTargetTypes.CONTROLLER;
}

function getTargetTypeFromStructure(structure) {
    if (structure.structureType === STRUCTURE_SPAWN) {
        return constants.transferEnergyTargetTypes.SPAWN;
    }

    if (structure.structureType === STRUCTURE_EXTENSION) {
        return constants.transferEnergyTargetTypes.EXTENSION;
    }

    if (structure.structureType === STRUCTURE_CONTAINER) {
        return constants.transferEnergyTargetTypes.CONTAINER;
    }

    return null;
}

function chooseClosest(executor, objects) {
    if (!objects || objects.length === 0) {
        return null;
    }

    if (executor.pos && typeof executor.pos.findClosestByRange === "function") {
        return executor.pos.findClosestByRange(objects);
    }

    return objects[0];
}

function getActiveWorkParts(creep) {
    if (creep && typeof creep.getActiveBodyparts === "function") {
        return creep.getActiveBodyparts(WORK);
    }

    return 0;
}

function getBuildPower() {
    return 1; //typeof BUILD_POWER === "number" ? BUILD_POWER : 1; 
}

function getUsedEnergy(object) {
    if (!object) {
        return 0;
    }

    if (object.store && typeof object.store.getUsedCapacity === "function") {
        return object.store.getUsedCapacity(RESOURCE_ENERGY);
    }

    if (object.store && typeof object.store[RESOURCE_ENERGY] === "number") {
        return object.store[RESOURCE_ENERGY];
    }

    if (object.carry && typeof object.carry[RESOURCE_ENERGY] === "number") {
        return object.carry[RESOURCE_ENERGY];
    }

    return 0;
}

function getFreeEnergyCapacity(object) {
    if (!object) {
        return 0;
    }

    if (object.store && typeof object.store.getFreeCapacity === "function") {
        return object.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    if (typeof object.carryCapacity === "number") {
        return object.carryCapacity - getUsedEnergy(object);
    }

    return 0;
}

function getEnergyCapacity(object) {
    if (!object) {
        return 0;
    }

    if (object.store && typeof object.store.getCapacity === "function") {
        return object.store.getCapacity(RESOURCE_ENERGY);
    }

    if (typeof object.carryCapacity === "number") {
        return object.carryCapacity;
    }

    return 0;
}

function getFreeEnergyOfTarget(target) {
    if (!target) {
        return 0;
    }

    if (target.store && typeof target.store.getFreeCapacity === "function") {
        return target.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    if (
        typeof target.energy === "number" &&
        typeof target.energyCapacity === "number"
    ) {
        return target.energyCapacity - target.energy;
    }

    return 0;
}

function isTransferEnergyTask(task) {
    return Boolean(task && task.type === constants.taskTypes.TRANSFER_ENERGY && task.data);
}

function buildRoomPlanCacheKey(roomName, resourceType) {
    return `${Game.time}:${resourcePlanCache.version}:${roomName}:${resourceType}`;
}

module.exports = {
    buildTransferEnergyTaskData,
    getActiveWorkParts,
    getAvailableSourceEnergy,
    getEnergyCapacity,
    getFreeEnergyCapacity,
    getRemainingTargetDemand,
    getRoomResourcePlan,
    getUsedEnergy,
    invalidateResourcePlanCache,
};
