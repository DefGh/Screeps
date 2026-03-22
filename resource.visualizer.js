const resourceManager = require("./resource.manager");

const SQUARE_SIZE = 10;
const TEXT_X_PADDING = 0.45;
const TEXT_Y_PADDING = 0.75;
const TEXT_LINE_SPACING = 0.58;

const SQUARE_STYLE = {
    fill: "transparent",
    opacity: 0.25,
    stroke: "#65d46e",
    strokeWidth: 0.08,
};

const SUPPLY_TEXT_STYLE = {
    align: "left",
    backgroundColor: "#111111",
    backgroundPadding: 0.15,
    color: "#65d46e",
    font: 0.5,
    opacity: 0.85,
    stroke: "#111111",
    strokeWidth: 0.12,
};

const DEMAND_TEXT_STYLE = {
    align: "left",
    backgroundColor: "#111111",
    backgroundPadding: 0.15,
    color: "#ff2d2d",
    font: 0.5,
    opacity: 0.85,
    stroke: "#111111",
    strokeWidth: 0.12,
};

function drawManagedRoomsResourcePlans() {
    for (const roomName of getManagedRoomNames()) {
        const room = Game.rooms[roomName];

        if (!room) {
            continue;
        }

        drawRoomResourcePlan(room);
    }
}

function drawRoomResourcePlan(room) {
    if (!room || !room.visual) {
        return;
    }

    const plan = resourceManager.getRoomResourcePlan(room, RESOURCE_ENERGY);
    const squareGroups = buildSquareGroups(plan);

    for (const group of squareGroups) {
        drawSquareGroup(room.visual, group);
    }
}

function buildSquareGroups(plan) {
    const groupsByKey = {};

    for (const entry of plan) {
        if (!entry || !entry.object || !entry.object.pos) {
            continue;
        }

        const square = getSquare(entry.object.pos);
        const squareKey = buildSquareKey(square);

        if (!groupsByKey[squareKey]) {
            groupsByKey[squareKey] = createSquareGroup(square);
        }

        accumulateEntry(groupsByKey[squareKey], entry);
    }

    return Object.values(groupsByKey).sort(compareSquareGroups);
}

function createSquareGroup(square) {
    return {
        square: square,
        supply: createSummary(),
        demand: createSummary(),
    };
}

function createSummary() {
    return {
        free: 0,
        reserved: 0,
        total: 0,
        openEndedFree: false,
        openEndedTotal: false,
    };
}

function accumulateEntry(group, entry) {
    if (entry.role === "source" || entry.role === "both") {
        accumulateSupply(group.supply, entry);
    }

    if (entry.role === "target" || entry.role === "both") {
        accumulateDemand(group.demand, entry);
    }
}

function accumulateSupply(summary, entry) {
    summary.reserved += getFiniteAmount(entry.reservedOutgoing);

    if (entry.supplyMode === "openEnded") {
        summary.openEndedFree = true;
        summary.openEndedTotal = true;
        return;
    }

    summary.free += getFiniteAmount(entry.effectiveAvailable);
    summary.total += getFiniteAmount(entry.baseAvailable);
}

function accumulateDemand(summary, entry) {
    summary.reserved += getFiniteAmount(entry.reservedIncoming);

    if (entry.demandMode === "openEnded") {
        summary.openEndedFree = true;
        summary.openEndedTotal = true;
        return;
    }

    summary.free += getFiniteAmount(entry.effectiveDemand);
    summary.total += getFiniteAmount(entry.baseDemand);
}

function drawSquareGroup(visual, group) {
    drawSquareBox(visual, group.square);

    visual.text(
        buildSupplyLine(group.supply),
        group.square.contentLeft + TEXT_X_PADDING,
        group.square.contentTop + TEXT_Y_PADDING,
        SUPPLY_TEXT_STYLE
    );

    visual.text(
        buildDemandLine(group.demand),
        group.square.contentLeft + TEXT_X_PADDING,
        group.square.contentTop + TEXT_Y_PADDING + TEXT_LINE_SPACING,
        DEMAND_TEXT_STYLE
    );
}

function drawSquareBox(visual, square) {
    visual.rect(square.left, square.top, square.width, square.height, SQUARE_STYLE);
}

function buildSupplyLine(summary) {
    return `🟢 ${formatAmount(summary.free, summary.openEndedFree)}/${formatAmount(summary.reserved, false)}/${formatAmount(summary.total, summary.openEndedTotal)}`;
}

function buildDemandLine(summary) {
    return `🔴 ${formatAmount(summary.free, summary.openEndedFree)}/${formatAmount(summary.reserved, false)}/${formatAmount(summary.total, summary.openEndedTotal)}`;
}

function formatAmount(amount, isOpenEnded) {
    if (isOpenEnded) {
        return "*";
    }

    return String(Math.max(0, Math.round(amount)));
}

function getFiniteAmount(value) {
    return typeof value === "number" && isFinite(value) ? value : 0;
}

function getSquare(position) {
    const squareLeft = Math.floor(position.x / SQUARE_SIZE) * SQUARE_SIZE;
    const squareTop = Math.floor(position.y / SQUARE_SIZE) * SQUARE_SIZE;
    const squareWidth = Math.min(SQUARE_SIZE, 50 - squareLeft);
    const squareHeight = Math.min(SQUARE_SIZE, 50 - squareTop);

    return {
        left: squareLeft - 0.5,
        top: squareTop - 0.5,
        width: squareWidth,
        height: squareHeight,
        contentLeft: squareLeft,
        contentTop: squareTop,
    };
}

function buildSquareKey(square) {
    return `${square.left}:${square.top}`;
}

function compareSquareGroups(left, right) {
    if (left.square.top !== right.square.top) {
        return left.square.top - right.square.top;
    }

    return left.square.left - right.square.left;
}

function getManagedRoomNames() {
    const roomNames = {};

    for (const name in Game.spawns) {
        const spawn = Game.spawns[name];

        if (spawn && spawn.room) {
            roomNames[spawn.room.name] = true;
        }
    }

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];

        if (room.controller && room.controller.my) {
            roomNames[roomName] = true;
        }
    }

    return Object.keys(roomNames);
}

module.exports = {
    drawManagedRoomsResourcePlans,
    drawRoomResourcePlan,
};
