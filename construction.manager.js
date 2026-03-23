const constants = require("./constants");
const resourceManager = require("./resource.manager");
const sourceManager = require("./source.manager");

const EXTENSION_SEARCH_RANGE = 8;
const EXTENSION_MIN_COORD = 2;
const EXTENSION_MAX_COORD = 47;
const ROAD_HEAT_WINDOW = 300;
const ROAD_MIN_VISITS = 10;
const REPAIR_MAX_ROOM_TASKS = constants.repairs.MAX_ROOM_TASKS;
const REPAIR_REFRESH_INTERVAL = constants.repairs.REFRESH_INTERVAL;
const REPAIR_STRUCTURE_THRESHOLD = constants.repairs.STRUCTURE_THRESHOLD;
const REPAIR_WALL_HITS_CAP = constants.repairs.WALL_HITS_CAP;
const DEFENSE_BORDER_OFFSET = getNormalizedDefenseBorderOffset();
const DEFENSE_SIDES = [
    {
        name: "top",
        start: 0,
        end: 49,
        getBorderPosition: function (coordinate, roomName) {
            return { roomName: roomName, x: coordinate, y: 0 };
        },
    },
    {
        name: "bottom",
        start: 0,
        end: 49,
        getBorderPosition: function (coordinate, roomName) {
            return { roomName: roomName, x: coordinate, y: 49 };
        },
    },
    {
        name: "left",
        start: 1,
        end: 48,
        getBorderPosition: function (coordinate, roomName) {
            return { roomName: roomName, x: 0, y: coordinate };
        },
    },
    {
        name: "right",
        start: 1,
        end: 48,
        getBorderPosition: function (coordinate, roomName) {
            return { roomName: roomName, x: 49, y: coordinate };
        },
    },
];

function refreshManagedConstruction() {
    for (const roomName of getManagedRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room || !room.controller || !room.controller.my) {
            continue;
        }

        refreshRoomConstruction(room);
        refreshRoomRepairs(room);
    }
}

function refreshRoomConstruction(room) {
    if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
        return;
    }
    if (ensureExtensionSite(room)) {
        return;
    }
    
    if (ensureSourceContainerSite(room)) {
        return;
    }
    
    if (ensureRoadSite(room)) {
        return;
    }
    
    if (ensureDefenseSite(room)) {
        return;
    }
}

function refreshRoomRepairs(room) {
    const roomMemory = getConstructionRoomMemory(room.name);

    if (!shouldRefreshRoomRepairs(roomMemory)) {
        return;
    }

    let didMutate = normalizeRoomRepairTasks(room);
    const currentTasks = getRoomRepairTasks(room.name);
    const assignedTargetIds = {};

    for (const task of currentTasks) {
        assignedTargetIds[task.data.targetId] = true;
    }

    const candidates = getSortedRepairCandidates(room);

    for (const candidate of candidates) {
        if (currentTasks.length >= REPAIR_MAX_ROOM_TASKS) {
            break;
        }

        if (assignedTargetIds[candidate.target.id]) {
            continue;
        }

        const task = addRepairTask(room, candidate.target, candidate.repairGoal);
        currentTasks.push(task);
        assignedTargetIds[candidate.target.id] = true;
        didMutate = true;
    }

    roomMemory.lastRepairRefreshTick = Game.time;

    if (didMutate) {
        resourceManager.invalidateResourcePlanCache();
    }
}

