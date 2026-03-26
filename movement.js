function moveTo(creep, target) {
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
