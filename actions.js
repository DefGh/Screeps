const constants = require("./constants");
const spawnCreepAction = require("./action.spawn_creep");
const mineAction = require("./action.mine");
const pickupResourceAction = require("./action.pickup_resource");
const takeResourceAction = require("./action.take_resource");
const buildAction = require("./action.build");
const repairAction = require("./action.repair");
const taxiAction = require("./action.taxi");
const towerAttackAction = require("./action.tower_attack");
const towerRepairAction = require("./action.tower_repair");
const towerHealAction = require("./action.tower_heal");
const placeConstructionSiteAction = require("./action.place_construction_site");
const transferEnergyAction = require("./action.transfer_energy");
const upgradeControllerAction = require("./action.upgrade_controller");
const checkUniversalsAction = require("./action.check_universals");
const checkFillEnergyAction = require("./action.check_fill_energy");
const checkFillSpawnAction = require("./action.check_fill_spawn");
const checkFillExtensionAction = require("./action.check_fill_extension");
const checkFillTowerAction = require("./action.check_fill_tower");
const checkUpgradeControllerAction = require("./action.check_upgrade_controller");
const recalculateUniversalsCountAction = require("./action.recalculate_universals_count");
const syncMiningOperationsAction = require("./action.sync_mining_operations");
const syncRoomBuilderAction = require("./action.sync_room_builder");
const syncTowerOperationsAction = require("./action.sync_tower_operations");

const handlers = {
    [constants.actionTypes.SPAWN_CREEP]: spawnCreepAction,
    [constants.actionTypes.MINE]: mineAction,
    [constants.actionTypes.PICKUP_RESOURCE]: pickupResourceAction,
    [constants.actionTypes.TAKE_RESOURCE]: takeResourceAction,
    [constants.actionTypes.BUILD]: buildAction,
    [constants.actionTypes.REPAIR]: repairAction,
    [constants.actionTypes.TAXI]: taxiAction,
    [constants.actionTypes.TOWER_ATTACK]: towerAttackAction,
    [constants.actionTypes.TOWER_REPAIR]: towerRepairAction,
    [constants.actionTypes.TOWER_HEAL]: towerHealAction,
    [constants.actionTypes.PLACE_CONSTRUCTION_SITE]: placeConstructionSiteAction,
    [constants.actionTypes.TRANSFER_ENERGY]: transferEnergyAction,
    [constants.actionTypes.UPGRADE_CONTROLLER]: upgradeControllerAction,
    [constants.actionTypes.CHECK_UNIVERSALS]: checkUniversalsAction,
    [constants.actionTypes.CHECK_FILL_ENERGY]: checkFillEnergyAction,
    [constants.actionTypes.CHECK_FILL_SPAWN]: checkFillSpawnAction,
    [constants.actionTypes.CHECK_FILL_EXTENSION]: checkFillExtensionAction,
    [constants.actionTypes.CHECK_FILL_TOWER]: checkFillTowerAction,
    [constants.actionTypes.CHECK_UPGRADE_CONTROLLER]: checkUpgradeControllerAction,
    [constants.actionTypes.RECALCULATE_UNIVERSALS_COUNT]: recalculateUniversalsCountAction,
    [constants.actionTypes.SYNC_MINING_OPERATIONS]: syncMiningOperationsAction,
    [constants.actionTypes.SYNC_ROOM_BUILDER]: syncRoomBuilderAction,
    [constants.actionTypes.SYNC_TOWER_OPERATIONS]: syncTowerOperationsAction,
};

function get(actionType) {
    return handlers[actionType] || null;
}

module.exports = {
    get,
};