function normalizeRoomRepairTasks(room) {
    const roomTasks = getRoomRepairTasks(room.name);

    if (roomTasks.length === 0) {
        return false;
    }

    const anchor = getRepairAnchor(room);
    const taskEntries = [];
    const removedTaskIds = {};
    let didMutate = false;

    for (const task of roomTasks) {
        const target = Game.getObjectById(task.data.targetId);

        if (isStaleRepairTask(task, target)) {
            removedTaskIds[task.id] = true;
            continue;
        }

        const repairGoal = getRepairGoalForStructure(target);

        if (typeof repairGoal !== "number" || repairGoal <= 0) {
            removedTaskIds[task.id] = true;
            continue;
        }

        if (task.data.repairGoal !== repairGoal || task.data.targetStructureType !== target.structureType) {
            task.data.repairGoal = repairGoal;
            task.data.targetStructureType = target.structureType;
            didMutate = true;
        }

        taskEntries.push({
            task: task,
            target: target,
            repairGoal: repairGoal,
        });
    }

    taskEntries.sort(function (left, right) {
        return compareExistingRepairTasks(left, right, anchor);
    });

    const keptTargetIds = {};

    for (let index = 0; index < taskEntries.length; index += 1) {
        const entry = taskEntries[index];

        if (
            index >= REPAIR_MAX_ROOM_TASKS ||
            keptTargetIds[entry.task.data.targetId]
        ) {
            removedTaskIds[entry.task.id] = true;
            continue;
        }

        keptTargetIds[entry.task.data.targetId] = true;
    }

    for (const taskId in removedTaskIds) {
        delete Memory.tasks[taskId];
        didMutate = true;
    }

    return didMutate;
}

function getRoomRepairTasks(roomName) {
    const tasks = [];

    for (const taskId in Memory.tasks) {
        const task = Memory.tasks[taskId];

        if (
            task &&
            task.type === constants.taskTypes.REPAIR &&
            task.data &&
            task.data.roomName === roomName
        ) {
            tasks.push(task);
        }
    }

    return tasks;
}

function getSortedRepairCandidates(room) {
    const anchor = getRepairAnchor(room);
    const candidates = [];

    for (const structure of room.find(FIND_STRUCTURES)) {
        if (!isEligibleRepairStructure(structure)) {
            continue;
        }

        candidates.push({
            target: structure,
            repairGoal: getRepairGoalForStructure(structure),
        });
    }

    candidates.sort(function (left, right) {
        return compareRepairCandidates(left, right, anchor);
    });

    return candidates;
}

function addRepairTask(room, target, repairGoal) {
    const taskId = nextTaskId(constants.taskTypes.REPAIR);

    Memory.tasks[taskId] = {
        id: taskId,
        type: constants.taskTypes.REPAIR,
        status: constants.taskStatuses.PENDING,
        canExecute: [constants.roles.UNIVERSAL],
        data: {
            roomName: room.name,
            targetId: target.id,
            targetStructureType: target.structureType,
            repairGoal: repairGoal,
            resourceType: RESOURCE_ENERGY,
            sourceId: null,
            sourceType: null,
            amount: 0,
            remainingAmount: 0,
            collectRemainingAmount: 0,
            stage: constants.repairTaskStages.PLAN,
        },
    };

    return Memory.tasks[taskId];
}

function shouldRefreshRoomRepairs(roomMemory) {
    if (!roomMemory || typeof roomMemory.lastRepairRefreshTick !== "number") {
        return true;
    }

    return Game.time - roomMemory.lastRepairRefreshTick >= REPAIR_REFRESH_INTERVAL;
}

function getConstructionRoomMemory(roomName) {
    if (!Memory.construction || typeof Memory.construction !== "object") {
        Memory.construction = {};
    }

    if (!Memory.construction.rooms || typeof Memory.construction.rooms !== "object") {
        Memory.construction.rooms = {};
    }

    if (!Memory.construction.rooms[roomName] || typeof Memory.construction.rooms[roomName] !== "object") {
        Memory.construction.rooms[roomName] = {};
    }

    return Memory.construction.rooms[roomName];
}

function isEligibleRepairStructure(structure) {
    if (
        !structure ||
        typeof structure.hits !== "number" ||
        typeof structure.hitsMax !== "number" ||
        structure.hitsMax <= 0 ||
        isHostileOwnedStructure(structure)
    ) {
        return false;
    }

    const repairGoal = getRepairGoalForStructure(structure);

    if (repairGoal <= 0 || structure.hits >= repairGoal) {
        return false;
    }

    if (isWallLikeStructure(structure.structureType)) {
        return true;
    }

    return structure.hits < repairGoal * REPAIR_STRUCTURE_THRESHOLD;
}

