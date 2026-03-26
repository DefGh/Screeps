const roomScope = require("./room.scope");

function runTowers() {
    for (const roomName of roomScope.getOwnedRoomNames()) {
        const room = Game.rooms[roomName];

        for (const tower of room.find(FIND_MY_STRUCTURES, {
            filter: function (structure) {
                return structure.structureType === STRUCTURE_TOWER;
            },
        })) {
            runTower(tower);
        }
    }
}

function runTower(tower) {
    const energy = tower.store
        ? (tower.store[RESOURCE_ENERGY] || 0)
        : tower.energy;

    if (energy <= 0) {
        return;
    }

    const hostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);

    if (hostile) {
        tower.attack(hostile);
        return;
    }

    const injured = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: function (creep) {
            return creep.hits < creep.hitsMax;
        },
    });

    if (injured) {
        tower.heal(injured);
    }
}

module.exports = {
    runTowers,
};
