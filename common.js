const constants = require("constants");

module.exports = {
    buildBody(role) {
        const spawn = Game.spawns["Spawn1"];
        if (!spawn) {
            return [];
        }

        const maxEnergy = spawn.store.getCapacity([RESOURCE_ENERGY]);

        let pattern;
        switch (role) {
            case constants.roles.UNIVERSAL:
                pattern = [
                    constants.BodyParts.MOVE,
                    constants.BodyParts.CARRY,
                    constants.BodyParts.WORK,
                    constants.BodyParts.MOVE,
                    constants.BodyParts.CARRY,
                    constants.BodyParts.WORK,
                    constants.BodyParts.MOVE,
                    constants.BodyParts.CARRY,
                    constants.BodyParts.WORK,
                    constants.BodyParts.MOVE,
                    constants.BodyParts.CARRY,
                    constants.BodyParts.WORK,
                    constants.BodyParts.MOVE,
                    constants.BodyParts.CARRY,
                    constants.BodyParts.WORK,
                ];
                break;
            case constants.roles.MINER:
                pattern = [
                    constants.BodyParts.WORK,
                    constants.BodyParts.WORK,
                    constants.BodyParts.WORK,
                    constants.BodyParts.WORK,
                    constants.BodyParts.WORK,
                ];
                break;
            default:
                return [];
        }

        let avail = maxEnergy;
        const body = [];

        while (avail > 0) {
            for (const part of pattern) {
                if (avail >= part.cost) {
                    avail -= part.cost;
                    body.push(part.part);
                } else {
                    return body;
                }
            }
        }

        return body;
    },
};
