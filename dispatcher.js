const constants = require("./constants");
const debug = require("./debug");
const tasks = require("./tasks");

const roomPriority = [
    constants.taskTypes.CHECKER,
    constants.taskTypes.MINING_OPERATION,
    constants.taskTypes.SYNC_EXTENSIONS,
];

const spawnPriority = [
    constants.taskTypes.SPAWN_CREEP,
    constants.taskTypes.MINING_OPERATION,
];

const universalPriority = [
    constants.taskTypes.MINING_OPERATION,
    constants.taskTypes.FILL_SPAWN,
    constants.taskTypes.FILL_EXTENSION,
    constants.taskTypes.FILL_TOWER,
    constants.taskTypes.REPAIR,
    constants.taskTypes.BUILD,
    constants.taskTypes.UPGRADE_CONTROLLER,
];

const minerPriority = [
    constants.taskTypes.MINING_OPERATION,
];

function askRoom(room) {
    return askByPriority(room.name, room, "room", roomPriority);
}

function askSpawn(spawn) {
    return askByPriority(spawn.room.name, spawn, "spawn", spawnPriority);
}

function askCreep(creep) {
    if (creep.memory.role === constants.roles.UNIVERSAL) {
        return askByPriority(
            creep.memory.originRoomName,
            creep,
            "creep",
            universalPriority
        );
    }

    if (creep.memory.role === constants.roles.MINER) {
        return askByPriority(
            creep.memory.originRoomName,
            creep,
            "creep",
            minerPriority
        );
    }

    return [];
}

function askByPriority(roomName, executor, executorType, priority) {
    if (!roomName) {
        return [];
    }

    const roomTasks = tasks.listTasks(roomName);

    for (const taskType of priority) {
        for (const task of roomTasks) {
            if (task.type !== taskType) {
                continue;
            }

            const handler = tasks.getHandler(task.type);

            if (!handler) {
                continue;
            }

            const templates = handler.tryDispatch(
                task,
                executor,
                createTaskContext(executorType)
            );

            if (!templates || templates.length === 0) {
                continue;
            }

            const actions = createActions(
                task,
                getExecutorName(executorType, executor),
                getExecutorActionType(executorType, executor),
                templates
            );
            const actionIds = actions.map(function (action) {
                return action.id;
            });

            recordTaskAssignment(
                task,
                getExecutorName(executorType, executor),
                actionIds,
                getAssignmentPercent(task, templates)
            );
            debug.log(`[dispatcher] ${getExecutorName(executorType, executor)} <- ${actions.map(function (action) {
                return action.type;
            }).join(", ")}`);

            return actions;
        }
    }

    return [];
}

function createTaskContext(executorType) {
    return {
        addTask: tasks.addTask,
        executorType: executorType,
        listTasks: tasks.listTasks,
        removeTask: tasks.removeTask,
    };
}

function getExecutorName(executorType, executor) {
    if (executorType === "room") {
        return executor.name;
    }

    return executor.name;
}

function getExecutorActionType(executorType, executor) {
    if (executorType === "creep") {
        return executor.memory.role;
    }

    return executorType;
}

function recordTaskAssignment(task, executorName, actionIds, percentDelta) {
    for (const actionId of actionIds) {
        task.actionIds.push(actionId);
    }

    if (!task.executorNames.includes(executorName)) {
        task.executorNames.push(executorName);
    }

    task.assignedPercent = Math.min(100, task.assignedPercent + percentDelta);
}

function createActions(task, executorName, executorType, templates) {
    const actions = [];

    for (const template of templates) {
        actions.push(createAction(
            task,
            executorName,
            executorType,
            template.type,
            template.data
        ));
    }

    return actions;
}

function createAction(task, executorName, executorType, type, data) {
    const action = {
        id: nextActionId(type),
        taskId: task.id,
        room: task.room,
        executorName: executorName,
        executorType: executorType,
        type: type,
        data: data || {},
        createdAt: Game.time,
        status: "queued",
    };

    Memory.Dispatcher.actionsById[action.id] = action;
    return action;
}

function getAssignmentPercent(task, templates) {
    if (task.type === constants.taskTypes.SPAWN_CREEP) {
        return 100;
    }

    if (!task.data.total) {
        return 0;
    }

    for (let index = templates.length - 1; index >= 0; index -= 1) {
        const template = templates[index];

        if (template.data && template.data.amount) {
            return (template.data.amount / task.data.total) * 100;
        }
    }

    return 0;
}

function nextActionId(type) {
    Memory.Dispatcher.sequence += 1;
    return `${type}:${Memory.Dispatcher.sequence}`;
}
module.exports = {
    askCreep,
    askRoom,
    askSpawn,
};