function isStaleRepairTask(task, target) {
    if (!task || !task.data || !target) {
        return true;
    }

    if (target.structureType !== task.data.targetStructureType) {
        return true;
    }

    if (isHostileOwnedStructure(target)) {
        return true;
    }

    const repairGoal = getRepairGoalForStructure(target);

    if (repairGoal <= 0) {
        return true;
    }

    return typeof target.hits !== "number" || target.hits >= repairGoal;
}

function getRepairGoalForStructure(structure) {
    if (
        !structure ||
        typeof structure.hits !== "number" ||
        typeof structure.hitsMax !== "number"
    ) {
        return 0;
    }

    if (isWallLikeStructure(structure.structureType)) {
        return REPAIR_WALL_HITS_CAP;
    }

    return structure.hitsMax;
}

function isWallLikeStructure(structureType) {
    return structureType === STRUCTURE_WALL || structureType === STRUCTURE_RAMPART;
}

function isHostileOwnedStructure(structure) {
    return Boolean(structure && structure.owner && !structure.my);
}

function compareExistingRepairTasks(left, right, anchor) {
    const statusOrder = getRepairStatusPriority(left.task.status) - getRepairStatusPriority(right.task.status);

    if (statusOrder !== 0) {
        return statusOrder;
    }

    const candidateOrder = compareRepairCandidates(left, right, anchor);

    if (candidateOrder !== 0) {
        return candidateOrder;
    }

    return getTaskSequence(left.task.id) - getTaskSequence(right.task.id);
}

function compareRepairCandidates(left, right, anchor) {
    const typeOrder = getRepairBucketPriority(left.target.structureType) - getRepairBucketPriority(right.target.structureType);

    if (typeOrder !== 0) {
        return typeOrder;
    }

    const damageOrder = getRepairDamageRatio(left.target, left.repairGoal) - getRepairDamageRatio(right.target, right.repairGoal);

    if (damageOrder !== 0) {
        return damageOrder;
    }

    const distanceOrder = getAnchorRange(anchor, left.target.pos) - getAnchorRange(anchor, right.target.pos);

    if (distanceOrder !== 0) {
        return distanceOrder;
    }

    return left.target.id.localeCompare(right.target.id);
}

function getRepairBucketPriority(structureType) {
    if (structureType === STRUCTURE_RAMPART) {
        return 0;
    }

    if (structureType === STRUCTURE_WALL) {
        return 1;
    }

    return 2;
}

function getRepairDamageRatio(target, repairGoal) {
    if (
        !target ||
        typeof target.hits !== "number" ||
        typeof repairGoal !== "number" ||
        repairGoal <= 0
    ) {
        return Infinity;
    }

    return target.hits / repairGoal;
}

function getRepairIntegrityRatio(target, repairGoal) {
    return Math.max(0, Math.min(1, getRepairDamageRatio(target, repairGoal)));
}

function getRepairStatusPriority(status) {
    return status === constants.taskStatuses.IN_PROGRESS ? 0 : 1;
}

function getTaskSequence(taskId) {
    if (typeof taskId !== "string") {
        return Infinity;
    }

    const parsed = Number(taskId.split(":").pop());

    return Number.isFinite(parsed) ? parsed : Infinity;
}

function getRepairAnchor(room) {
    const spawns = room.find(FIND_MY_SPAWNS);

    if (spawns.length === 0) {
        return null;
    }

    return spawns[0];
}

function getAnchorRange(anchor, position) {
    if (!anchor || !anchor.pos || !position) {
        return Infinity;
    }

    if (typeof anchor.pos.getRangeTo === "function") {
        return anchor.pos.getRangeTo(position);
    }

    return Math.max(Math.abs(anchor.pos.x - position.x), Math.abs(anchor.pos.y - position.y));
}

function nextTaskId(type) {
    Memory.taskSequence += 1;
    return type + ":" + Memory.taskSequence;
}

function ensureSourceContainerSite(room) {
    const minerSources = sourceManager.getMinerSourcesForRoom(room.name);

    for (const sourceData of minerSources) {
        if (!sourceData || !sourceData.minerPos) {
            continue;
        }

        if (hasStructureOrSiteAt(room, sourceData.minerPos, STRUCTURE_CONTAINER)) {
            continue;
        }

        if (!canPlaceContainerAt(room, sourceData.minerPos)) {
            continue;
        }

        const result = room.createConstructionSite(
            sourceData.minerPos.x,
            sourceData.minerPos.y,
            STRUCTURE_CONTAINER
        );

        if (result === OK) {
            console.log(
                `construction planned ${STRUCTURE_CONTAINER} at ` +
                `${room.name} (${sourceData.minerPos.x},${sourceData.minerPos.y})`
            );
            return true;
        }
    }

    return false;
}

