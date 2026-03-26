function moveTo(creep, target) {
    if (!creep || typeof creep.moveTo !== "function") {
        return ERR_INVALID_TARGET;
    }

    const result = creep.moveTo(target, {
        reusePath: 10,
    });

    if (result === ERR_NO_PATH) {
        return creep.moveTo(target);
    }

    return result;
}

module.exports = {
    moveTo,
};
