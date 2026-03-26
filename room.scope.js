function getOwnedRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        roomNames[Game.spawns[name].room.name] = true;
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.my) {
            roomNames[roomName] = true;
        }
    }

    return Object.keys(roomNames).sort();
}

function getOperationalRoomNames() {
    return getOwnedRoomNames();
}

function getMyUsername() {
    for (const name in Game.spawns) {
        return Game.spawns[name].owner.username;
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.owner && room.controller.my) {
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
