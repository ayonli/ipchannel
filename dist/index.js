"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const open_channel_1 = require("open-channel");
const bsp_1 = require("bsp");
const advanced_collections_1 = require("advanced-collections");
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
        this.temp = [];
        this.clients = new advanced_collections_1.BiMap();
        this.detachClient = (socket) => this.clients.deleteValue(socket);
        this.iChannel = open_channel_1.openChannel("ipchannel", socket => {
            let temp = [];
            socket.on("data", (buf) => {
                let msg = bsp_1.decode(buf, temp);
                for (let [receiver, event, ...data] of msg) {
                    let socket;
                    if (receiver === "all") {
                        for (let socket of this.clients.values()) {
                            socket.write(bsp_1.encode([data[0], event, ...data.slice(1)]));
                        }
                    }
                    else if (socket = this.clients.get(receiver)) {
                        socket.write(bsp_1.encode([data[0], event, ...data.slice(1)]));
                    }
                }
            }).on("end", this.detachClient).on("close", this.detachClient);
            socket.write(bsp_1.encode([0, "connect", this.attachClient(socket)]));
        });
        this.socket = this.iChannel.connect().on("data", buf => {
            let msg = bsp_1.decode(buf, this.temp);
            for (let [sender, event, ...data] of msg) {
                if (event === "connect") {
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
        return this.socket.write(bsp_1.encode([receiver, event, this.pid, ...data]));
    }
    attachClient(socket) {
        let pid = 0;
        while (++pid) {
            if (!this.clients.has(pid)) {
                this.clients.set(pid, socket);
                break;
            }
        }
        return pid;
    }
}
exports.Channel = Channel;
exports.channel = new Channel;
exports.default = exports.channel;
//# sourceMappingURL=index.js.map