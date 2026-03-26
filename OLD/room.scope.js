function getOwnedRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.room) {
            roomNames[spawn.room.name] = true;
        }
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room && room.controller && room.controller.my) {
            roomNames[roomName] = true;
        }
    }

    return Object.keys(roomNames).sort();
}

function getOperationalRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.room) {
            roomNames[spawn.room.name] = true;
        }
    }

    return Object.keys(roomNames).sort();
}

function getMyUsername() {
    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.owner && typeof spawn.owner.username === "string") {
            return spawn.owner.username;
        }
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room && room.controller && room.controller.owner && room.controller.my) {
            return room.controller.owner.username;
        }
    }

    return null;
}

module.exports = {
    getMyUsername,
    getOperationalRoomNames,
    getOwnedRoomNames,
};
