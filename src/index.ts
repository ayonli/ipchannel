import * as net from "net";
import { EventEmitter } from "events";
import { getConnection } from "./connection";
import { send, receive } from './transfer';
import { isSocketResetError } from './server';

namespace uipc {
    /**
     * Opens connection to the internal IPC server and returns a client peer 
     * instance.
     * @param timeout The default value is `5000`ms.
     */
    export function connect(timeout?: number): Promise<Channel>;
    export function connect(listener: (err: Error) => void): Channel;
    export function connect(timeout: number, listener: (err: Error) => void): Channel;
    export function connect(...args) {
        let channel = new Channel();
        return channel.connect.apply(channel, args);
    }

    class Message {
        constructor(private channel: Channel, private receiver: number | "all") { }

        emit(msg: any): boolean;
        emit(event: string, ...data): boolean;
        emit(): boolean {
            let event: string, data: any[];

            if (arguments.length === 1) {
                event = "message";
                data.push(arguments[0]);
            } else {
                event = arguments[0];
                data = Array.from(arguments).slice(1);
            }

            return this.channel["send"](this.receiver, event, data);
        }
    }

    export class Channel extends EventEmitter {
        /** Current peer ID. */
        pid: number;
        private timeout: number;
        private connection: net.Socket;
        private waitingMessages: [number | "all", string, any[]][] = [];
        private lastMessage: [number | "all", string, any[]];

        on(event: "connect" | "disconnect" | "error", listener: (err: Error) => void): this;
        on(event: "message", listener: (pid: number, msg) => void): this;
        on(event: string, listener: (pid: number, ...args) => void): this;
        on(event, listener): this {
            return super.on(event, listener);
        }

        to(pid: number | "all"): Message {
            return new Message(this, pid);
        }

        broadcast(msg: any): boolean;
        broadcast(event: string, ...data): boolean;
        broadcast(...args) {
            let msg = this.to("all");
            return msg.emit.apply(msg, args);
        }

        /**
         * Returns `true` if the channel is connected to the server, `false` 
         * otherwise.
         */
        get connected() {
            return !!this.connection && !this.connection.destroyed;
        }

        connect(timeout?: number): Promise<this>;
        connect(listener: (err: Error) => void): this;
        connect(timeout: number, listener: (err: Error) => void): this;
        connect(): this | Promise<this> {
            let listener: (err: Error) => void;

            if (typeof arguments[0] == "function") {
                this.timeout = 5000;
                listener = arguments[0];
            } else {
                this.timeout = arguments[0] || 5000;
                listener = arguments[1];
            }

            let createConnection = async () => {
                await new Promise(async (resolve) => {
                    this.disconnect();
                    this.connection = await getConnection(this.timeout);
                    this.connection.on("data", buf => {
                        for (let [sender, event, ...data] of receive(buf)) {
                            if (event == "connect") {
                                this.pid = data[0];
                                resolve();
                                this.emit("connect", null);
                            } else {
                                this.emit(event, sender, ...data);
                            }
                        }
                    }).on("error", async (err) => {
                        if (err["code"] == "ECONNREFUSED" || isSocketResetError(err)) {
                            // try to re-connect if the connection has lost and 
                            // re-send the message.
                            try {
                                await this.connect(this.timeout);
                                if (this.lastMessage)
                                    this.send.apply(this, this.lastMessage);
                            } catch (err) {
                                if (this.eventNames().includes("error"))
                                    this.emit("error", err);
                                else
                                    throw err;
                            }
                        } else if (this.connected) {
                            if (this.eventNames().includes("error"))
                                this.emit("error", err);
                            else
                                throw err;
                        }
                    });
                });

                // Using waiting message mechanism, the program doesn't have to 
                // wait until the connection established before sending messages.
                if (this.waitingMessages.length) {
                    let receiver: number | "all", event: string, data: any[];
                    while ([receiver, event, data] = this.waitingMessages.shift()) {
                        this.send(receiver, event, data);
                    }
                }

                return this;
            };

            if (listener) {
                createConnection().then(() => {
                    listener(null);
                }).catch(err => {
                    listener(err);
                    this.emit("connect", err);
                });

                return this;
            } else {
                try {
                    return createConnection();
                } catch (err) {
                    if (this.eventNames().includes("connect")) {
                        this.emit("connect", err);
                    } else {
                        throw err;
                    }
                }
            }
        }

        /** Closes connection to the IPC server. */
        disconnect() {
            this.connected && this.connection.destroy();
            this.emit("disconnect", null);
        }

        private send(receiver: number | "all", event: string, data: any[]): boolean {
            if (!this.connected) {
                this.waitingMessages.push([receiver, event, data]);
            } else {
                this.lastMessage = [receiver, event, data];
                return this.connection.write(send(receiver, event, this.pid, ...data), () => {
                    this.lastMessage = null;
                });
            }
        }
    }
}

export = uipc;