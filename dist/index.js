"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const open_channel_1 = require("open-channel");
const bsp_1 = require("bsp");
const isSocketResetError = require("is-socket-reset-error");
const Clients = {};
class Message {
    constructor(channel, receiver) {
        this.channel = channel;
        this.receiver = receiver;
    }
    send(...data) {
        return this.channel["send"](this.receiver, "message", data);
    }
    emit(event, ...data) {
        return this.channel["send"](this.receiver, event, data);
    }
}
exports.Message = Message;
class Channel extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.iChannel = open_channel_1.openChannel("ipchannel", socket => {
            let temp = [];
            socket.on("data", (buf) => {
                let msg = bsp_1.receive(buf, temp);
                for (let [receiver, event, ...data] of msg) {
                    if (receiver == "all") {
                        for (let pid in Clients) {
                            if (!isNaN(pid)) {
                                Clients[pid].write(bsp_1.send(data[0], event, ...data.slice(1)));
                            }
                        }
                    }
                    else {
                        Clients[receiver].write(bsp_1.send(data[0], event, ...data.slice(1)));
                    }
                }
            }).on("end", () => {
                for (let pid in Clients) {
                    if (!isNaN(pid) && Clients[pid] === socket) {
                        delete Clients[pid];
                        break;
                    }
                }
            }).on("error", (err) => {
                if (isSocketResetError(err)) {
                    try {
                        socket.destroy();
                        socket.unref();
                    }
                    finally { }
                }
            });
            let pid = 1;
            while (true) {
                if (!Clients[pid]) {
                    Clients[pid] = socket;
                    break;
                }
                pid++;
            }
            socket.write(bsp_1.send(0, "connect", pid));
        });
        this.temp = [];
        this.socket = this.iChannel.connect().on("data", buf => {
            let msg = bsp_1.receive(buf, this.temp);
            for (let [sender, event, ...data] of msg) {
                if (event == "connect") {
                    this.pid = data[0];
                    this.emit("connect", null);
                }
                else {
                    this.emit(event, sender, ...data);
                }
            }
        }).on("error", err => {
            this.emit("error", err);
        });
    }
    get connected() {
        return this.iChannel.connected && this.pid !== undefined;
    }
    disconnect() {
        this.iChannel.connected && this.socket.destroy();
        this.emit("disconnect", null);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    to(receiver) {
        return new Message(this, receiver);
    }
    send(receiver, event, data) {
        return this.socket.write(bsp_1.send(receiver, event, this.pid, ...data));
    }
}
exports.Channel = Channel;
exports.channel = new Channel;
exports.default = exports.channel;
//# sourceMappingURL=index.js.map