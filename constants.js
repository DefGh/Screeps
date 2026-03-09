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
    
    // Приоритеты задач
    taskPriorities: {
        SPAWN_CREEP: 10,
        TRANSFER_ENERGY: 1,
        CONSTRUCT: 2
    },
    
    // Статусы задач
    taskStatuses: {
        PENDING: 'pending',
        IN_PROGRESS: 'inProgress',
        DONE: 'done',
    }
};