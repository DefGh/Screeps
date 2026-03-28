function execute(tower, action) {
    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) <= 0) {
        return true;
    }

    const target = Game.getObjectById(action.data.targetId);

    if (!target) {
        return true;
    }

    tower.attack(target);
    return true;
}

function onCompleted() {
}

function onCreepDeath() {
}

module.exports = {
    execute,
    onCompleted,
    onCreepDeath,
};
