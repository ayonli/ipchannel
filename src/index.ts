import * as net from "net";
import { EventEmitter } from "events";
import { openChannel } from "open-channel";
import { send, receive } from './transfer';

function isSocketResetError(err) {
    return err instanceof Error
        && (err["code"] == "ECONNRESET"
            || /socket.*(ended|closed)/i.test(err.message));
}

const Clients: { [pid: number]: net.Socket } = {};

export class Message {
    constructor(private channel: Channel, private receiver: number | "all") { }

    send(...data): boolean {
        return this.channel["send"](this.receiver, "message", data);
    }

    emit(event: string, ...data): boolean {
        return this.channel["send"](this.receiver, event, data);
    }
}

export class Channel extends EventEmitter {
    /** Current peer ID. */
    pid: number;
    private iChannel = openChannel(socket => {
        // server-side logic
        socket.on("data", (buf) => {
            for (let [receiver, event, ...data] of receive(buf)) {
                if (receiver == "all") {
                    for (let pid in Clients) {
                        if (!isNaN(<any>pid)) {
                            Clients[pid].write(send(data[0], event, ...data.slice(1)));
                        }
                    }
                } else {
                    Clients[receiver].write(send(data[0], event, ...data.slice(1)));
                }
            }
        }).on("end", () => {
            for (let pid in Clients) {
                if (!isNaN(<any>pid) && Clients[pid] === socket) {
                    delete Clients[pid];
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
            if (!Clients[pid]) {
                Clients[pid] = socket;
                break;
            }
            pid++;
        }

        // notify the client has connected
        socket.write(send(0, "connect", pid));
    });
    private socket = this.iChannel.connect().on("data", buf => {
        // client-side logic
        for (let [sender, event, ...data] of receive(buf)) {
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
    on(event: "message", listener: (sender: number, ...data) => void): this;
    on(event: string, listener: (sender: number, ...data) => void): this;
    on(event, listener): this {
        return super.on(event, listener);
    }

    once(event: "connect" | "disconnect", listener: () => void): this;
    once(event: "error", listener: (err: Error) => void): this;
    once(event: "message", listener: (sender: number, ...data) => void): this;
    once(event: string, listener: (sender: number, ...data) => void): this;
    once(event, listener): this {
        return super.once(event, listener);
    }

    to(receiver: number | "all"): Message {
        return new Message(this, receiver);
    }

    private send(receiver: number | "all", event: string, data: any[]) {
        return this.socket.write(send(receiver, event, this.pid, ...data));
    }
}

export const channel = new Channel;
export default channel;