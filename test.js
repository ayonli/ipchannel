const assert = require("assert");
const cluster = require("cluster");

if (cluster.isMaster) {
    var workers = [];

    for (let i = 0; i < 4; i++) {
        let worker = cluster.fork();
        workers.push(worker);

        // if (workers)
    }
} else {
    require("./test-task");
}