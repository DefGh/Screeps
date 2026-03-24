const constants = require("./constants");
const memoryAccess = require("./memory.access");
const bootstrapSpawnTask = require("./task.bootstrapSpawn");
const movement = require("./movement");
const taskHelpers = require("./task.helpers");

function run(creep, task) {
    if (!isValidClaimTask(task) || !creep || typeof creep.moveTo !== "function" || typeof creep.claimController !== "function") {
        return true;
    }

    if (!Game.rooms[task.data.targetRoomName] || !Game.rooms[task.data.targetRoomName].controller) {
        if (!creep.room || creep.room.name !== task.data.targetRoomName) {
            movement.moveTo(creep, new RoomPosition(25, 25, task.data.targetRoomName));
            return false;
        }
    }

    const room = Game.rooms[task.data.targetRoomName] || creep.room;
    const controller = room && room.controller;

    if (!controller) {
        rejectActiveCandidate(task.data.originRoomName, task.data.targetRoomName);
        return true;
    }

    if (controller.my) {
        bootstrapSpawnTask.ensureBootstrapSpawnTask(
            task.data.originRoomName,
            task.data.targetRoomName
        );
        return true;
    }

    const result = creep.claimController(controller);

    if (result === OK) {
        bootstrapSpawnTask.ensureBootstrapSpawnTask(
            task.data.originRoomName,
            task.data.targetRoomName
        );
        return true;
    }

    if (result === ERR_NOT_IN_RANGE) {
        movement.moveTo(creep, controller);
        return false;
    }

    if (result === ERR_GCL_NOT_ENOUGH) {
        setActiveCandidateStatus(task.data.targetRoomName, "waitingForGcl");
        return true;
    }

    if (result === ERR_BUSY || result === ERR_TIRED) {
        return false;
    }

    rejectActiveCandidate(task.data.originRoomName, task.data.targetRoomName);
    return true;
}

function canExecute(executor, task) {
    return (
        validate(task) &&
        taskHelpers.canExecuteTaskInRoom(
            executor,
            task.data.originRoomName,
            ["moveTo", "claimController"]
        )
    );
}

function clearActiveCandidate(targetRoomName) {
    const activeCandidate = memoryAccess.getExpansionActiveCandidate();

    if (activeCandidate && activeCandidate.targetRoomName === targetRoomName) {
        memoryAccess.setExpansionActiveCandidate(null);
    }
}

function rejectActiveCandidate(originRoomName, targetRoomName) {
    if (typeof originRoomName === "string" && typeof targetRoomName === "string") {
        const branchKey = `${originRoomName}->${targetRoomName}`;
        const candidate = memoryAccess.getExpansionActiveCandidate();

        memoryAccess.getExpansionBranchIntel()[branchKey] = {
            checkedAt: Game.time,
            status: "invalid",
            branchRooms:
                candidate &&
                candidate.originRoomName === originRoomName &&
                candidate.targetRoomName === targetRoomName &&
                Array.isArray(candidate.branchRooms)
                    ? candidate.branchRooms.slice()
                    : [],
        };
    }

    clearActiveCandidate(targetRoomName);
}

function setActiveCandidateStatus(targetRoomName, status) {
    const activeCandidate = memoryAccess.getExpansionActiveCandidate();

    if (activeCandidate && activeCandidate.targetRoomName === targetRoomName) {
        activeCandidate.status = status;
    }
}

function isValidClaimTask(task) {
    return taskHelpers.hasTaskDataFields(task, constants.taskTypes.CLAIM_ROOM, {
        targetRoomName: "string",
        originRoomName: "string",
    });
}

function validate(task) {
    return isValidClaimTask(task);
}

function getOwnerRoom(task) {
    return taskHelpers.getTaskOwnerRoom(task, validate, "originRoomName");
}

module.exports = {
    canExecute,
    getOwnerRoom,
    run,
    validate,
};
