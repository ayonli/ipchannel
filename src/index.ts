import * as net from "net";
import { EventEmitter } from "events";
import { openChannel } from "open-channel";
import { encode, decode } from "bsp";
import { BiMap } from "advanced-collections";

export class Message {
    constructor(private channel: Channel, private receiver: number | "all") { }

    send(...data: any[]): boolean {
        return this.channel["send"](this.receiver, "message", data);
    }

    emit(event: string, ...data: any[]): boolean {
        return this.channel["send"](this.receiver, event, data);
    }
}

export class Channel extends EventEmitter {
    /** Current peer ID. */
    pid: number;
    private temp: Buffer[] = [];
    protected clients = new BiMap<number, net.Socket>();
    protected detachClient = (socket: net.Socket) => this.clients.deleteValue(socket);
    protected iChannel = openChannel("ipchannel", socket => {
        // server-side logic
        let temp = [];

        socket.on("data", (buf) => {
            let msg = decode<[number | "all", string, ...any[]]>(buf, temp);

            for (let [receiver, event, ...data] of msg) {
                let socket: net.Socket;

                if (receiver === "all") {
                    for (let socket of this.clients.values()) {
                        socket.write(encode([data[0], event, ...data.slice(1)]));
                    }
                } else if (socket = this.clients.get(receiver)) {
                    socket.write(encode([data[0], event, ...data.slice(1)]));
                }
            }
        }).on("end", this.detachClient).on("close", this.detachClient);

        // notify the client has connected
        socket.write(encode([0, "connect", this.attachClient(socket)]));
    });
    protected socket = this.iChannel.connect().on("data", buf => {
        // client-side logic
        let msg = decode<[number | "all", string, ...any[]]>(buf, this.temp);

        for (let [sender, event, ...data] of msg) {
            if (event === "connect") {
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

    protected send(receiver: number | "all", event: string, data: any[]) {
        return this.socket.write(encode([receiver, event, this.pid, ...data]));
    }

    protected attachClient(socket: net.Socket): number {
        // Ensure even a child-process exited abnormally and rebooted via some 
        // mechanism, the new process still has the same pid as expected.
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

export const channel = new Channel;
export default channel;