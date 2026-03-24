const constructionManager = require("./construction.manager");
const roomScope = require("./room.scope");
const resourceManager = require("./resource.manager");

const SQUARE_SIZE = 5;
const TEXT_X_PADDING = 0.45;
const TEXT_Y_PADDING = 0.75;
const TEXT_LINE_SPACING = 0.58;
const SHOW_ROAD_HEAT_MAP = false;
const SHOW_REPAIR_HEAT_MAP = true;
const SHOW_RECOURCE_INFO = true;

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

const ROAD_HEAT_STYLE = {
    stroke: "transparent",
};

const HOT_ROAD_STYLE = {
    fill: "transparent",
    opacity: 0.9,
    stroke: "#fff1b8",
    strokeWidth: 0.08,
};

const HOTTEST_ROAD_STYLE = {
    fill: "transparent",
    opacity: 1,
    stroke: "#ffffff",
    strokeWidth: 0.12,
};

const ROAD_HEAT_TEXT_STYLE = {
    align: "center",
    color: "#fff7d6",
    font: 0.33,
    opacity: 0.9,
    stroke: "#111111",
    strokeWidth: 0.12,
};

const REPAIR_HEAT_STYLE = {
    stroke: "transparent",
};

const REPAIR_HEAT_TEXT_STYLE = {
    align: "center",
    color: "#ffffff",
    font: 0.28,
    opacity: 0.92,
    stroke: "#111111",
    strokeWidth: 0.12,
};

function drawManagedRoomsResourcePlans() {

    for (const roomName of roomScope.getOperationalRoomNames()) {
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
    drawRoomRoadHeat(room);
    drawRoomRepairHeat(room);

    if (!SHOW_RECOURCE_INFO) {
        return;
    }
    const plan = resourceManager.getRoomResourcePlan(room, RESOURCE_ENERGY);
    const squareGroups = buildSquareGroups(plan);

    for (const group of squareGroups) {
        drawSquareGroup(room.visual, group);
    }

}

function drawRoomRoadHeat(room) {
    if (!SHOW_ROAD_HEAT_MAP) {
        return;
    }

    const overlay = constructionManager.getRoadHeatOverlay(room);

    if (!overlay || !overlay.candidates || overlay.candidates.length === 0) {
        return;
    }

    const maxCount = getMaxRoadHeatCount(overlay.candidates);
    const hottestCandidate = getHottestRoadCandidate(overlay);

    for (const candidate of overlay.candidates) {
        drawRoadHeatCell(room.visual, candidate, overlay.minVisits, maxCount, hottestCandidate);
    }
}

function drawRoomRepairHeat(room) {
    if (!SHOW_REPAIR_HEAT_MAP) {
        return;
    }

    const overlay = constructionManager.getRepairHeatOverlay(room);

    if (!overlay || !overlay.candidates || overlay.candidates.length === 0) {
        return;
    }

    for (const candidate of overlay.candidates) {
        drawRepairHeatCell(room.visual, candidate);
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

function drawRoadHeatCell(visual, candidate, minVisits, maxCount, hottestCandidate) {
    const fillRatio = getRoadHeatRatio(candidate.count, minVisits, maxCount);
    const baseStyle = Object.assign({}, ROAD_HEAT_STYLE, {
        fill: getRoadHeatColor(fillRatio, candidate.count >= minVisits),
        opacity: getRoadHeatOpacity(fillRatio, candidate.count >= minVisits),
    });

    visual.rect(
        candidate.position.x - 0.5,
        candidate.position.y - 0.5,
        1,
        1,
        baseStyle
    );

    if (candidate.count >= minVisits) {
        visual.rect(
            candidate.position.x - 0.5,
            candidate.position.y - 0.5,
            1,
            1,
            candidate === hottestCandidate ? HOTTEST_ROAD_STYLE : HOT_ROAD_STYLE
        );

        visual.text(
            String(Math.round(candidate.count)),
            candidate.position.x,
            candidate.position.y + 0.12,
            ROAD_HEAT_TEXT_STYLE
        );
    }
}

function drawRepairHeatCell(visual, candidate) {
    const integrityRatio = getNormalizedRepairIntegrityRatio(candidate);

    visual.rect(
        candidate.position.x - 0.5,
        candidate.position.y - 0.5,
        1,
        1,
        Object.assign({}, REPAIR_HEAT_STYLE, {
            fill: getRepairHeatColor(integrityRatio),
            opacity: getRepairHeatOpacity(integrityRatio),
        })
    );

    visual.text(
        `${Math.round(integrityRatio * 100)}%`,
        candidate.position.x,
        candidate.position.y + 0.12,
        REPAIR_HEAT_TEXT_STYLE
    );
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

function getMaxRoadHeatCount(candidates) {
    let maxCount = 0;

    for (const candidate of candidates) {
        if (candidate && typeof candidate.count === "number" && candidate.count > maxCount) {
            maxCount = candidate.count;
        }
    }

    return maxCount;
}

function getHottestRoadCandidate(overlay) {
    if (!overlay || !overlay.candidates || overlay.candidates.length === 0) {
        return null;
    }

    if (overlay.candidates[0].count < overlay.minVisits) {
        return null;
    }

    return overlay.candidates[0];
}

function getRoadHeatRatio(count, minVisits, maxCount) {
    if (typeof count !== "number" || count <= 0) {
        return 0;
    }

    if (typeof maxCount !== "number" || maxCount <= 0) {
        return 0;
    }

    if (count >= minVisits && maxCount > minVisits) {
        return 0.65 + 0.35 * Math.min(1, (count - minVisits) / (maxCount - minVisits));
    }

    return 0.2 + 0.45 * Math.min(1, count / Math.max(1, minVisits));
}

function getRoadHeatColor(ratio, isHot) {
    if (isHot) {
        return interpolateHexColor("#ffb347", "#ff4d4d", ratio);
    }

    return interpolateHexColor("#16324f", "#4ea5d9", ratio);
}

function getRoadHeatOpacity(ratio, isHot) {
    const baseOpacity = isHot ? 0.3 : 0.14;
    const variableOpacity = isHot ? 0.4 : 0.28;
    return Math.min(0.9, baseOpacity + variableOpacity * Math.max(0, Math.min(1, ratio)));
}

function getNormalizedRepairIntegrityRatio(candidate) {
    if (!candidate || typeof candidate.integrityRatio !== "number") {
        return 0;
    }

    return Math.max(0, Math.min(1, candidate.integrityRatio));
}

function getRepairHeatColor(integrityRatio) {
    return interpolateHexColor("#ff3b30", "#ffd166", integrityRatio);
}

function getRepairHeatOpacity(integrityRatio) {
    return 0.2 + 0.45 * (1 - integrityRatio);
}

function interpolateHexColor(startHex, endHex, ratio) {
    const start = parseHexColor(startHex);
    const end = parseHexColor(endHex);
    const normalizedRatio = Math.max(0, Math.min(1, ratio));

    return (
        "#" +
        toHexChannel(start.r + (end.r - start.r) * normalizedRatio) +
        toHexChannel(start.g + (end.g - start.g) * normalizedRatio) +
        toHexChannel(start.b + (end.b - start.b) * normalizedRatio)
    );
}

function parseHexColor(color) {
    return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16),
    };
}

function toHexChannel(value) {
    const normalizedValue = Math.max(0, Math.min(255, Math.round(value)));
    return normalizedValue.toString(16).padStart(2, "0");
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

module.exports = {
    drawManagedRoomsResourcePlans,
    drawRoomResourcePlan,
};
