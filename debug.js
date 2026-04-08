const constants = require("./constants");
const checker = require("./checker");
const tasks = require("./tasks");

const taskIcons = {
    [constants.taskTypes.SPAWN_CREEP]: "🐣",
    [constants.taskTypes.CHECKER]: "🧭",
    [constants.taskTypes.EXPANSION]: "🚩",
    [constants.taskTypes.LONG_RANGE_MINING]: "🚚",
    [constants.taskTypes.MINING_OPERATION]: "⛏️",
    [constants.taskTypes.TOWER_OPERATION]: "🛡️",
    [constants.taskTypes.SYNC_TOWERS]: "🗼",
    [constants.taskTypes.SYNC_EXTENSIONS]: "🔋",
    [constants.taskTypes.SYNC_ROADS]: "🛣️",
    [constants.taskTypes.SYNC_FORTIFICATIONS]: "🧱",
    [constants.taskTypes.UPGRADE_CONTROLLER]: "⬆️",
    [constants.taskTypes.FILL_ENERGY]: "⚡",
    [constants.taskTypes.FILL_SPAWN]: "⚡",
    [constants.taskTypes.FILL_EXTENSION]: "🔌",
    [constants.taskTypes.FILL_TOWER]: "🛡️",
    [constants.taskTypes.BUILD]: "🏗️",
    [constants.taskTypes.REPAIR]: "🩹",
    [constants.taskTypes.RENEW_HAULER]: "♻️",
    [constants.taskTypes.RENEW_UNIVERSAL]: "♻️",
};

const actionIcons = {
    [constants.actionTypes.SPAWN_CREEP]: "🐣",
    [constants.actionTypes.MINE]: "⛏️",
    [constants.actionTypes.PICKUP_RESOURCE]: "🫳",
    [constants.actionTypes.TAKE_RESOURCE]: "📦",
    [constants.actionTypes.BUILD]: "🏗️",
    [constants.actionTypes.MOVE_TO_RENEW]: "↩️",
    [constants.actionTypes.REPAIR]: "🩹",
    [constants.actionTypes.RENEW_CREEP]: "♻️",
    [constants.actionTypes.GO_TO_TARGET]: "🎯",
    [constants.actionTypes.SCOUT_ROOM]: "👁️",
    [constants.actionTypes.SCOUT_OUTPOST_ROOM]: "👁️",
    [constants.actionTypes.CLAIM_CONTROLLER]: "🏳️",
    [constants.actionTypes.RETIRE_CREEP]: "☠️",
    [constants.actionTypes.TAXI]: "🚕",
    [constants.actionTypes.TOWER_ATTACK]: "🎯",
    [constants.actionTypes.TOWER_REPAIR]: "🔧",
    [constants.actionTypes.TOWER_HEAL]: "💚",
    [constants.actionTypes.PLACE_CONSTRUCTION_SITE]: "📍",
    [constants.actionTypes.TRANSFER_ENERGY]: "🔋",
    [constants.actionTypes.UPGRADE_CONTROLLER]: "⬆️",
    [constants.actionTypes.CHECK_UNIVERSALS]: "👥",
    [constants.actionTypes.CHECK_UNIVERSAL_RENEW]: "♻️",
    [constants.actionTypes.CHECK_FILL_ENERGY]: "⚡",
    [constants.actionTypes.CHECK_FILL_SPAWN]: "⚡",
    [constants.actionTypes.CHECK_FILL_EXTENSION]: "🔌",
    [constants.actionTypes.CHECK_FILL_TOWER]: "🛡️",
    [constants.actionTypes.CHECK_EXPANSION]: "🚩",
    [constants.actionTypes.CHECK_LONG_RANGE_MINING]: "🚚",
    [constants.actionTypes.CHECK_UPGRADE_CONTROLLER]: "⬆️",
    [constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT]: "📈",
    [constants.actionTypes.SYNC_MINING_OPERATIONS]: "⛏️",
    [constants.actionTypes.SYNC_ROOM_BUILDER]: "🏗️",
    [constants.actionTypes.SYNC_TOWER_OPERATIONS]: "🛡️",
};

