const constants = require("constants");
const taskManager = require("task.manager");

module.exports = {
    initializeRoom() {
        if (Memory.roomInitialized) {
            return;
        }

        const spawn = Game.spawns["Spawn1"];
        if (!spawn || !spawn.room) {
            return;
        }

        const room = spawn.room;

        // Подготовка служебной памяти
        Memory.minerPositions = {};
        Memory.sourceTasks = {};
        Memory.universals = 3;

        const sources = room.find(FIND_SOURCES);

        for (const source of sources) {
            // Пропускаем источник, если рядом враги
            if (this.hasEnemiesNearSource(source)) {
                continue;
            }

            // Рассчитать позицию для шахтера вдоль пути от спавна
            const position = this.calculateMinerPosition(source);
            if (!position) {
                continue;
            }

            Memory.minerPositions[source.id] = position;

            // Создать задачу на добычу для этого источника
            this.createMineTaskForSource(source.id, position);
        }

        Memory.roomInitialized = true;
    },

    calculateMinerPosition(source) {
        const spawn = Game.spawns["Spawn1"];
        if (!spawn) {
            return null;
        }

        // Ищем путь от спавна до источника с помощью PathFinder
        const result = PathFinder.search(spawn.pos, { pos: source.pos, range: 1 }, {
            plainCost: 1,
            swampCost: 5,
            maxOps: 1000,
            roomCallback(roomName) {
                const room = Game.rooms[roomName];
                if (!room) {
                    return false;
                }

                const costs = new PathFinder.CostMatrix();

                // Игнорируем крипов и разрушаемые сооружения
                room.find(FIND_CREEPS).forEach((creep) => {
                    costs.set(creep.pos.x, creep.pos.y, 0xff);
                });

                room.find(FIND_STRUCTURES, {
                    filter: (structure) =>
                        structure.structureType !== STRUCTURE_ROAD &&
                        structure.structureType !== STRUCTURE_CONTAINER &&
                        structure.structureType !== STRUCTURE_RAMPART,
                }).forEach((structure) => {
                    costs.set(structure.pos.x, structure.pos.y, 0xff);
                });

                return costs;
            },
        });

        if (result.incomplete || result.path.length === 0) {
            return null;
        }

        // Берем последнюю точку пути (ближайшую к источнику)
        const lastPoint = result.path[result.path.length - 1];

        // Проверяем, что позиция позволяет добывать энергию из источника
        const range = source.pos.getRangeTo(lastPoint.x, lastPoint.y);
        if (range > 3) {
            return null;
        }

        // Проверяем, что позиция в пределах комнаты и не на стене
        if (
            lastPoint.x < 0 ||
            lastPoint.x > 49 ||
            lastPoint.y < 0 ||
            lastPoint.y > 49
        ) {
            return null;
        }

        const terrain = source.room.getTerrain().get(lastPoint.x, lastPoint.y);
        if (terrain === TERRAIN_MASK_WALL) {
            return null;
        }

        return {
            x: lastPoint.x,
            y: lastPoint.y,
            roomName: source.pos.roomName,
        };
    },

    createMineTaskForSource(sourceId, position) {
        const id = "mine_" + sourceId;

        const taskData = {
            id,
            type: constants.taskTypes.MINE,
            canExecute: [constants.roles.MINER],
            repeatable: true,
            maxExecuters: 1,
            priority: 5,
            data: {
                sourceId,
                position,
            },
        };

        const success = taskManager.tryAddTask(taskData, id);
        if (success) {
            Memory.sourceTasks[sourceId] = true;
        }
    },

    hasEnemiesNearSource(source) {
        const hostileCreeps = source.pos.findInRange(FIND_HOSTILE_CREEPS, 15);
        const hostileStructures = source.pos.findInRange(
            FIND_HOSTILE_STRUCTURES,
            15
        );

        return hostileCreeps.length > 0 || hostileStructures.length > 0;
    },
};