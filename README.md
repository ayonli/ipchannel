# uipc

**Universal IPC channel without master process and server.**

## Limits Of Current NodeJS IPC Modules

1. NodeJS `process.on("message")` and `process.send()` only support messages 
    from the main process to a child-process.
2. Some situations, e.g. in *PM2* cluster mode, developers don't have access to 
    design logic in the master process.
3. Third-party IPC packages normally require starting the socket server manually,
    which often require access to master process as well.
4. Third-package IPC packages require setting exact socket protocol to 
    communicate, which doesn't suit all environments. (e.g. cluster doesn't 
    support **Windows Named Pipe**).
5. Internal IPC support and many third-party packages doesn't generate 
    predictable process id, you aren't able to send message to a certain process.

## Benefits When Using UIPC

1. No need to access master process, even all the processes are executed 
    manually (means they are not child-processes at all).
2. No need to start IPC server, automatically choose the best protocol according
    to the environment.
3. Communicate directly from one process to another (or to all).
4. With predictable peer id, you can distinguish processes from each other.
5. Even a process exited abnormally and restarted, the IPC channel will 
    automatically rebuild with the same id.

## How To Use?

In this example, I will use cluster to fork several child-processes, but using 
cluster is optional, you can just use `child_process` module as you want, or 
even run then manually (must be the same script file with absolute path).

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

```javascript
// task.js
const uipc = require("uipc");

(async () => {
    var channel = await uipc.connect();

    channel.on("message", (sender, msg) => {
        console.log(`Peer ${sender} says: ${msg}`);
    });

    switch (channel.pid) {
        case 0:
            channel.on("custom-event", (sender, ...data) => {
                console.log(`Peer ${sender} emits: ${JSON.stringify(data)}`);
            });
            break;

        case 1:
            channel.to(0).emit("Hi peer 0");
            break;

        case 2:
            channel.to(0).emit("custom-event", "hello world");
            break;

        case 3:
            channel.broadcast("all attention");
            break;
    }
})();

// The code above uses async/await to wait until the connection estrablished 
// before listening and sending messages. However, it's not necessary, you can 
// send messages before the connection is established, they will be temporarily 
// stored in a queue, and sent once the connection is ready.
// BUT be aware, the channel.pid will not be available until connected.

var channel = uipc.connect(() => {}); // must provide a listener function.
console.log(channel.pid); // will be undefined, since not connected
```

## API

There are very few API in this package, it's designed to be as simple as 
possible, but brings the major IPC functions cross processes into NodeJS.

- `uipc.connect(timeout?: number): Promise<uipc.Channel>`
- `uipc.connect(handler: (err: Error) => void): uipc.Channel`
- `uipc.connect(timeout: number, handler: (err: Error) => void): uipc.Channel`
    Opens connection to the internal IPC server and returns a client channel 
    instance.
    - `timeout` The default value is `5000` ms.

- `channel.connected: boolean` Returns `true` if the queue is connected to the 
    server, `false` otherwise.
- `channel.connect(timeout?: number): Promise<this>` Same as `uipc.connect()`. 
    Use the later instead, it's more semantic.
- `channel.disconnect(): void` Closes connection to the IPC server.
- `channel.on(event: "error", listener: (err?: Error) => void): this` Binds a 
    error handler.
- `channel.on(event: "message", listener: (sender: number, msg: any) => void)` 
    Binds a listener function triggered when a message is sent to the current 
    channel without an event.
- `channel.on(event: string, listener: (sender: number, ...data) => void)` Binds
    a listener function triggered when a message is sent to the current channel 
    with a certain event.
- `channel.to(receiver: number | "all").emit(msg: any): boolean` Sends a message
    to the receiver without an event, it could be a peer id, or string literal 
    `"all"` to all peers (including the current one).
- `channel.to(receiver: number | "all").emit(event: string, ...data): boolean` 
    Sends a message to the receiver with an certain event, it could be a peer id,
    or string literal `"all"` to all peers (including the current one).
- `channel.broadcast(msg: amy): boolean` Short-hand of 
    `channel.to("all").emit(msg: any)`.
- `channel.broadcast(event: string, ...data): boolean` Short-hand of 
    `channel.to("all").emit(event: string, ...data)`.

## License

This package is licensed under [MIT license](./LICENSE).