const taskColors = {
    [constants.taskTypes.SPAWN_CREEP]: "#f5c542",
    [constants.taskTypes.CHECKER]: "#9aa0a6",
    [constants.taskTypes.EXPANSION]: "#f78c6c",
    [constants.taskTypes.LONG_RANGE_MINING]: "#8ecae6",
    [constants.taskTypes.MINING_OPERATION]: "#d9822b",
    [constants.taskTypes.TOWER_OPERATION]: "#7dd3fc",
    [constants.taskTypes.SYNC_TOWERS]: "#ff8c42",
    [constants.taskTypes.SYNC_EXTENSIONS]: "#ffd166",
    [constants.taskTypes.SYNC_ROADS]: "#c0c7d1",
    [constants.taskTypes.SYNC_FORTIFICATIONS]: "#c77dff",
    [constants.taskTypes.UPGRADE_CONTROLLER]: "#7ddc84",
    [constants.taskTypes.FILL_ENERGY]: "#58a6ff",
    [constants.taskTypes.FILL_SPAWN]: "#58a6ff",
    [constants.taskTypes.FILL_EXTENSION]: "#58a6ff",
    [constants.taskTypes.FILL_TOWER]: "#58a6ff",
    [constants.taskTypes.BUILD]: "#ff9f43",
    [constants.taskTypes.REPAIR]: "#ff6b6b",
    [constants.taskTypes.RENEW_HAULER]: "#9ef01a",
    [constants.taskTypes.RENEW_UNIVERSAL]: "#9ef01a",
};

const actionLineColors = {
    [constants.actionTypes.MINE]: "#d9822b",
    [constants.actionTypes.PICKUP_RESOURCE]: "#4ecdc4",
    [constants.actionTypes.TAKE_RESOURCE]: "#3da9fc",
    [constants.actionTypes.BUILD]: "#ff9f43",
    [constants.actionTypes.MOVE_TO_RENEW]: "#9ef01a",
    [constants.actionTypes.REPAIR]: "#ff6b6b",
    [constants.actionTypes.RENEW_CREEP]: "#9ef01a",
    [constants.actionTypes.GO_TO_TARGET]: "#ffd166",
    [constants.actionTypes.SCOUT_ROOM]: "#f78c6c",
    [constants.actionTypes.SCOUT_OUTPOST_ROOM]: "#8ecae6",
    [constants.actionTypes.CLAIM_CONTROLLER]: "#f78c6c",
    [constants.actionTypes.TAXI]: "#c77dff",
    [constants.actionTypes.TRANSFER_ENERGY]: "#58a6ff",
    [constants.actionTypes.UPGRADE_CONTROLLER]: "#7ddc84",
};

const PANEL_DEFAULT_X = 0.2;
const PANEL_DEFAULT_Y = 0.2;
const PANEL_OFFSET_X = 1;
const PANEL_OFFSET_Y = 0.6;
const PANEL_PADDING_RIGHT = 0.2;
const PANEL_PADDING_BOTTOM = 0.2;
const ENERGY_SNAPSHOT_INTERVAL = 50;

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

    drawEnemyDistanceHeatmap();

    const roomNames = Object.keys(Game.rooms).filter(function (roomName) {
        return isOwnedRoom(Game.rooms[roomName]);
    });

    for (const roomName of roomNames) {
        const room = Game.rooms[roomName];
        const roomTasks = tasks.listTasks(roomName); 
        const lines = [];
        const roomState = checker.getRoomState(roomName);
        const limit = roomState.universalTargetCount;
        const energyStats = getEnergyStats(room, roomState);

        lines.push(createLine(createRoomHeader(room, limit), "#ffffff", 0.58));
        lines.push(createEnergyLine(energyStats));
        lines.push(createLine("", "#ffffff", 0.58));
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
        const origin = getPanelOrigin(roomName, width, height);

        visual.rect(origin.x, origin.y -.2 , width, height , {
            fill: "#0f141b",
            opacity: 0.5,
            stroke: "#506070",
            strokeWidth: 0.05,
        });
        visual.rect(origin.x, origin.y, width, 1.35, {
            fill: "#17212b",
            opacity: 0.92,
            stroke: "transparent",
        });
        visual.rect(origin.x, origin.y + 1.35, width, 0.08, {
            fill: "#2d3a46",
            opacity: 0.7,
            stroke: "transparent",
        });

        for (let index = 0; index < lines.length; index += 1) {
            visual.text(lines[index].text, origin.x + 0.3, origin.y + 0.52 + (index * 0.56), {
                align: "left",
                color: lines[index].color,
                font: lines[index].font,
            });
        }

        drawCreepActionLines(roomName, visual);
    }
}

