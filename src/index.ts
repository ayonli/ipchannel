import * as net from "net";
import { EventEmitter } from "events";
import { openChannel } from "open-channel";
import { send, receive } from "bsp";
import isSocketResetError = require("is-socket-reset-error");

export class Message {
    constructor(private channel: Channel, private receiver: number | "all") { }

    send(...data: any[]): boolean {
        return this.emit("message", ...data);
    }

    emit(event: string, ...data: any[]): boolean {
        return this.channel["send"](this.receiver, event, data);
    }
}

export class Channel extends EventEmitter {
    /** Current peer ID. */
    pid: number;
    private iChannel = openChannel("ipchannel", socket => {
        // server-side logic
        let temp = [];
        socket.on("data", (buf) => {
            let msg = receive<[number | "all", string, ...any[]]>(buf, temp);

            for (let [receiver, event, ...data] of msg) {
                if (receiver == "all") {
                    for (let pid in Channel.Clients) {
                        if (!isNaN(<any>pid)) {
                            Channel.Clients[pid].write(send(data[0], event, ...data.slice(1)));
                        }
                    }
                } else if (Channel.Clients[receiver]) {
                    Channel.Clients[receiver].write(send(data[0], event, ...data.slice(1)));
                }
            }
        }).on("end", () => {
            for (let pid in Channel.Clients) {
                if (!isNaN(<any>pid) && Channel.Clients[pid] === socket) {
                    delete Channel.Clients[pid];
                    break;
                }
            }
        }).on("error", (err) => {
            if (isSocketResetError(err)) {
                try {
                    socket.destroy();
                    socket.unref();
                } finally { }
            }
        });

        // Ensure even a child-process exited abnormally and rebooted via 
        // some mechanism, the new process still has the same pid as 
        // expected.
        let pid = 1;
        while (true) {
            if (!Channel.Clients[pid]) {
                Channel.Clients[pid] = socket;
                break;
            }
            pid++;
        }

        // notify the client has connected
        socket.write(send(0, "connect", pid));
    });
    private temp = [];
    private socket = this.iChannel.connect().on("data", buf => {
        // client-side logic
        let msg = receive<[number | "all", string, ...any[]]>(buf, this.temp);

        for (let [sender, event, ...data] of msg) {
            if (event == "connect") {
                this.pid = data[0];
                this.emit("connect", null);
            } else {
                this.emit(event, sender, ...data);
            }
        }
    }).on("error", err => {
        this.emit("error", err);
    });

    /**
     * Returns `true` if the channel is connected to the server, `false` 
     * otherwise.
     */
    get connected() {
        return this.iChannel.connected && this.pid !== undefined;
    }

    /** Closes connection of the channel. */
    disconnect() {
        this.iChannel.connected && this.socket.destroy();
        this.emit("disconnect", null);
    }

    on(event: "connect" | "disconnect", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "message", listener: (sender: number, ...data: any[]) => void): this;
    on(event: string, listener: (sender: number, ...data: any[]) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    once(event: "connect" | "disconnect", listener: () => void): this;
    once(event: "error", listener: (err: Error) => void): this;
    once(event: "message", listener: (sender: number, ...data: any[]) => void): this;
    once(event: string, listener: (sender: number, ...data: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }

    to(receiver: number | "all"): Message {
        return new Message(this, receiver);
    }

    private send(receiver: number | "all", event: string, data: any[]) {
        return this.socket.write(send(receiver, event, this.pid, ...data));
    }
}

export namespace Channel {
    export const Clients: { [pid: number]: net.Socket } = {};
}

export const channel = new Channel;
export default channel;