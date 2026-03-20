const constants = require("./constants");

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

    amount = Math.min(amount, source.remainingAmount);

    if (amount <= 0) {
        return null;
    }

    return {
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

function getAvailableSourceEnergy(sourceType, source, currentTaskId) {
    const available = getBaseSourceEnergy(sourceType, source) - getReservedOutgoing(source.id, currentTaskId);
    return Math.max(0, available);
}

function getRemainingTargetDemand(targetType, target, creep, currentTaskId) {
    const demand = getBaseTargetDemand(targetType, target, creep);

    if (!shouldReserveIncoming(targetType)) {
        return demand;
    }

    return Math.max(0, demand - getReservedIncoming(target.id, currentTaskId));
}

function findBestEnergyRequest(creep) {
    const room = creep.room;
    const targetTypes = constants.transferEnergyTargetTypes;

    const spawnOrExtension = chooseClosest(creep, room.find(FIND_MY_STRUCTURES, {
        filter: function (structure) {
            if (
                structure.structureType !== STRUCTURE_SPAWN &&
                structure.structureType !== STRUCTURE_EXTENSION
            ) {
                return false;
            }

            const type = getTargetTypeFromStructure(structure);
            return getRemainingTargetDemand(type, structure, creep, null) > 0;
        },
    }));

    if (spawnOrExtension) {
        return {
            type: getTargetTypeFromStructure(spawnOrExtension),
            object: spawnOrExtension,
            remainingAmount: getRemainingTargetDemand(
                getTargetTypeFromStructure(spawnOrExtension),
                spawnOrExtension,
                creep,
                null
            ),
        };
    }

    if (getActiveWorkParts(creep) > 0) {
        const constructionSite = chooseClosest(creep, room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: function (site) {
                return getRemainingTargetDemand(targetTypes.CONSTRUCTION_SITE, site, creep, null) > 0;
            },
        }));

        if (constructionSite) {
            return {
                type: targetTypes.CONSTRUCTION_SITE,
                object: constructionSite,
                remainingAmount: getRemainingTargetDemand(
                    targetTypes.CONSTRUCTION_SITE,
                    constructionSite,
                    creep,
                    null
                ),
            };
        }
    }

    if (room.controller && room.controller.my && getActiveWorkParts(creep) > 0) {
        return {
            type: targetTypes.CONTROLLER,
            object: room.controller,
            remainingAmount: getRemainingTargetDemand(targetTypes.CONTROLLER, room.controller, creep, null),
        };
    }

    const container = chooseClosest(creep, room.find(FIND_STRUCTURES, {
        filter: function (structure) {
            return (
                structure.structureType === STRUCTURE_CONTAINER &&
                getRemainingTargetDemand(targetTypes.CONTAINER, structure, creep, null) > 0
            );
        },
    }));

    if (container) {
        return {
            type: targetTypes.CONTAINER,
            object: container,
            remainingAmount: getRemainingTargetDemand(targetTypes.CONTAINER, container, creep, null),
        };
    }

    return null;
}

function findBestEnergySource(creep) {
    const room = creep.room;
    const sourceTypes = constants.transferEnergySourceTypes;

    const pile = chooseClosest(creep, room.find(FIND_DROPPED_RESOURCES, {
        filter: function (resource) {
            return (
                resource.resourceType === RESOURCE_ENERGY &&
                getAvailableSourceEnergy(sourceTypes.PILE, resource, null) > 0
            );
        },
    }));

    if (pile) {
        return {
            type: sourceTypes.PILE,
            object: pile,
            remainingAmount: getAvailableSourceEnergy(sourceTypes.PILE, pile, null),
        };
    }

    const container = chooseClosest(creep, room.find(FIND_STRUCTURES, {
        filter: function (structure) {
            return (
                structure.structureType === STRUCTURE_CONTAINER &&
                getAvailableSourceEnergy(sourceTypes.CONTAINER, structure, null) > 0
            );
        },
    }));

    if (container) {
        return {
            type: sourceTypes.CONTAINER,
            object: container,
            remainingAmount: getAvailableSourceEnergy(sourceTypes.CONTAINER, container, null),
        };
    }

    const source = chooseClosest(creep, room.find(FIND_SOURCES_ACTIVE, {
        filter: function (node) {
            return getAvailableSourceEnergy(sourceTypes.SOURCE, node, null) > 0;
        },
    }));

    if (source) {
        return {
            type: sourceTypes.SOURCE,
            object: source,
            remainingAmount: getAvailableSourceEnergy(sourceTypes.SOURCE, source, null),
        };
    }

    return null;
}

function getReservedIncoming(targetId, currentTaskId) {
    let reserved = 0;

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!isTransferEnergyTask(task)) {
            continue;
        }

        if (currentTaskId && task.id === currentTaskId) {
            continue;
        }

        if (task.data.targetId !== targetId) {
            continue;
        }

        reserved += getIncomingReservationAmount(task);
    }

    return reserved;
}

function getReservedOutgoing(sourceId, currentTaskId) {
    let reserved = 0;

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (!isTransferEnergyTask(task)) {
            continue;
        }

        if (currentTaskId && task.id === currentTaskId) {
            continue;
        }

        if (task.data.sourceId !== sourceId) {
            continue;
        }

        reserved += getOutgoingReservationAmount(task);
    }

    return reserved;
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
    if (typeof creep.getActiveBodyparts === "function") {
        return creep.getActiveBodyparts(WORK);
    }

    return 0;
}

function getBuildPower() {
    return typeof BUILD_POWER === "number" ? BUILD_POWER : 5;
}

function getUsedEnergy(object) {
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
    if (object.store && typeof object.store.getFreeCapacity === "function") {
        return object.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    if (typeof object.carryCapacity === "number") {
        return object.carryCapacity - getUsedEnergy(object);
    }

    return 0;
}

function getEnergyCapacity(object) {
    if (object.store && typeof object.store.getCapacity === "function") {
        return object.store.getCapacity(RESOURCE_ENERGY);
    }

    if (typeof object.carryCapacity === "number") {
        return object.carryCapacity;
    }

    return 0;
}

function getFreeEnergyOfTarget(target) {
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

module.exports = {
    buildTransferEnergyTaskData,
    getActiveWorkParts,
    getAvailableSourceEnergy,
    getEnergyCapacity,
    getFreeEnergyCapacity,
    getRemainingTargetDemand,
    getUsedEnergy,
};
