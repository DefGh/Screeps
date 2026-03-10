module.exports = {
    // Константы частей тела и их стоимости
    BodyParts: {
        MOVE: {cost: 50, part: MOVE},
        WORK: { cost: 100, part: WORK} ,
        CARRY: { cost: 50, part: CARRY} ,
        ATTACK: { cost: 80, part: ATTACK} ,
        RANGED_ATTACK: { cost: 150, part: RANGED_ATTACK} ,
        HEAL: { cost: 250, part: HEAL} ,
        TOUGH: { cost: 10, part: TOUGH} ,
        CLAIM: { cost: 600, part: CLAIM} 
    },
    
    // Роли крипов
    roles: {
        UNIVERSAL: 'universal',
        SPAWNER: 'spawner',
        MINER: 'miner',
    },
    
    // Типы задач
    taskTypes: {
        SPAWN_CREEP: 'spawnCreep',
        TRANSFER_ENERGY: 'transferEnergy',
        TAXI: 'taxi',
        MINE: 'mine',
        CONSTRUCT: 'construct'
    },
    
    // Типы построек
    constructionTypes: {
        ROAD: STRUCTURE_ROAD,
        EXTENSION: STRUCTURE_EXTENSION,
        CONTAINER: STRUCTURE_CONTAINER
    },
    
    // Приоритеты задач (1 = highest priority, 999 = lowest priority)
    taskPriorities: {
        SPAWN_CREEP: 1,      // Highest priority - essential for survival
        CONSTRUCT: 2,        // High priority - building infrastructure
        TAXI: 5,             // Medium priority - resource transport
        TRANSFER_ENERGY: 999 // Lowest priority - can wait
    },
    
    // Статусы задач
    taskStatuses: {
        PENDING: 'pending',
        IN_PROGRESS: 'inProgress',
        DONE: 'done',
    },

    energySourceType: {
        pile: 'pile',
        container: 'container',
        source: 'source'
    }
};