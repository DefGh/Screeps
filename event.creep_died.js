const dispatcherCleanup = require("./dispatcher.cleanup");

function handle(event, ctx) {
    const actionIds = collectActionIds(event.data.name, event.data.actionIds || []);

    ctx.log(`[events] handled ${event.type} for ${event.data.name}`);

    for (const actionId of actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (!action) {
            continue;
        }

        dispatcherCleanup.cleanupAssignedAction(action, {
            event: event,
            invokeCreepDeath: true,
            log: ctx.log,
            reason: `dead-creep:${event.data.name}`,
        });
    }
}

function collectActionIds(creepName, knownActionIds) {
    const actionIdsById = {};

    for (const actionId of knownActionIds) {
        actionIdsById[actionId] = true;
    }

    for (const actionId in Memory.Dispatcher.actionsById) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (
            action &&
            action.executorName === creepName &&
            action.executorType !== "room" &&
            action.executorType !== "spawn" &&
            action.executorType !== "tower"
        ) {
            actionIdsById[actionId] = true;
        }
    }

    return Object.keys(actionIdsById);
}

module.exports = {
    handle,
};
