export function send(peer: number | "all", event: string, ...data: any[]) {
    return Buffer.from(JSON.stringify([peer, event, ...data]) + "\r\n\r\n");
}

export function receive(buf: Buffer): Array<[number | "all", string, ...any[]]> {
    let pack = buf.toString().split("\r\n\r\n"),
        parts = [];

    for (let part of pack) {
        if (part) parts.push(JSON.parse(part));
    }

    return parts;
}