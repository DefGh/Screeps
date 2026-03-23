const constants = require("./constants");
const bootstrapSpawnTask = require("./task.bootstrapSpawn");

function run(creep, task) {
    if (!isValidClaimTask(task) || !creep || typeof creep.moveTo !== "function" || typeof creep.claimController !== "function") {
        return true;
    }

    if (!Game.rooms[task.data.targetRoomName] || !Game.rooms[task.data.targetRoomName].controller) {
        if (!creep.room || creep.room.name !== task.data.targetRoomName) {
            creep.moveTo(new RoomPosition(25, 25, task.data.targetRoomName));
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
        creep.moveTo(controller);
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
        isValidClaimTask(task) &&
        executor &&
        typeof executor.moveTo === "function" &&
        typeof executor.claimController === "function"
    );
}

function clearActiveCandidate(targetRoomName) {
    if (
        Memory.expansion &&
        Memory.expansion.activeCandidate &&
        Memory.expansion.activeCandidate.targetRoomName === targetRoomName
    ) {
        Memory.expansion.activeCandidate = null;
    }
}

function rejectActiveCandidate(originRoomName, targetRoomName) {
    if (
        Memory.expansion &&
        Memory.expansion.branchIntel &&
        typeof originRoomName === "string" &&
        typeof targetRoomName === "string"
    ) {
        const branchKey = `${originRoomName}->${targetRoomName}`;
        const candidate = Memory.expansion.activeCandidate;

        Memory.expansion.branchIntel[branchKey] = {
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
    if (
        Memory.expansion &&
        Memory.expansion.activeCandidate &&
        Memory.expansion.activeCandidate.targetRoomName === targetRoomName
    ) {
        Memory.expansion.activeCandidate.status = status;
    }
}

function isValidClaimTask(task) {
    return Boolean(
        task &&
        task.type === constants.taskTypes.CLAIM_ROOM &&
        task.data &&
        typeof task.data.targetRoomName === "string" &&
        typeof task.data.originRoomName === "string"
    );
}

module.exports = {
    canExecute,
    run,
};
