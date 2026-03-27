const tasks = require("./tasks");

function execute(creep, action) {
    if (!tasks.getTask(action.taskId)) {
        return true;
    }

    const passenger = Game.creeps[action.data.passengerName];

    if (!passenger || isAtTarget(passenger, action.data)) {
        return true;
    }

    if (!creep.pos.isNearTo(passenger)) {
        creep.moveTo(passenger);
        return false;
    }


    creep.pull(passenger);
    passenger.move(creep);

    if (isAtTarget(creep, action.data))
    {
        creep.moveTo(passenger)
    }
    else {
        creep.moveTo(new RoomPosition(action.data.x, action.data.y, action.data.roomName));
    }
    

    return isAtTarget(passenger, action.data);
}

function onCompleted() {
}

function onCreepDeath() {
}

function isAtTarget(creep, data) {
    return (
        creep.pos.roomName === data.roomName &&
        creep.pos.x === data.x &&
        creep.pos.y === data.y
    );
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