function ensureExtensionSite(room) {
    const extensionLimit = getStructureLimit(STRUCTURE_EXTENSION, room.controller.level);

    if (extensionLimit <= 0) {
        return false;
    }

    const currentExtensionCount = countRoomStructuresAndSites(room, STRUCTURE_EXTENSION);

    if (currentExtensionCount >= extensionLimit) {
        return false;
    }

    const anchor = chooseExtensionAnchor(room);

    if (!anchor) {
        return false;
    }

    const reservedPositions = getReservedPositions(room);

    for (const position of getExtensionCandidatePositions(anchor.pos)) {
        if (!canPlaceExtensionAt(room, position, reservedPositions)) {
            continue;
        }

        const result = room.createConstructionSite(position.x, position.y, STRUCTURE_EXTENSION);

        if (result === OK) {
            console.log(
                `construction planned ${STRUCTURE_EXTENSION} at ` +
                `${room.name} (${position.x},${position.y})`
            );
            return true;
        }
    }

    return false;
}

function ensureRoadSite(room) {
    pruneRoadHeat(room.name);

    const anchor = chooseExtensionAnchor(room);
    const candidates = getRoadCandidates(room, anchor);
    const reservedDefensePositions = getDefenseReservedPositions(room);

    for (const candidate of candidates) {
        if (candidate.count < ROAD_MIN_VISITS) {
            break;
        }

        if (reservedDefensePositions[buildPositionKey(candidate.position)]) {
            continue;
        }

        if (!canPlaceRoadAt(room, candidate.position)) {
            continue;
        }

        const result = room.createConstructionSite(candidate.position.x, candidate.position.y, STRUCTURE_ROAD);

        if (result === OK) {
            console.log(
                `construction planned ${STRUCTURE_ROAD} at ` +
                `${room.name} (${candidate.position.x},${candidate.position.y})`
            );
            return true;
        }
    }

    return false;
}

function hasStartedDefensePerimeter(room) {
    for (const structure of room.find(FIND_STRUCTURES)) {
        if (
            (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) &&
            (!structure.owner || structure.my)
        ) {
            return true;
        }
    }

    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType === STRUCTURE_WALL || site.structureType === STRUCTURE_RAMPART) {
            return true;
        }
    }

    return false;
}

function shouldSeedDefensePerimeter(room) {
    return !hasStartedDefensePerimeter(room) && getDefenseCandidates(room).length > 0;
}

function ensureDefenseSite(room) {
    const wallLimit = getStructureLimit(STRUCTURE_WALL, room.controller.level);
    const rampartLimit = getStructureLimit(STRUCTURE_RAMPART, room.controller.level);
        
    
    if (wallLimit <= 0 && rampartLimit <= 0) {
        return false;
    }
    
    const wallCount = countRoomPlacedAndPlannedStructures(room, STRUCTURE_WALL);
    const rampartCount = countRoomPlacedAndPlannedStructures(room, STRUCTURE_RAMPART);
    const candidates = getDefenseCandidates(room);
    
    for (const candidate of candidates) {
        if (candidate.structureType === STRUCTURE_WALL && wallCount >= wallLimit) {
            continue;
        }
        
        if (candidate.structureType === STRUCTURE_RAMPART && rampartCount >= rampartLimit) {
            continue;
        }
        
        if (isDefensePositionSatisfied(room, candidate.position, candidate.structureType)) {
            continue;
        }
        
        if (!canSatisfyDefensePosition(room, candidate.position, candidate.structureType)) {
            continue;
        }
        console.log(candidate.structureType 
        )

        const result = room.createConstructionSite(
            candidate.position.x,
            candidate.position.y,
            candidate.structureType
        );

        if (result === OK) {
            console.log(
                `construction planned ${candidate.structureType} at ` +
                `${room.name} (${candidate.position.x},${candidate.position.y})`
            );
            return true;
        }
        else {
            console.log(
                `construction failed ${candidate.structureType} at ` +
                `${room.name} (${candidate.position.x},${candidate.position.y})` + 
                `${result}`
            );
        }
    }

    return false;
}

