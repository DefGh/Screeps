const constants = require("./constants");
const debug = require("./debug");
const tasks = require("./tasks");
const gameStartHandler = require("./event.game_start");
const rclChangeHandler = require("./event.rcl_change");
const gclChangeHandler = require("./event.gcl_change");
const creepDiedHandler = require("./event.creep_died");
const hostileCreepAppearedHandler = require("./event.hostile_creep_appeared");

const handlers = {
    [constants.eventTypes.GAME_START]: gameStartHandler,
    [constants.eventTypes.RCL_CHANGE]: rclChangeHandler,
    [constants.eventTypes.GCL_CHANGE]: gclChangeHandler,
    [constants.eventTypes.CREEP_DIED]: creepDiedHandler,
    [constants.eventTypes.HOSTILE_CREEP_APPEARED]: hostileCreepAppearedHandler,
};

function fireEvent(room, type, data) {
    const event = createEvent(room, type, data);
    
    debug.log(`[events] firing ${event.id}`);

    return dispatchEvent(event);
}

function createEvent(room, type, data) {
    return {
        id: eventId(room, type),
        room: room,
        type: type,
        data: data || {},
        tick: Game.time,
    };
}

function dispatchEvent(event) {
    const handler = handlers[event.type];

    if (!handler) {
        debug.log(`[events] no handler for ${event.type}`);
        return {
            ok: true,
            event: event,
            handled: false,
        };
    }

    handler.handle(event, {
        log: debug.log,
        fireEvent: fireEvent,
        createTask: tasks.addTask,
    });

    return {
        ok: true,
        event: event,
        handled: true,
    };
}

function eventId(room, type) {
    Memory.eventId += 1;
 
    return `${room || "global"}:${type}:${Memory.eventId}`;
}

module.exports = {
    fireEvent
};
