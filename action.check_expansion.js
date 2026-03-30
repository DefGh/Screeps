const create = require("./action.check_factory");
const checker = require("./checker");

module.exports = create(checker.checkExpansion);