function isOwnedRoom(room) {
    return !!(
        room &&
        room.controller &&
        room.controller.my
    );
}

function drawEnemyDistanceHeatmap() {
    if (!Game.map || !Game.map.visual) {
        return;
    }

    const heatmap = require("./expansion").getEnemyDistanceHeatmap();
    const roomNames = Object.keys(heatmap.scoutedRooms || {});

    if (roomNames.length === 0) {
        return;
    }

    for (const roomName of roomNames) {
        drawEnemyDistanceRoomTile(
            Game.map.visual,
            roomName,
            heatmap.scoutedRooms[roomName],
            heatmap.distances[roomName],
            heatmap.maxDistance
        );
    }
}

function drawEnemyDistanceRoomTile(visual, roomName, roomState, distance, maxDistance) {
    const fill = getEnemyDistanceFill(distance, maxDistance);
    const stroke = getEnemyDistanceStroke(roomState, distance);
    const distanceLabel = getEnemyDistanceDistanceLabel(distance);
    const statusLabel = getEnemyDistanceStatusLabel(roomState);

    visual.rect(new RoomPosition(0, 0, roomName), 50, 50, {
        fill: fill,
        opacity: 0.28,
        stroke: stroke,
        strokeWidth: 1.5,
    });
    visual.text(distanceLabel, new RoomPosition(25, 24, roomName), {
        align: "center",
        backgroundColor: "#0f141b",
        backgroundPadding: 1.2,
        color: "#f3f5f7",
        fontFamily: "monospace",
        fontSize: 18,
        opacity: 1,
        stroke: "#0f141b",
        strokeWidth: 0.8,
    });

    if (statusLabel) {
        visual.text(statusLabel, new RoomPosition(25, 34, roomName), {
            align: "center",
            backgroundColor: "#0f141b",
            backgroundPadding: 0.6,
            color: "#dbe4ea",
            fontFamily: "monospace",
            fontSize: 7,
            opacity: 0.9,
            stroke: "#0f141b",
            strokeWidth: 0.45,
        });
    }
}

function getEnemyDistanceFill(distance, maxDistance) {
    if (!Number.isFinite(distance)) {
        return "#334155";
    }

    const safeMaxDistance = Math.max(1, maxDistance);
    const normalized = clamp(distance / safeMaxDistance, 0, 1);
    const hue = Math.round(120 * normalized);

    return `hsl(${hue}, 75%, 45%)`;
}

function getEnemyDistanceStroke(roomState, distance) {
    if (roomState && roomState.status === "enemy") {
        return "#ef4444";
    }

    if (!Number.isFinite(distance)) {
        return "#64748b";
    }

    return "#e5e7eb";
}

function getEnemyDistanceDistanceLabel(distance) {
    if (!Number.isFinite(distance)) {
        return "·";
    }

    return String(distance);
}