function getDefenseCandidates(room) {
    const candidates = [];

    for (const side of DEFENSE_SIDES) {
        const segments = getDefenseSegmentsForSide(room, side);

        for (const segment of segments) {
            const segmentCandidates = buildDefenseCandidatesForSegment(room, segment);

            for (const candidate of segmentCandidates) {
                candidates.push(candidate);
            }
        }
    }

    return candidates;
}

function getDefenseReservedPositions(room) {
    const reservedPositions = {};

    for (const side of DEFENSE_SIDES) {
        const segments = getDefenseSegmentsForSide(room, side);

        for (const segment of segments) {
            for (const position of segment) {
                if (!isValidDefensePosition(room, position)) {
                    continue;
                }

                reservedPositions[buildPositionKey(position)] = true;
            }
        }
    }

    return reservedPositions;
}

function getDefenseSegmentsForSide(room, side) {
    const terrain = room.getTerrain();
    const segments = [];
    let currentSegment = [];

    for (let coordinate = side.start; coordinate <= side.end; coordinate += 1) {
        const borderPosition = side.getBorderPosition(coordinate, room.name);

        if (terrain.get(borderPosition.x, borderPosition.y) === TERRAIN_MASK_WALL) {
            if (currentSegment.length > 0) {
                segments.push(currentSegment);
                currentSegment = [];
            }

            continue;
        }

        currentSegment.push(getDefensePosition(side, coordinate, room.name));
    }

    if (currentSegment.length > 0) {
        segments.push(currentSegment);
    }

    return segments;
}

function getDefensePosition(side, coordinate, roomName) {
    if (!side || typeof side.name !== "string") {
        return null;
    }

    if (side.name === "top") {
        return {
            roomName: roomName,
            x: coordinate,
            y: DEFENSE_BORDER_OFFSET,
        };
    }

    if (side.name === "bottom") {
        return {
            roomName: roomName,
            x: coordinate,
            y: 49 - DEFENSE_BORDER_OFFSET,
        };
    }

    if (side.name === "left") {
        return {
            roomName: roomName,
            x: DEFENSE_BORDER_OFFSET,
            y: coordinate,
        };
    }

    if (side.name === "right") {
        return {
            roomName: roomName,
            x: 49 - DEFENSE_BORDER_OFFSET,
            y: coordinate,
        };
    }

    return null;
}

function buildDefenseCandidatesForSegment(room, segment) {
    const validEntries = [];

    for (let index = 0; index < segment.length; index += 1) {
        const position = segment[index];

        if (!isValidDefensePosition(room, position)) {
            continue;
        }

        validEntries.push({
            index: index,
            position: position,
        });
    }

    if (validEntries.length === 0) {
        return [];
    }

    const doorEntry = chooseDefenseDoorEntry(room, validEntries);

    if (!doorEntry) {
        return [];
    }

    const orderedEntries = validEntries.slice().sort(function (left, right) {
        const distanceOrder =
            Math.abs(left.index - doorEntry.index) - Math.abs(right.index - doorEntry.index);

        if (distanceOrder !== 0) {
            return distanceOrder;
        }

        return left.index - right.index;
    });

    const candidates = [];

    for (const entry of orderedEntries) {
        let structureType = entry.index === doorEntry.index
            ? STRUCTURE_RAMPART
            : STRUCTURE_WALL;

        if (
            structureType === STRUCTURE_WALL &&
            !isDefensePositionSatisfied(room, entry.position, STRUCTURE_WALL) &&
            !canPlaceWallAt(room, entry.position) &&
            canPlaceRampartAt(room, entry.position)
        ) {
            structureType = STRUCTURE_RAMPART;
        }

        candidates.push({
            position: entry.position,
            structureType: structureType,
        });
    }

    return candidates;
}

