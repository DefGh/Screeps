module.exports = {
    // Константы частей тела и их стоимости
    BodyPartCosts: {
        MOVE: 50,
        WORK: 100,
        CARRY: 50,
        ATTACK: 80,
        RANGED_ATTACK: 150,
        HEAL: 250,
        TOUGH: 10,
        CLAIM: 600
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
    },
    
    // Приоритеты задач
    taskPriorities: {
        SPAWN_CREEP: 10,
        TRANSFER_ENERGY: 1,
    },
    
    // Статусы задач
    taskStatuses: {
        PENDING: 'pending',
        IN_PROGRESS: 'inProgress',
        DONE: 'done',
    }
};