function getEnemyDistanceStatusLabel(roomState) {
    if (!roomState || !roomState.status) {
        return "";
    }

    if (roomState.status === "enemy") {
        return "EN";
    }

    if (roomState.status === "owned") {
        return "OWN";
    }

    if (roomState.status === "candidate") {
        return "CAN";
    }

    if (roomState.status === "transit") {
        return "TR";
    }

    return String(roomState.status).slice(0, 3).toUpperCase();
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

function createRoomHeader(room, universalLimit) {
    const rcl = room && room.controller ? room.controller.level : "-";
    const gcl = Game.gcl ? Game.gcl.level : "-";

    return `🌐 ${room.name} U:${universalLimit} RCL:${rcl} GCL:${gcl}`;
}

function createEnergyLine(energyStats) {
    const arrow = getEnergyArrow(energyStats.delta);
    const deltaText = formatSignedAmount(energyStats.delta);

    return createLine(
        `⚡ energy ${formatAmount(energyStats.previousAmount)} ${arrow} ${formatAmount(energyStats.currentAmount)} (${deltaText}, ${energyStats.age}t)`,
        getEnergyDeltaColor(energyStats.delta),
        0.44
    );
}

function formatTaskProgress(task) {
    if (task.data.total > 0) {
        const doneAmount = (task.data.total * task.donePercent) / 100;

        return `(${formatAmount(doneAmount)} / ${formatAmount(task.data.total)} / ${formatAmount((task.assignedPercent / 100) * task.data.total)} / ${formatPercent(task.donePercent)})`;
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

    return Math.max(10, Math.min(20, 1.2 + (maxLength * 0.2)));
}

function getEnergyStats(room, roomState) {
    const currentAmount = checker.getRoomEnergyBuffer(room);
    const snapshot = getEnergySnapshot(roomState, currentAmount);

    return {
        age: Math.max(0, Game.time - snapshot.tick),
        currentAmount: currentAmount,
        delta: currentAmount - snapshot.amount,
        previousAmount: snapshot.amount,
    };
}

function getEnergySnapshot(roomState, currentAmount) {
    if (!roomState.energySnapshot) {
        roomState.energySnapshot = {
            amount: currentAmount,
            tick: Game.time,
        };
    }
    else if (Game.time - roomState.energySnapshot.tick >= ENERGY_SNAPSHOT_INTERVAL) {
        roomState.energySnapshot = {
            amount: currentAmount,
            tick: Game.time,
        };
    }

    return roomState.energySnapshot;
}

function getPanelOrigin(roomName, width, height) {
    const anchor = getPanelAnchor(roomName);
    const x = anchor.x + PANEL_OFFSET_X;
    const y = anchor.y + PANEL_OFFSET_Y;

    return {
        x: clamp(x, PANEL_DEFAULT_X, 50 - width - PANEL_PADDING_RIGHT),
        y: clamp(y, PANEL_DEFAULT_Y, 50 - height - PANEL_PADDING_BOTTOM),
    };
}

function getPanelAnchor(roomName) {
    const flag = getPanelFlag(roomName);

    if (flag) {
        return {
            x: flag.pos.x,
            y: flag.pos.y,
        };
    }

    return {
        x: PANEL_DEFAULT_X,
        y: PANEL_DEFAULT_Y,
    };
}

function getPanelFlag(roomName) {
    const flags = [];

    for (const flagName in Game.flags) {
        const flag = Game.flags[flagName];

        if (flag.pos.roomName === roomName) {
            flags.push(flag);
        }
    }

    flags.sort(function (left, right) {
        return left.name.localeCompare(right.name);
    });

    return flags[0] || null;
}

function clamp(value, min, max) {
    if (max < min) {
        return min;
    }

    return Math.max(min, Math.min(max, value));
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
        action.type === constants.actionTypes.REPAIR ||
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

    if (action.type === constants.actionTypes.GO_TO_TARGET) {
        return new RoomPosition(
            action.data.x,
            action.data.y,
            action.data.roomName
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

    if (
        action.type === constants.actionTypes.SCOUT_ROOM ||
        action.type === constants.actionTypes.SCOUT_OUTPOST_ROOM
    ) {
        return new RoomPosition(25, 25, action.data.roomName);
    }

    if (action.type === constants.actionTypes.CLAIM_CONTROLLER) {
        if (Game.rooms[action.data.roomName] && Game.rooms[action.data.roomName].controller) {
            return Game.rooms[action.data.roomName].controller.pos;
        }

        return new RoomPosition(25, 25, action.data.roomName);
    }

    if (action.type === constants.actionTypes.PLACE_CONSTRUCTION_SITE) {
        return new RoomPosition(
            action.data.x,
            action.data.y,
            action.data.roomName || action.room
        );
    }

    if (action.type === constants.actionTypes.MOVE_TO_RENEW) {
        const spawn = Game.spawns[action.data.spawnName];

        return getObjectPosition(spawn);
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
    case constants.taskTypes.EXPANSION:
        return "expansion";
    case constants.taskTypes.LONG_RANGE_MINING:
        return "long range";
    case constants.taskTypes.MINING_OPERATION:
        return "mining";
    case constants.taskTypes.TOWER_OPERATION:
        return "tower op";
    case constants.taskTypes.SYNC_TOWERS:
        return "sync towers";
    case constants.taskTypes.SYNC_EXTENSIONS:
        return "sync ext";
    case constants.taskTypes.SYNC_ROADS:
        return "sync roads";
    case constants.taskTypes.SYNC_FORTIFICATIONS:
        return "sync forts";
    case constants.taskTypes.UPGRADE_CONTROLLER:
        return "upgrade";
    case constants.taskTypes.FILL_ENERGY:
        return "fill energy";
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
    case constants.taskTypes.RENEW_HAULER:
        return "renew hauler";
    case constants.taskTypes.RENEW_UNIVERSAL:
        return "renew";
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
    case constants.actionTypes.ATTACK_TARGET:
        return "attack";
    case constants.actionTypes.HEAL_TARGET:
        return "heal";
    case constants.actionTypes.DISMANTLE_TARGET:
        return "dismantle";
    case constants.actionTypes.ATTACK_CONTROLLER:
        return "atk ctrl";
    case constants.actionTypes.BUILD:
        return "build";
    case constants.actionTypes.MOVE_TO_RENEW:
        return "move renew";
    case constants.actionTypes.REPAIR:
        return "repair";
    case constants.actionTypes.RENEW_CREEP:
        return "renew";
    case constants.actionTypes.GO_TO_TARGET:
        return "move";
    case constants.actionTypes.SCOUT_ROOM:
        return "scout";
    case constants.actionTypes.SCOUT_OUTPOST_ROOM:
        return "outpost";
    case constants.actionTypes.CLAIM_CONTROLLER:
        return "claim";
    case constants.actionTypes.RETIRE_CREEP:
        return "retire";
    case constants.actionTypes.TAXI:
        return "taxi";
    case constants.actionTypes.TOWER_ATTACK:
        return "attack";
    case constants.actionTypes.TOWER_REPAIR:
        return "repair";
    case constants.actionTypes.TOWER_HEAL:
        return "heal";
    case constants.actionTypes.PLACE_CONSTRUCTION_SITE:
        return "site";
    case constants.actionTypes.TRANSFER_ENERGY:
        return "transfer";
    case constants.actionTypes.UPGRADE_CONTROLLER:
        return "upgrade";
    case constants.actionTypes.CHECK_UNIVERSALS:
        return "check uni";
    case constants.actionTypes.CHECK_UNIVERSAL_RENEW:
        return "check renew";
    case constants.actionTypes.CHECK_FILL_ENERGY:
        return "check energy";
    case constants.actionTypes.CHECK_FILL_SPAWN:
        return "check spawn";
    case constants.actionTypes.CHECK_FILL_EXTENSION:
        return "check ext";
    case constants.actionTypes.CHECK_FILL_TOWER:
        return "check tower";
    case constants.actionTypes.CHECK_EXPANSION:
        return "check exp";
    case constants.actionTypes.CHECK_LONG_RANGE_MINING:
        return "check lrm";
    case constants.actionTypes.CHECK_UPGRADE_CONTROLLER:
        return "check upg";
    case constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT:
        return "recalc";
    case constants.actionTypes.SYNC_MINING_OPERATIONS:
        return "sync mine";
    case constants.actionTypes.SYNC_ROOM_BUILDER:
        return "sync build";
    case constants.actionTypes.SYNC_TOWER_OPERATIONS:
        return "sync tower";
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

function formatSignedAmount(value) {
    if (value > 0) {
        return `+${formatAmount(value)}`;
    }

    return formatAmount(value);
}

function getEnergyArrow(delta) {
    if (delta > 0) {
        return "↑";
    }

    if (delta < 0) {
        return "↓";
    }

    return "→";
}

function getEnergyDeltaColor(delta) {
    if (delta > 0) {
        return "#7ddc84";
    }

    if (delta < 0) {
        return "#ff6b6b";
    }

    return "#b8c0c7";
}

module.exports = {
    log,
    visuals,
};