function chooseDefenseDoorEntry(room, entries) {
    const rampartEntries = entries.filter(function (entry) {
        return canSatisfyDefensePosition(room, entry.position, STRUCTURE_RAMPART);
    });

    if (rampartEntries.length === 0) {
        return null;
    }

    return rampartEntries[Math.floor(rampartEntries.length / 2)];
}

function isValidDefensePosition(room, position) {
    if (
        !position ||
        position.roomName !== room.name ||
        !isInsideRoom(position.x, position.y)
    ) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    if (room.lookForAt(LOOK_SOURCES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_MINERALS, position.x, position.y).length > 0) {
        return false;
    }

    if (room.controller && room.controller.pos.x === position.x && room.controller.pos.y === position.y) {
        return false;
    }

    return true;
}

function canSatisfyDefensePosition(room, position, structureType) {
    if (isDefensePositionSatisfied(room, position, structureType)) {
        return true;
    }

    if (structureType === STRUCTURE_WALL) {
        return canPlaceWallAt(room, position);
    }

    return canPlaceRampartAt(room, position);
}

function isDefensePositionSatisfied(room, position, structureType) {
    if (structureType === STRUCTURE_WALL) {
        return (
            hasStructureOrSiteAt(room, position, STRUCTURE_WALL) ||
            hasStructureOrSiteAt(room, position, STRUCTURE_RAMPART)
        );
    }

    return hasStructureOrSiteAt(room, position, STRUCTURE_RAMPART);
}

function pruneRoadHeat(roomName) {
    const roadHeat = getRoadHeatMemory(roomName);
    const cutoffTick = Game.time - ROAD_HEAT_WINDOW;

    for (const tickKey in roadHeat.bucketsByTick) {
        const tick = Number(tickKey);

        if (!Number.isFinite(tick) || tick > cutoffTick) {
            continue;
        }

        const bucket = roadHeat.bucketsByTick[tickKey];

        for (const positionKey in bucket) {
            if (roadHeat.totalsByPos[positionKey]) {
                roadHeat.totalsByPos[positionKey] -= bucket[positionKey];

                if (roadHeat.totalsByPos[positionKey] <= 0) {
                    delete roadHeat.totalsByPos[positionKey];
                }
            }
        }

        delete roadHeat.bucketsByTick[tickKey];
    }

    roadHeat.lastPrunedTick = cutoffTick;
}

function getRoadCandidates(room, anchor) {
    const roadHeat = getRoadHeatMemory(room.name);
    const candidates = [];

    for (const positionKey in roadHeat.totalsByPos) {
        const count = roadHeat.totalsByPos[positionKey];
        const position = parsePositionKey(positionKey);

        if (!position || position.roomName !== room.name || count <= 0) {
            continue;
        }

        candidates.push({
            key: positionKey,
            position: position,
            count: count,
        });
    }

    candidates.sort(function (left, right) {
        if (right.count !== left.count) {
            return right.count - left.count;
        }

        const distanceOrder = getAnchorRange(anchor, left.position) - getAnchorRange(anchor, right.position);

        if (distanceOrder !== 0) {
            return distanceOrder;
        }

        return left.key.localeCompare(right.key);
    });

    return candidates;
}

function getRoadHeatOverlay(room) {
    if (!room || !room.name) {
        return {
            minVisits: ROAD_MIN_VISITS,
            candidates: [],
        };
    }

    pruneRoadHeat(room.name);

    return {
        minVisits: ROAD_MIN_VISITS,
        candidates: getRoadCandidates(room, chooseExtensionAnchor(room)),
    };
}

function getRepairHeatOverlay(room) {
    if (!room || !room.name) {
        return {
            candidates: [],
        };
    }

    const candidates = [];
    const candidatesByPositionKey = {};

    for (const entry of getSortedRepairCandidates(room)) {
        if (!entry || !entry.target || !entry.target.pos) {
            continue;
        }

        const positionKey = buildPositionKey(entry.target.pos);

        if (!candidatesByPositionKey[positionKey]) {
            const integrityRatio = getRepairIntegrityRatio(entry.target, entry.repairGoal);
            const overlayCandidate = {
                key: positionKey,
                position: entry.target.pos,
                structureType: entry.target.structureType,
                hits: entry.target.hits,
                repairGoal: entry.repairGoal,
                integrityRatio: integrityRatio,
                integrityPercent: Math.max(0, Math.min(100, Math.round(integrityRatio * 100))),
            };

            candidatesByPositionKey[positionKey] = overlayCandidate;
            candidates.push(overlayCandidate);
        }
    }

    return {
        candidates: candidates,
    };
}

