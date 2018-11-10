# IPChannel

**Elegant and self-hosting channel for inter-process communication.**

## Limits Of Ordinary IPC Modules

1. NodeJS `process.on("message")` and `process.send()` only support messages 
    from the master process to a child-process.
2. Some situations, e.g. in [PM2](https://pm2.io) cluster mode, developers don't
    have access to design logic in the master process.
3. Third-party IPC modules often require starting the socket server manually,
    which often needs access to master process as well.
4. Third-package IPC modules require setting exact socket protocol to 
    communicate, which doesn't suit all environments. (e.g. cluster doesn't 
    support **Windows Named Pipe**).
5. Internal IPC support and many third-party packages doesn't generate 
    predictable process id, you aren't able to send message to a certain process.
6. One the master process or IPC server is down, all communications will be lost.

## Advantages When Using IPChannel

1. No need to access master process, even all the processes are executed 
    manually (means they are not child-processes at all).
2. No need to start IPC server explicitly, automatically choose the best 
    protocol according to the environment.
3. Communicate directly from one process to another or to all.
4. With predictable peer id, you can distinguish processes from each other.
5. When a process exited abnormally and restarted, the IPC channel will 
    automatically rebuild with the same id.
6. Even the internal IPC server is down, the remaining processes will ship a new
    one immediately and guarantee no-downtime period communication.
7. Fully support under *PM2* supervision.
8. Sending messages event before the channel is connected.

## How To Use?

It's as almost easy using this module as it will be when using internal 
`process.on("message")` and `process.send()`, and even more, IPChannel allows
you sending messages with a custom event that emitted on the receiver side.

```javascript
// task.js
import channel from "ipchannel";

// listening messages without event
channel.on("message", (sender, msg) => {
    console.log(`Peer ${sender} says: ${msg}`);
});

// By default, the channel is not connnected immediately, and `channel.pid` 
// (peer id) will only be available after the connection is established, so the 
// following code will output undefined since the channel is not open yet.
console.log(channel.pid); // => undefined

// If you check `channel.connected`, it will be false initially.
console.log(channel.connected); // => false

// Even the channel is not yet connected, you still can send messages now, they
// will be queued and flushed once the connection is established.
channel.to(1).send("This message is sent before connection.");

channel.on("connect", () => {
    // now that channel is connected
    console.log(channel.connected); // => true

    switch (channel.pid) {
        case 1:
            // listening messages with a custom event
            channel.on("custom-event", (sender, ...data) => {
                console.log(`Peer ${sender} emits: ${JSON.stringify(data)}`);
            });
            break;

        case 2:
            // send message to peer 1
            channel.to(1).send("Hi peer 1, I'm peer 2.");
            break;

        case 3:
            // send message with an event to peer 1
            channel.to(1).emit("custom-event", "hello world");
            break;

        case 4:
            // send message to all peers
            channel.to("all").send("all attention");
            // send message with an event to all peers
            channel.to("all").emit("custom-event", "all attention");
            break;
    }
});
```

In this example, I will use cluster to fork several child-processes, but using 
cluster is optional, you can just use `child_process` module as you want, or 
even run them manually (must provide the absolute path of the script file, e.g.
`node $(pwd)/task.js`).

```javascript
// index.js
const cluster = require("cluster");

if (cluster.isMaster) {
    // fork 4 workers
    for (let i = 0; i < 4; i++) {
        cluster.fork();
    }
} else {
    require("./task");
}
```

## API

There are very few API in this package, it's designed to be as simple as 
possible, but brings the major IPC functionality across processes into NodeJS.

- `channel.connected: boolean` Returns `true` if the channel is connected, 
    `false` otherwise.
- `channel.pid: number` Returns the peer id (starts from `1`), this id will 
    persist even after the process is restarted, but only available after 
    connection.
- `channel.disconnect(): void` Closes connection of the channel.
- `channel.on(event: "connect" | "disconnect", listener: () => void): this` 
    Binds a connection/disconnection handler.
- `channel.on(event: "error", listener: (err?: Error) => void): this` Binds a 
    error handler.
- `channel.on(event: "message", listener: (sender: number, msg: any) => void)` 
    Binds a listener function emitted when a message is sent to the current 
    peer (`channel.once()` also works).
- `channel.on(event: string, listener: (sender: number, ...data) => void)` Binds
    a listener function emitted when a message is sent to the current peer 
    with a custom event (`channel.once()` also works).
- `channel.to(receiver: number | "all").send(...data): boolean` Sends a message
    to the receiver, which could be a peer id, or broadcast to all peers 
    (including the current one).
- `channel.to(receiver: number | "all").emit(event: string, ...data): boolean` 
    Sends a message to the receiver with a custom event, it could be a peer id,
    or broadcast to all peers (including the current one).

## What Can't IPChannel Do?

- IPChannel requires all processes run with the same entry file, it won't work
    with multi-entry applications.
- IPChannel only supports communications on the same machine, it's not designed 
    for network communications with remote services.

## License

This package is licensed under [MIT license](./LICENSE).