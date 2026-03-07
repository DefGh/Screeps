module.exports = {
    run(executer, task) {
        const { whom, where } = task.data || {};

        // Invalid task data – complete to avoid being stuck
        if (!whom || !where) {
            return true;
        }

        const target = Game.getObjectById(whom);

        // Target creep died or disappeared – consider task finished
        if (!target) {
            return true;
        }

        const targetAtDestination =
            target.pos.x === where.x && target.pos.y === where.y;

        // Target already at destination – nothing to do
        if (targetAtDestination) {
            return true;
        }

        const pullResult = executer.pull(target);

        if (pullResult === ERR_NOT_IN_RANGE) {
            return false;
        }
        else {
            target.move(creep);
        }

        const executerAtDestination =
            executer.pos.x === where.x && executer.pos.y === where.y;

        if (executerAtDestination) {
            executer.move(executer.pos.getDirectionTo(target));
        } else {
            executer.moveTo(where.x, where.y);
        }


        return false;
    },
};
