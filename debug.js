const tasks = require("./tasks");

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
        const lines = [`${roomName} tasks`];

        if (roomTasks.length === 0) {
            lines.push("empty");
        }
        else {
            for (let index = 0; index < roomTasks.length; index += 1) {
                pushTaskLines(lines, index, roomTasks[index]);
            }
        }

        const width = 16;
        const height = 0.6 + (lines.length * 0.6);
        const visual = new RoomVisual(roomName);

        visual.rect(0.2, 0.2, width, height, {
            fill: "#111111",
            opacity: 0.35,
            stroke: "#888888",
            strokeWidth: 0.05,
        });

        for (let index = 0; index < lines.length; index += 1) {
            visual.text(lines[index], 0.5, 0.7 + (index * 0.55), {
                align: "left",
                color: index === 0 ? "#ffffff" : "#d7dbdd",
                font: index === 0 ? 0.55 : 0.45,
            });
        }
    }
}

function pushTaskLines(lines, index, task) {
    lines.push(`${index + 1}. ${task.type} ${formatTaskProgress(task)}`);

    const assignments = getTaskAssignments(task);

    if (assignments.length === 0) {
        return;
    }

    for (const assignment of assignments) {
        lines.push(`- ${assignment.executorName}`);
        lines.push(`-- ${assignment.actions.join(", ")}`);
    }
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
