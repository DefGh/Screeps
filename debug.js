const constants = require("./constants");
const tasks = require("./tasks");

const taskIcons = {
    [constants.taskTypes.SPAWN_CREEP]: "🐣",
    [constants.taskTypes.CHECKER]: "🧭",
    [constants.taskTypes.MINING_OPERATION]: "⛏️",
    [constants.taskTypes.SYNC_TOWERS]: "🗼",
    [constants.taskTypes.SYNC_EXTENSIONS]: "🔋",
    [constants.taskTypes.SYNC_FORTIFICATIONS]: "🧱",
    [constants.taskTypes.UPGRADE_CONTROLLER]: "⬆️",
    [constants.taskTypes.FILL_SPAWN]: "⚡",
    [constants.taskTypes.FILL_EXTENSION]: "🔌",
    [constants.taskTypes.FILL_TOWER]: "🛡️",
    [constants.taskTypes.BUILD]: "🏗️",
    [constants.taskTypes.REPAIR]: "🩹",
};

const actionIcons = {
    [constants.actionTypes.SPAWN_CREEP]: "🐣",
    [constants.actionTypes.MINE]: "⛏️",
    [constants.actionTypes.PICKUP_RESOURCE]: "🫳",
    [constants.actionTypes.TAKE_RESOURCE]: "📦",
    [constants.actionTypes.BUILD]: "🏗️",
    [constants.actionTypes.TAXI]: "🚕",
    [constants.actionTypes.PLACE_CONSTRUCTION_SITE]: "📍",
    [constants.actionTypes.TRANSFER_ENERGY]: "🔋",
    [constants.actionTypes.UPGRADE_CONTROLLER]: "⬆️",
    [constants.actionTypes.CHECK_UNIVERSALS]: "👥",
    [constants.actionTypes.CHECK_FILL_SPAWN]: "⚡",
    [constants.actionTypes.CHECK_FILL_EXTENSION]: "🔌",
    [constants.actionTypes.CHECK_FILL_TOWER]: "🛡️",
    [constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT]: "📈",
    [constants.actionTypes.SYNC_MINING_OPERATIONS]: "⛏️",
    [constants.actionTypes.SYNC_ROOM_BUILDER]: "🏗️",
};

const taskColors = {
    [constants.taskTypes.SPAWN_CREEP]: "#f5c542",
    [constants.taskTypes.CHECKER]: "#9aa0a6",
    [constants.taskTypes.MINING_OPERATION]: "#d9822b",
    [constants.taskTypes.SYNC_TOWERS]: "#ff8c42",
    [constants.taskTypes.SYNC_EXTENSIONS]: "#ffd166",
    [constants.taskTypes.SYNC_FORTIFICATIONS]: "#c77dff",
    [constants.taskTypes.UPGRADE_CONTROLLER]: "#7ddc84",
    [constants.taskTypes.FILL_SPAWN]: "#58a6ff",
    [constants.taskTypes.FILL_EXTENSION]: "#58a6ff",
    [constants.taskTypes.FILL_TOWER]: "#58a6ff",
    [constants.taskTypes.BUILD]: "#ff9f43",
    [constants.taskTypes.REPAIR]: "#ff6b6b",
};

const actionLineColors = {
    [constants.actionTypes.MINE]: "#d9822b",
    [constants.actionTypes.PICKUP_RESOURCE]: "#4ecdc4",
    [constants.actionTypes.TAKE_RESOURCE]: "#3da9fc",
    [constants.actionTypes.BUILD]: "#ff9f43",
    [constants.actionTypes.TAXI]: "#c77dff",
    [constants.actionTypes.TRANSFER_ENERGY]: "#58a6ff",
    [constants.actionTypes.UPGRADE_CONTROLLER]: "#7ddc84",
};

function log(message) {
    if (!Memory.debug) {
        return;
    }

    console.log(message);
}