function getRoadHeatMemory(roomName) {
    const roomMemory = getConstructionRoomMemory(roomName);

    if (!roomMemory.roadHeat || typeof roomMemory.roadHeat !== "object") {
        roomMemory.roadHeat = {};
    }

    if (!roomMemory.roadHeat.totalsByPos || typeof roomMemory.roadHeat.totalsByPos !== "object") {
        roomMemory.roadHeat.totalsByPos = {};
    }

    if (!roomMemory.roadHeat.bucketsByTick || typeof roomMemory.roadHeat.bucketsByTick !== "object") {
        roomMemory.roadHeat.bucketsByTick = {};
    }

    if (typeof roomMemory.roadHeat.lastPrunedTick !== "number") {
        roomMemory.roadHeat.lastPrunedTick = Game.time - ROAD_HEAT_WINDOW;
    }

    return roomMemory.roadHeat;
}

function getManagedRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.room) {
            roomNames[spawn.room.name] = true;
        }
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.my) {
            roomNames[roomName] = true;
        }
    }

    return Object.keys(roomNames);
}

function hasStructureOrSiteAt(room, position, structureType) {
    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (structure.structureType === structureType) {
            return true;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (site.structureType === structureType) {
            return true;
        }
    }

    return false;
}

function canPlaceContainerAt(room, position) {
    if (!position || position.roomName !== room.name) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (
            structure.structureType !== STRUCTURE_ROAD &&
            structure.structureType !== STRUCTURE_RAMPART &&
            structure.structureType !== STRUCTURE_CONTAINER
        ) {
            return false;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (
            site.structureType !== STRUCTURE_ROAD &&
            site.structureType !== STRUCTURE_RAMPART &&
            site.structureType !== STRUCTURE_CONTAINER
        ) {
            return false;
        }
    }

    return true;
}

function countRoomStructuresAndSites(room, structureType) {
    let count = 0;

    for (const structure of room.find(FIND_MY_STRUCTURES)) {
        if (structure.structureType === structureType) {
            count += 1;
        }
    }

    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType === structureType) {
            count += 1;
        }
    }

    return count;
}

function countRoomPlacedAndPlannedStructures(room, structureType) {
    let count = 0;

    for (const structure of room.find(FIND_STRUCTURES)) {
        if (structure.structureType === structureType && (!structure.owner || structure.my)) {
            count += 1;
        }
    }

    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (site.structureType === structureType) {
            count += 1;
        }
    }

    return count;
}

function chooseExtensionAnchor(room) {
    const spawns = room.find(FIND_MY_SPAWNS);

    if (spawns.length === 0) {
        return null;
    }

    return spawns[0];
}

function getReservedPositions(room) {
    const reservedPositions = {};
    const minerSources = sourceManager.getMinerSourcesForRoom(room.name);

    for (const sourceData of minerSources) {
        if (!sourceData || !sourceData.minerPos) {
            continue;
        }

        reservedPositions[buildPositionKey(sourceData.minerPos)] = true;
    }

    return reservedPositions;
}

function getExtensionCandidatePositions(anchorPos) {
    const positions = [];

    for (let range = 2; range <= EXTENSION_SEARCH_RANGE; range += 1) {
        for (let dx = -range; dx <= range; dx += 1) {
            for (let dy = -range; dy <= range; dy += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== range) {
                    continue;
                }

                const x = anchorPos.x + dx;
                const y = anchorPos.y + dy;

                if (!isInsideExtensionBounds(x, y)) {
                    continue;
                }

                if ((x + y) % 2 !== 0) {
                    continue;
                }

                positions.push({
                    x: x,
                    y: y,
                    roomName: anchorPos.roomName,
                });
            }
        }
    }

    return positions;
}

