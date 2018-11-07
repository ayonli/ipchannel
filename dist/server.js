"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net = require("net");
const os = require("os");
const path = require("path");
const cluster = require("cluster");
const fs = require("fs-extra");
const transfer_1 = require("./transfer");
const isWin32 = process.platform == "win32";
const usingPort = isWin32 && cluster.isWorker;
const Clients = {};
function createServer(pid) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let server = net.createServer(socket => {
            socket.on("data", (buf) => {
                for (let [receiver, event, ...data] of transfer_1.receive(buf)) {
                    if (receiver == "all") {
                        for (let pid in Clients) {
                            if (!isNaN(pid))
                                Clients[pid].write(transfer_1.send(data[0], event, data.slice(1)));
                        }
                    }
                    else {
                        Clients[receiver].write(transfer_1.send(data[0], event, data.slice(1)));
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
            let pid = 0;
            while (true) {
                if (!Clients[pid]) {
                    Clients[pid] = socket;
                    break;
                }
                pid++;
            }
            socket.write(transfer_1.send(-1, "connect", pid));
        });
        yield new Promise((resolve, reject) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            server.once("error", (err) => {
                server.close();
                server.unref();
                if (err["code"] == "EADDRINUSE") {
                    reject(err);
                }
                else {
                    resolve(null);
                }
            });
            if (usingPort) {
                server.listen(() => {
                    resolve(null);
                });
            }
            else {
                let path = yield getSocketAddr(pid);
                if (yield fs.pathExists(path)) {
                    try {
                        yield fs.unlink(path);
                    }
                    catch (e) { }
                }
                server.listen(path, () => {
                    resolve(null);
                });
            }
        }));
        if (usingPort) {
            yield setPort(pid, server.address().port);
        }
        return server;
    });
}
exports.createServer = createServer;
function setPort(pid, port) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let dir = os.tmpdir() + "/.uipc", file = dir + "/" + pid;
        yield fs.ensureDir(dir);
        yield fs.writeFile(file, port, "utf8");
    });
}
function getSocketAddr(pid) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let dir = os.tmpdir() + "/.uipc", file = dir + "/" + pid;
        if (!usingPort) {
            yield fs.ensureDir(dir);
            return !isWin32 ? file : path.join('\\\\?\\pipe', file);
        }
        try {
            let data = yield fs.readFile(file, "utf8");
            return parseInt(data) || 0;
        }
        catch (err) {
            return 0;
        }
    });
}
exports.getSocketAddr = getSocketAddr;
function isSocketResetError(err) {
    return err instanceof Error
        && (err["code"] == "ECONNRESET"
            || /socket.*(ended|closed)/.test(err.message));
}
exports.isSocketResetError = isSocketResetError;
//# sourceMappingURL=server.js.map