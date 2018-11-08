import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as cluster from "cluster";
import * as fs from "fs-extra";
import { receive, send } from "./transfer";

const isWin32 = process.platform == "win32";
const usingPort = isWin32 && cluster.isWorker;
const Clients: { [pid: number]: net.Socket } = {};

export async function createServer(pid: number) {
    let server = net.createServer(socket => {
        socket.on("data", (buf) => {
            for (let [receiver, event, ...data] of receive(buf)) {
                if (receiver == "all") {
                    for (let pid in Clients) {
                        if (!isNaN(<any>pid))
                            Clients[pid].write(send(data[0], event, data.slice(1)));
                    }
                } else {
                    Clients[receiver].write(send(data[0], event, data.slice(1)));
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

        socket.write(send(-1, "connect", pid));
    });

    await new Promise(async (resolve, reject) => {
        server.once("error", (err) => {
            server.close();
            server.unref();

            // If the port is already in use, then throw the error, otherwise, 
            // just return null so that the program could retry.
            if (err["code"] == "EADDRINUSE") {
                reject(err);
            } else {
                resolve(null);
            }
        });

        if (usingPort) {
            server.listen(() => {
                resolve(null);
            });
        } else {
            // bind to a Unix domain socket or Windows named pipe
            let path = <string>await getSocketAddr(pid);

            if (await fs.pathExists(path)) {
                // When all the connection request run asynchronously, there is 
                // no guarantee that this procedure will run as expected since 
                // anther process may delete the file before the current 
                // process do. So must put the 'unlink' operation in a 
                // try...catch block, and when fail, it will not cause the 
                // process to terminate.
                try { await fs.unlink(path); } catch (e) { }
            }

            server.listen(path, () => {
                resolve(null);
            });
        }
    });

    if (usingPort) {
        await setPort(pid, (<net.AddressInfo>server.address()).port);
    }

    return server;
}

async function setPort(pid: number, port: number) {
    let dir = os.tmpdir() + "/.uipc",
        file = dir + "/" + pid;

    await fs.ensureDir(dir);
    await fs.writeFile(file, port, "utf8");
}

export async function getSocketAddr(pid: number): Promise<string | number> {
    let dir = os.tmpdir() + "/.uipc",
        file = dir + "/" + pid;

    if (!usingPort) {
        await fs.ensureDir(dir);
        return !isWin32 ? file : path.join('\\\\?\\pipe', file);
    }

    try {
        let data = await fs.readFile(file, "utf8");
        return parseInt(data) || 0;
    } catch (err) {
        return 0;
    }
}

export function isSocketResetError(err) {
    return err instanceof Error
        && (err["code"] == "ECONNRESET"
            || /socket.*(ended|closed)/.test(err.message));
}