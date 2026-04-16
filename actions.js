const constants = require("./constants");
const spawnCreepAction = require("./action.spawn_creep");
const mineAction = require("./action.mine");
const pickupResourceAction = require("./action.pickup_resource");
const takeResourceAction = require("./action.take_resource");
const attackTargetAction = require("./action.attack_target");
const healTargetAction = require("./action.heal_target");
const dismantleTargetAction = require("./action.dismantle_target");
const attackControllerAction = require("./action.attack_controller");
const buildAction = require("./action.build");
const moveToRenewAction = require("./action.move_to_renew");
const repairAction = require("./action.repair");
const renewCreepAction = require("./action.renew_creep");
const goToTargetAction = require("./action.go_to_target");
const scoutRoomAction = require("./action.scout_room");
const scoutOutpostRoomAction = require("./action.scout_outpost_room");
const claimControllerAction = require("./action.claim_controller");
const retireCreepAction = require("./action.retire_creep");
const taxiAction = require("./action.taxi");
const towerAttackAction = require("./action.tower_attack");
const towerRepairAction = require("./action.tower_repair");
const towerHealAction = require("./action.tower_heal");
const placeConstructionSiteAction = require("./action.place_construction_site");
const transferEnergyAction = require("./action.transfer_energy");
const transferResourceAction = require("./action.transfer_resource");
const upgradeControllerAction = require("./action.upgrade_controller");
const checkUniversalsAction = require("./action.check_universals");
const checkUniversalRenewAction = require("./action.check_universal_renew");
const checkFillEnergyAction = require("./action.check_fill_energy");
const checkNonEnergyLogisticsAction = require("./action.check_non_energy_logistics");
const checkFillSpawnAction = require("./action.check_fill_spawn");
const checkFillExtensionAction = require("./action.check_fill_extension");
const checkFillTowerAction = require("./action.check_fill_tower");
const checkExpansionAction = require("./action.check_expansion");
const checkLongRangeMiningAction = require("./action.check_long_range_mining");
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
    [constants.actionTypes.ATTACK_TARGET]: attackTargetAction,
    [constants.actionTypes.HEAL_TARGET]: healTargetAction,
    [constants.actionTypes.DISMANTLE_TARGET]: dismantleTargetAction,
    [constants.actionTypes.ATTACK_CONTROLLER]: attackControllerAction,
    [constants.actionTypes.BUILD]: buildAction,
    [constants.actionTypes.MOVE_TO_RENEW]: moveToRenewAction,
    [constants.actionTypes.REPAIR]: repairAction,
    [constants.actionTypes.RENEW_CREEP]: renewCreepAction,
    [constants.actionTypes.GO_TO_TARGET]: goToTargetAction,
    [constants.actionTypes.SCOUT_ROOM]: scoutRoomAction,
    [constants.actionTypes.SCOUT_OUTPOST_ROOM]: scoutOutpostRoomAction,
    [constants.actionTypes.CLAIM_CONTROLLER]: claimControllerAction,
    [constants.actionTypes.RETIRE_CREEP]: retireCreepAction,
    [constants.actionTypes.TAXI]: taxiAction,
    [constants.actionTypes.TOWER_ATTACK]: towerAttackAction,
    [constants.actionTypes.TOWER_REPAIR]: towerRepairAction,
    [constants.actionTypes.TOWER_HEAL]: towerHealAction,
    [constants.actionTypes.PLACE_CONSTRUCTION_SITE]: placeConstructionSiteAction,
    [constants.actionTypes.TRANSFER_ENERGY]: transferEnergyAction,
    [constants.actionTypes.TRANSFER_RESOURCE]: transferResourceAction,
    [constants.actionTypes.UPGRADE_CONTROLLER]: upgradeControllerAction,
    [constants.actionTypes.CHECK_UNIVERSALS]: checkUniversalsAction,
    [constants.actionTypes.CHECK_UNIVERSAL_RENEW]: checkUniversalRenewAction,
    [constants.actionTypes.CHECK_FILL_ENERGY]: checkFillEnergyAction,
    [constants.actionTypes.CHECK_NON_ENERGY_LOGISTICS]: checkNonEnergyLogisticsAction,
    [constants.actionTypes.CHECK_FILL_SPAWN]: checkFillSpawnAction,
    [constants.actionTypes.CHECK_FILL_EXTENSION]: checkFillExtensionAction,
    [constants.actionTypes.CHECK_FILL_TOWER]: checkFillTowerAction,
    [constants.actionTypes.CHECK_EXPANSION]: checkExpansionAction,
    [constants.actionTypes.CHECK_LONG_RANGE_MINING]: checkLongRangeMiningAction,
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
