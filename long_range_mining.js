const constants = require("./constants");
const plannerStorageCenter = require("./planner.storage_center");

function getOwnedStorage(room) {
    if (!room) {
        return null;
    }

    if (
        room.storage &&
        room.storage.my
    ) {
        return room.storage;
    }

    const storages = room.find(FIND_MY_STRUCTURES).filter(function (structure) {
        return structure.structureType === STRUCTURE_STORAGE;
    });

    return storages[0] || null;
}

function getStorageSite(room, plan) {
    if (!room || !plan) {
        return getAnyStorageSite(room);
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, plan.x, plan.y);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_STORAGE) {
            return site;
        }
    }

    return getAnyStorageSite(room);
}

function hasStorageCapability(room) {
    if (!room || !room.controller || !room.controller.my) {
        return false;
    }

    return ((CONTROLLER_STRUCTURES[STRUCTURE_STORAGE][room.controller.level] || 0) > 0);
}

function getAdjacentRoomNames(roomName) {
    const exits = Game.map.describeExits(roomName) || {};
    const roomNames = Object.values(exits).filter(Boolean);

    roomNames.sort(function (left, right) {
        return left.localeCompare(right);
    });

    return roomNames;
}

function ensureTaskState(task, room) {
    if (!task.data) {
        task.data = {};
    }

    syncStoragePlan(task, room);
    syncOutposts(task, room);
}

function syncStoragePlan(task, room) {
    const storage = getOwnedStorage(room);

    if (storage) {
        task.data.storagePlan = {
            roomName: room.name,
            x: storage.pos.x,
            y: storage.pos.y,
        };
        return;
    }

    if (!hasStorageCapability(room)) {
        delete task.data.storagePlan;
        return;
    }

    if (
        task.data.storagePlan &&
        task.data.storagePlan.roomName === room.name
    ) {
        return;
    }

    const plan = plannerStorageCenter.selectStorageTile(room);

    if (!plan) {
        delete task.data.storagePlan;
        return;
    }

    task.data.storagePlan = plan;
}

function syncOutposts(task, room) {
    if (!task.data.outposts) {
        task.data.outposts = {};
    }

    const adjacentRoomNames = getAdjacentRoomNames(room.name);
    const keep = {};

    for (const roomName of adjacentRoomNames) {
        keep[roomName] = true;

        if (!task.data.outposts[roomName]) {
            task.data.outposts[roomName] = {
                roomName: roomName,
                sourceIds: [],
                status: "unknown",
            };
        }
    }

    for (const roomName in task.data.outposts) {
        if (!keep[roomName]) {
            delete task.data.outposts[roomName];
        }
    }
}

function refreshVisibleOutposts(task, room) {
    const outposts = task.data.outposts || {};

    for (const roomName in outposts) {
        const visibleRoom = Game.rooms[roomName];

        if (!visibleRoom) {
            continue;
        }

        const classification = classifyOutpost(room.name, visibleRoom);

        outposts[roomName].lastSeen = Game.time;
        outposts[roomName].sourceIds = classification.sourceIds;
        outposts[roomName].status = classification.status;
    }
}

function classifyOutpost(originRoomName, room) {
    if (!room || room.name === originRoomName) {
        return {
            sourceIds: [],
            status: "blocked",
        };
    }

    if (!isStandardOutpostRoom(room.name)) {
        return {
            sourceIds: [],
            status: "blocked",
        };
    }

    if (!room.controller) {
        return {
            sourceIds: [],
            status: "blocked",
        };
    }

    if (room.controller.my || (room.controller.owner && room.controller.owner.username)) {
        return {
            sourceIds: [],
            status: room.controller.my ? "blocked" : "blocked",
        };
    }

    if (
        room.controller.reservation &&
        room.controller.reservation.username &&
        room.controller.reservation.username !== getMyUsername()
    ) {
        return {
            sourceIds: [],
            status: "blocked",
        };
    }

    if (room.find(FIND_HOSTILE_STRUCTURES).length > 0) {
        return {
            sourceIds: [],
            status: "blocked",
        };
    }

    return {
        sourceIds: room.find(FIND_SOURCES).map(function (source) {
            return source.id;
        }),
        status: "safe",
    };
}

function pickNextScoutRoom(task) {
    const outposts = Object.values(task.data.outposts || {}).filter(function (outpost) {
        return outpost.status === "unknown";
    });

    if (outposts.length === 0) {
        return null;
    }

    outposts.sort(function (left, right) {
        const leftSeen = Number.isFinite(left.lastSeen) ? left.lastSeen : -1;
        const rightSeen = Number.isFinite(right.lastSeen) ? right.lastSeen : -1;

        if (leftSeen !== rightSeen) {
            return leftSeen - rightSeen;
        }

        return left.roomName.localeCompare(right.roomName);
    });

    return outposts[0] || null;
}

function getRemoteContainer(anchor) {
    const room = anchor ? Game.rooms[anchor.roomName] : null;

    if (!room || !anchor) {
        return null;
    }

    const structures = room.lookForAt(LOOK_STRUCTURES, anchor.x, anchor.y);

    for (const structure of structures) {
        if (structure.structureType === STRUCTURE_CONTAINER) {
            return structure;
        }
    }

    return null;
}

function getRemoteContainerSite(anchor) {
    const room = anchor ? Game.rooms[anchor.roomName] : null;

    if (!room || !anchor) {
        return null;
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, anchor.x, anchor.y);

    for (const site of sites) {
        if (site.structureType === STRUCTURE_CONTAINER) {
            return site;
        }
    }

    return null;
}

function isRemoteMiningTask(task) {
    return !!(
        task &&
        task.type === constants.taskTypes.MINING_OPERATION &&
        task.data &&
        task.data.isRemote
    );
}

function isStandardOutpostRoom(roomName) {
    const parsed = parseRoomName(roomName);

    if (!parsed) {
        return false;
    }

    const xMod = parsed.x % 10;
    const yMod = parsed.y % 10;

    if (xMod === 0 || yMod === 0) {
        return false;
    }

    if (
        xMod >= 4 && xMod <= 6 &&
        yMod >= 4 && yMod <= 6
    ) {
        return false;
    }

    return true;
}

function parseRoomName(roomName) {
    const match = /^([WE])(\d+)([NS])(\d+)$/.exec(roomName || "");

    if (!match) {
        return null;
    }

    return {
        x: Number(match[2]),
        xDir: match[1],
        y: Number(match[4]),
        yDir: match[3],
    };
}

function getMyUsername() {
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];

        if (
            spawn &&
            spawn.owner &&
            spawn.owner.username
        ) {
            return spawn.owner.username;
        }
    }

    return null;
}

function getAnyStorageSite(room) {
    if (!room) {
        return null;
    }

    const sites = room.find(FIND_CONSTRUCTION_SITES).filter(function (site) {
        return site.structureType === STRUCTURE_STORAGE;
    });

    return sites[0] || null;
}

module.exports = {
    classifyOutpost,
    ensureTaskState,
    getAdjacentRoomNames,
    getOwnedStorage,
    getRemoteContainer,
    getRemoteContainerSite,
    getStorageSite,
    hasStorageCapability,
    isRemoteMiningTask,
    pickNextScoutRoom,
    refreshVisibleOutposts,
};