function canPlaceExtensionAt(room, position, reservedPositions) {
    if (!position || position.roomName !== room.name) {
        return false;
    }

    if (!isInsideExtensionBounds(position.x, position.y)) {
        return false;
    }

    if (reservedPositions[buildPositionKey(position)]) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    if (room.lookForAt(LOOK_STRUCTURES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_SOURCES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_MINERALS, position.x, position.y).length > 0) {
        return false;
    }

    if (room.controller && room.controller.pos.x === position.x && room.controller.pos.y === position.y) {
        return false;
    }

    return true;
}

function canPlaceRoadAt(room, position) {
    if (
        !position ||
        position.roomName !== room.name ||
        !isInsideRoom(position.x, position.y)
    ) {
        return false;
    }

    if (room.getTerrain().get(position.x, position.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_ROAD) {
            return false;
        }

        if (
            structure.structureType !== STRUCTURE_CONTAINER &&
            structure.structureType !== STRUCTURE_RAMPART
        ) {
            return false;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (site.structureType === STRUCTURE_ROAD) {
            return false;
        }

        if (
            site.structureType !== STRUCTURE_CONTAINER &&
            site.structureType !== STRUCTURE_RAMPART
        ) {
            return false;
        }
    }

    if (room.lookForAt(LOOK_SOURCES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_MINERALS, position.x, position.y).length > 0) {
        return false;
    }

    if (room.controller && room.controller.pos.x === position.x && room.controller.pos.y === position.y) {
        return false;
    }

    return true;
}

function canPlaceWallAt(room, position) {
    if (!isValidDefensePosition(room, position)) {
        return false;
    }

    if (room.lookForAt(LOOK_STRUCTURES, position.x, position.y).length > 0) {
        return false;
    }

    if (room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y).length > 0) {
        return false;
    }

    return true;
}

function canPlaceRampartAt(room, position) {
    if (!isValidDefensePosition(room, position)) {
        return false;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, position.x, position.y);

    for (const structure of structures) {
        if (
            structure.structureType === STRUCTURE_WALL ||
            structure.structureType === STRUCTURE_RAMPART
        ) {
            return false;
        }

        if (structure.owner && !structure.my) {
            return false;
        }
    }

    const constructionSites = room.lookForAt(LOOK_CONSTRUCTION_SITES, position.x, position.y);

    for (const site of constructionSites) {
        if (
            site.structureType === STRUCTURE_WALL ||
            site.structureType === STRUCTURE_RAMPART
        ) {
            return false;
        }

        return false;
    }

    return true;
}

function isInsideExtensionBounds(x, y) {
    return (
        x >= EXTENSION_MIN_COORD &&
        x <= EXTENSION_MAX_COORD &&
        y >= EXTENSION_MIN_COORD &&
        y <= EXTENSION_MAX_COORD
    );
}

function getStructureLimit(structureType, controllerLevel) {
    if (
        typeof CONTROLLER_STRUCTURES === "undefined" ||
        !CONTROLLER_STRUCTURES[structureType] ||
        typeof CONTROLLER_STRUCTURES[structureType][controllerLevel] !== "number"
    ) {
        return 0;
    }

    return CONTROLLER_STRUCTURES[structureType][controllerLevel];
}

function getNormalizedDefenseBorderOffset() {
    const rawOffset =
        constants.construction &&
        typeof constants.construction.DEFENSE_BORDER_OFFSET === "number"
            ? constants.construction.DEFENSE_BORDER_OFFSET
            : 1;

    return Math.max(1, Math.min(24, Math.floor(rawOffset)));
}

function buildPositionKey(position) {
    return `${position.roomName}:${position.x}:${position.y}`;
}

function isInsideRoom(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function parsePositionKey(positionKey) {
    if (typeof positionKey !== "string") {
        return null;
    }

    const parts = positionKey.split(":");

    if (parts.length !== 3) {
        return null;
    }

    const x = Number(parts[1]);
    const y = Number(parts[2]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return {
        roomName: parts[0],
        x: x,
        y: y,
    };
}

module.exports = {
    getRepairHeatOverlay,
    getRoadHeatOverlay,
    refreshManagedConstruction,
};
