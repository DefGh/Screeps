function getConstructionRoomMemory(roomName) {
    const rooms = Memory.construction.rooms;

    if (!rooms[roomName] || typeof rooms[roomName] !== "object") {
        rooms[roomName] = {};
    }

    return rooms[roomName];
}

function getConstructionRoadHeatMemory(roomName, defaultLastPrunedTick) {
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
        roomMemory.roadHeat.lastPrunedTick = defaultLastPrunedTick;
    }

    return roomMemory.roadHeat;
}

function getExpansionMemory() {
    return Memory.expansion;
}

function getExpansionRoomIntelMemory(roomName) {
    const roomIntel = Memory.expansion.roomIntel;

    if (!roomIntel[roomName] || typeof roomIntel[roomName] !== "object") {
        roomIntel[roomName] = {};
    }

    return roomIntel[roomName];
}

function getExpansionBranchIntel() {
    return Memory.expansion.branchIntel;
}

function getExpansionActiveBranch() {
    return Memory.expansion.activeBranch;
}

function setExpansionActiveBranch(branch) {
    Memory.expansion.activeBranch = branch;
    require("./reactivity.manager").markGlobalDirty(
        require("./reactivity.manager").domains.EXPANSION,
        {
            wakeDispatch: false,
        }
    );
    return branch;
}

function getExpansionActiveCandidate() {
    return Memory.expansion.activeCandidate;
}

function setExpansionActiveCandidate(candidate) {
    Memory.expansion.activeCandidate = candidate;
    require("./reactivity.manager").markGlobalDirty(
        require("./reactivity.manager").domains.EXPANSION,
        {
            wakeDispatch: false,
        }
    );
    return candidate;
}

module.exports = {
    getConstructionRoadHeatMemory,
    getConstructionRoomMemory,
    getExpansionActiveBranch,
    getExpansionActiveCandidate,
    getExpansionBranchIntel,
    getExpansionMemory,
    getExpansionRoomIntelMemory,
    setExpansionActiveBranch,
    setExpansionActiveCandidate,
};
