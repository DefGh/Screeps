function log(message) {
    if (!Memory.debug) {
        return;
    }

    console.log(message);
}

function visuals() {

}


module.exports = {
    log,
    visuals
}