function visuals() {
    if (!Memory.debug) {
        return;
    }

    const roomNames = Object.keys(Game.rooms);

    for (const roomName of roomNames) {
        const roomTasks = tasks.listTasks(roomName); 
        const lines = [];

        var limit = Memory.Checker.rooms[roomName].universalTargetCount; //

        lines.push(createLine(`🌐 ${roomName} Universals:${limit}`, "#ffffff", 0.58));
        lines.push(createLine(``, "#ffffff", 0.58));
        if (roomTasks.length === 0) {
            lines.push(createLine("· no active tasks", "#b8c0c7", 0.43));
        }
        else {
            for (let index = 0; index < roomTasks.length; index += 1) {
                pushTaskLines(lines, index, roomTasks[index]);
            }
        }

        const width = getPanelWidth(lines);
        const height = 0.45 + (lines.length * 0.58);
        const visual = new RoomVisual(roomName);

        visual.rect(0.2, 0.2, width, height, {
            fill: "#0f141b",
            opacity: 0.5,
            stroke: "#506070",
            strokeWidth: 0.05,
        });
        visual.rect(0.2, 0.2, width, 0.85, {
            fill: "#17212b",
            opacity: 0.92,
            stroke: "transparent",
        });
        visual.rect(0.2, 1.05, width, 0.08, {
            fill: "#2d3a46",
            opacity: 0.7,
            stroke: "transparent",
        });

        for (let index = 0; index < lines.length; index += 1) {
            visual.text(lines[index].text, 0.5, 0.72 + (index * 0.56), {
                align: "left",
                color: lines[index].color,
                font: lines[index].font,
            });
        }

        drawCreepActionLines(roomName, visual);
    }
}

function pushTaskLines(lines, index, task) {
    const taskColor = taskColors[task.type] || "#d7dbdd";
    const taskIcon = taskIcons[task.type] || "•";

    lines.push(
        createLine(
            `${taskIcon} ${index + 1}. ${getTaskLabel(task.type)} ${formatTaskProgress(task)}`,
            taskColor,
            0.44
        )
    );

    const assignments = getTaskAssignments(task);

    for (const assignment of assignments) {
        lines.push(createAssignmentLine(assignment));
    }
}

function createLine(text, color, font) {
    return {
        color: color,
        font: font,
        text: text,
    };
}

function createAssignmentLine(assignment) {
    const actionText = assignment.actions.map(function (actionType) {
        return `${actionIcons[actionType] || "•"} ${getActionLabel(actionType)}`;
    }).join("   ");

    return createLine(
        `  ▸ ${assignment.executorName}${actionText ? `   ${actionText}` : ""}`,
        "#c7d0d9",
        0.39
    );
}

function formatTaskProgress(task) {
    if (task.data.total > 0) {
        const doneAmount = (task.data.total * task.donePercent) / 100;

        return `(${formatAmount(doneAmount)} / ${formatAmount(task.data.total)}, ${formatPercent(task.donePercent)})`;
    }

    return `(${formatPercent(task.donePercent)})`;
}

function getTaskAssignments(task) {
    const actionsById = Memory.Dispatcher.actionsById;
    const byExecutor = {};
    const orderedExecutors = [];

    for (const actionId of task.actionIds) {
        const action = actionsById[actionId];

        if (!action || action.status === "done") {
            continue;
        }

        if (!byExecutor[action.executorName]) {
            byExecutor[action.executorName] = [];
            orderedExecutors.push(action.executorName);
        }

        byExecutor[action.executorName].push(action.type);
    }

    return orderedExecutors.map(function (executorName) {
        return {
            executorName: executorName,
            actions: byExecutor[executorName],
        };
    });
}

function getPanelWidth(lines) {
    let maxLength = 0;

    for (const line of lines) {
        maxLength = Math.max(maxLength, line.text.length);
    }

    return Math.max(16, Math.min(25, 1.5 + (maxLength * 0.24)));
}

function drawCreepActionLines(roomName, visual) {
    for (const creepName in Game.creeps) {
        const creep = Game.creeps[creepName];

        if (creep.pos.roomName !== roomName) {
            continue;
        }

        const action = getCurrentCreepAction(creep);

        if (!action) {
            continue;
        }

        const targetPosition = getActionTargetPosition(action, creep);

        if (!targetPosition || targetPosition.roomName !== roomName) {
            continue;
        }

        visual.line(creep.pos, targetPosition, {
            color: actionLineColors[action.type] || "#c7d0d9",
            lineStyle: "dashed",
            opacity: 0.6,
            width: 0.08,
        });

        visual.circle(targetPosition, {
            fill: "transparent",
            radius: 0.2,
            stroke: actionLineColors[action.type] || "#c7d0d9",
            strokeWidth: 0.08,
            opacity: 0.7,
        });
    }
}

