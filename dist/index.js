"use strict";
const tslib_1 = require("tslib");
const events_1 = require("events");
const connection_1 = require("./connection");
const transfer_1 = require("./transfer");
const server_1 = require("./server");
var uipc;
(function (uipc) {
    function connect(...args) {
        let channel = new Channel();
        return channel.connect.apply(channel, args);
    }
    uipc.connect = connect;
    class Message {
        constructor(channel, receiver) {
            this.channel = channel;
            this.receiver = receiver;
        }
        emit() {
            let event, data;
            if (arguments.length === 1) {
                event = "message";
                data.push(arguments[0]);
            }
            else {
                event = arguments[0];
                data = Array.from(arguments).slice(1);
            }
            return this.channel["send"](this.receiver, event, data);
        }
    }
    class Channel extends events_1.EventEmitter {
        constructor() {
            super(...arguments);
            this.waitingMessages = [];
        }
        get connected() {
            return !!this.connection && !this.connection.destroyed;
        }
        connect() {
            let listener;
            if (typeof arguments[0] == "function") {
                this.timeout = 5000;
                listener = arguments[0];
            }
            else {
                this.timeout = arguments[0] || 5000;
                listener = arguments[1];
            }
            let createConnection = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield new Promise((resolve) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    this.disconnect();
                    this.connection = yield connection_1.getConnection(this.timeout);
                    this.connection.on("data", buf => {
                        for (let [sender, event, ...data] of transfer_1.receive(buf)) {
                            if (event == "connect") {
                                this.pid = data[0];
                                resolve();
                                this.emit("connect", null);
                            }
                            else {
                                this.emit(event, sender, ...data);
                            }
                        }
                    }).on("error", (err) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                        if (err["code"] == "ECONNREFUSED" || server_1.isSocketResetError(err)) {
                            try {
                                yield this.connect(this.timeout);
                                if (this.lastMessage)
                                    this.send.apply(this, this.lastMessage);
                            }
                            catch (err) {
                                if (this.eventNames().includes("error"))
                                    this.emit("error", err);
                                else
                                    throw err;
                            }
                        }
                        else if (this.connected) {
                            if (this.eventNames().includes("error"))
                                this.emit("error", err);
                            else
                                throw err;
                        }
                    }));
                }));
                if (this.waitingMessages.length) {
                    let receiver, event, data;
                    while ([receiver, event, data] = this.waitingMessages.shift()) {
                        this.send(receiver, event, data);
                    }
                }
                return this;
            });
            if (listener) {
                createConnection().then(() => {
                    listener(null);
                }).catch(err => {
                    listener(err);
                    this.emit("connect", err);
                });
                return this;
            }
            else {
                try {
                    return createConnection();
                }
                catch (err) {
                    if (this.eventNames().includes("connect")) {
                        this.emit("connect", err);
                    }
                    else {
                        throw err;
                    }
                }
            }
        }
        disconnect() {
            this.connected && this.connection.destroy();
            this.emit("disconnect", null);
        }
        on(event, listener) {
            return super.on(event, listener);
        }
        to(pid) {
            return new Message(this, pid);
        }
        broadcast(...args) {
            let msg = this.to("all");
            return msg.emit.apply(msg, args);
        }
        send(receiver, event, data) {
            if (!this.connected) {
                this.waitingMessages.push([receiver, event, data]);
            }
            else {
                this.lastMessage = [receiver, event, data];
                return this.connection.write(transfer_1.send(receiver, event, this.pid, ...data), () => {
                    this.lastMessage = null;
                });
            }
        }
    }
    uipc.Channel = Channel;
})(uipc || (uipc = {}));
module.exports = uipc;
//# sourceMappingURL=index.js.map