const assert = require("assert");
const cluster = require("cluster");
const { encode, decode } = require("encoded-buffer");

if (cluster.isMaster) {
    var errors = [];
    var workers = [];

    for (let i = 0; i < 2; i++) {
        let worker = cluster.fork();
        workers.push(worker);

        worker.on("message", (msg) => {
            try { msg = decode(Buffer.from(msg))[0] } finally { }
            if (msg instanceof Error) {
                console.error(msg);
                worker.kill();
                errors.push(msg);
            }
        });
    }

    setTimeout(() => {
        if (errors.length) {
            process.exit(1);
        } else {
            for (let worker of workers) {
                worker.kill();
            }
            process.exit();
        }
    }, 2000);
} else {
    const channel = require(".").default;

    function sendError(err) {
        return process.send(encode(err).toString());
    }

    describe("open channel", () => {
        it("should not not connected at first", (done) => {
            try {
                assert.strictEqual(channel.connected, false);
                assert.strictEqual(channel.pid, undefined);
                done();
            } catch (err) {
                sendError(err);
                done(err);
            }
        });

        it("should be connected after a while", (done) => {
            let retries = 0;
            let test = () => {
                if (channel.connected) {
                    clearInterval(timer);
                    try {
                        assert.strictEqual(typeof channel.connected, "boolean");
                        assert.strictEqual(typeof channel.pid, "number");
                        assert.ok(channel.pid > 0);
                        done();
                    } catch (err) {
                        sendError(err);
                        done(err);
                    }
                } else if (retries == 50) {
                    let err = new Error("cannot connect the channel after timeout");
                    sendError(err);
                    done(err);
                } else {
                    retries++;
                }
            };
            let timer = setInterval(test, 20);

            test();
        });

        it("should send and receive message as expected", (done) => {
            switch (channel.pid) {
                case 1:
                    channel.once("message", (sender, msg) => {
                        try {
                            assert.strictEqual(sender, 2);
                            assert.strictEqual(msg, "Peer 2 say hello!");
                            done();
                        } catch (err) {
                            sendError(err);
                            done(err);
                        }
                    });
                    break;

                case 2:
                    // delay sending the message, ensure peer 1 has bound the 
                    // event listener.
                    setTimeout(() => {
                        channel.to(1).send("Peer 2 say hello!");
                        done();
                    }, 50);
                    break;

                default:
                    done();
                    break;
            }
        });

        it("should broadcast message as expected", (done) => {
            switch (channel.pid) {
                case 1:
                    channel.once("message", (sender, msg) => {
                        try {
                            assert.strictEqual(sender, 2);
                            assert.strictEqual(msg, "all attention!");
                            done();
                        } catch (err) {
                            sendError(err);
                            done(err);
                        }
                    });
                    break;

                case 2:
                    // delay sending the message, ensure peer 1 has bound the 
                    // event listener.
                    setTimeout(() => {
                        channel.to("all").send("all attention!");
                        done();
                    }, 50);
                    break;

                default:
                    done();
                    break;
            }
        });

        it("should send and receive message with a custom sevent as expected", (done) => {
            switch (channel.pid) {
                case 1:
                    channel.once("greeting", (sender, msg) => {
                        try {
                            assert.strictEqual(sender, 2);
                            assert.strictEqual(msg, "Peer 2 say hello!");
                            done();
                        } catch (err) {
                            sendError(err);
                            done(err);
                        }
                    });
                    break;

                case 2:
                    // delay sending the message, ensure peer 1 has bound the 
                    // event listener.
                    setTimeout(() => {
                        channel.to(1).emit("greeting", "Peer 2 say hello!");
                        done();
                    }, 50);
                    break;

                default:
                    done();
                    break;
            }
        });

        it("should broadcast message as expected", (done) => {
            switch (channel.pid) {
                case 1:
                    channel.once("attention", (sender, msg) => {
                        try {
                            assert.strictEqual(sender, 2);
                            assert.strictEqual(msg, "all attention!");
                            done();
                        } catch (err) {
                            sendError(err);
                            done(err);
                        }
                    });
                    break;

                case 2:
                    // delay sending the message, ensure peer 1 has bound the 
                    // event listener.
                    setTimeout(() => {
                        channel.to("all").emit("attention", "all attention!");
                        done();
                    }, 50);
                    break;

                default:
                    done();
                    break;
            }
        });

        it("should disconnect the channel as expected", (done) => {
            channel.on("disconnect", () => {
                try {
                    assert.strictEqual(channel.connected, false);
                    done();
                } catch (err) {
                    sendError(err);
                    done(err);
                }
            });
            channel.disconnect();
        });
    });
}