function getCurrentCreepAction(creep) {
    if (!creep.memory.actionIds || creep.memory.actionIds.length === 0) {
        return null;
    }

    for (const actionId of creep.memory.actionIds) {
        const action = Memory.Dispatcher.actionsById[actionId];

        if (action && action.status !== "done") {
            return action;
        }
    }

    return null;
}

function getActionTargetPosition(action, creep) {
    if (
        action.type === constants.actionTypes.MINE ||
        action.type === constants.actionTypes.PICKUP_RESOURCE ||
        action.type === constants.actionTypes.TAKE_RESOURCE ||
        action.type === constants.actionTypes.BUILD ||
        action.type === constants.actionTypes.TRANSFER_ENERGY
    ) {
        return getObjectPosition(
            Game.getObjectById(
                action.data.sourceId ||
                action.data.pileId ||
                action.data.fromId ||
                action.data.targetId
            )
        );
    }

    if (action.type === constants.actionTypes.UPGRADE_CONTROLLER) {
        if (Game.rooms[action.room] && Game.rooms[action.room].controller) {
            return Game.rooms[action.room].controller.pos;
        }

        if (creep.room && creep.room.controller) {
            return creep.room.controller.pos;
        }
    }

    if (action.type === constants.actionTypes.TAXI) {
        return new RoomPosition(action.data.x, action.data.y, action.data.roomName);
    }

    return null;
}

function getObjectPosition(target) {
    if (!target) {
        return null;
    }

    return target.pos || null;
}

function getTaskLabel(taskType) {
    switch (taskType) {
    case constants.taskTypes.SPAWN_CREEP:
        return "spawn";
    case constants.taskTypes.CHECKER:
        return "checker";
    case constants.taskTypes.MINING_OPERATION:
        return "mining";
    case constants.taskTypes.SYNC_TOWERS:
        return "sync towers";
    case constants.taskTypes.SYNC_EXTENSIONS:
        return "sync ext";
    case constants.taskTypes.SYNC_FORTIFICATIONS:
        return "sync forts";
    case constants.taskTypes.UPGRADE_CONTROLLER:
        return "upgrade";
    case constants.taskTypes.FILL_SPAWN:
        return "fill spawn";
    case constants.taskTypes.FILL_EXTENSION:
        return "fill ext";
    case constants.taskTypes.FILL_TOWER:
        return "fill tower";
    case constants.taskTypes.BUILD:
        return "build";
    case constants.taskTypes.REPAIR:
        return "repair";
    default:
        return taskType;
    }
}

function getActionLabel(actionType) {
    switch (actionType) {
    case constants.actionTypes.SPAWN_CREEP:
        return "spawn";
    case constants.actionTypes.MINE:
        return "mine";
    case constants.actionTypes.PICKUP_RESOURCE:
        return "pickup";
    case constants.actionTypes.TAKE_RESOURCE:
        return "take";
    case constants.actionTypes.BUILD:
        return "build";
    case constants.actionTypes.TAXI:
        return "taxi";
    case constants.actionTypes.PLACE_CONSTRUCTION_SITE:
        return "site";
    case constants.actionTypes.TRANSFER_ENERGY:
        return "transfer";
    case constants.actionTypes.UPGRADE_CONTROLLER:
        return "upgrade";
    case constants.actionTypes.CHECK_UNIVERSALS:
        return "check uni";
    case constants.actionTypes.CHECK_FILL_SPAWN:
        return "check spawn";
    case constants.actionTypes.CHECK_FILL_EXTENSION:
        return "check ext";
    case constants.actionTypes.CHECK_FILL_TOWER:
        return "check tower";
    case constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT:
        return "recalc";
    case constants.actionTypes.SYNC_MINING_OPERATIONS:
        return "sync mine";
    case constants.actionTypes.SYNC_ROOM_BUILDER:
        return "sync build";
    default:
        return actionType;
    }
}

function formatAmount(value) {
    if (Math.abs(value - Math.round(value)) < 0.01) {
        return String(Math.round(value));
    }

    return value.toFixed(1);
}

function formatPercent(value) {
    if (Math.abs(value - Math.round(value)) < 0.01) {
        return `${Math.round(value)}%`;
    }

    return `${value.toFixed(1)}%`;
}

module.exports = {
    log,
    visuals,
};
