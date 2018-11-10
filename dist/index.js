"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const open_channel_1 = require("open-channel");
const transfer_1 = require("./transfer");
function isSocketResetError(err) {
    return err instanceof Error
        && (err["code"] == "ECONNRESET"
            || /socket.*(ended|closed)/i.test(err.message));
}
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
            socket.on("data", (buf) => {
                for (let [receiver, event, ...data] of transfer_1.receive(buf)) {
                    if (receiver == "all") {
                        for (let pid in Clients) {
                            if (!isNaN(pid)) {
                                Clients[pid].write(transfer_1.send(data[0], event, ...data.slice(1)));
                            }
                        }
                    }
                    else {
                        Clients[receiver].write(transfer_1.send(data[0], event, ...data.slice(1)));
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
            socket.write(transfer_1.send(0, "connect", pid));
        });
        this.socket = this.iChannel.connect().on("data", buf => {
            for (let [sender, event, ...data] of transfer_1.receive(buf)) {
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
        return this.socket.write(transfer_1.send(receiver, event, this.pid, ...data));
    }
}
exports.Channel = Channel;
exports.channel = new Channel;
exports.default = exports.channel;
//# sourceMappingURL=index.js.map