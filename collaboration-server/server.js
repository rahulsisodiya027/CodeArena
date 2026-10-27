
const http = require("http");
const WebSocket = require("ws");
const Y = require("yjs");

const PORT = process.env.PORT || 1234;

const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("CodeArena collaboration server is running.");
});

const wss = new WebSocket.Server({ server });

// Shared documents indexed by room name.
const documents = new Map();

function getDocument(roomName) {
    if (!documents.has(roomName)) {
        documents.set(roomName, new Y.Doc());
    }

    return documents.get(roomName);
}

wss.on("connection", (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const roomName = url.pathname.slice(1);

    if (!roomName || roomName.length > 100) {
        socket.close(1008, "Invalid room name");
        return;
    }

    const doc = getDocument(roomName);

    // This is a basic WebSocket connection only.
    // y-websocket clients require the Yjs sync protocol, so this
    // handler must be extended before using WebsocketProvider.
    socket.send(JSON.stringify({
        type: "connected",
        room: roomName,
    }));

    socket.on("message", (message) => {
        console.log(`Received ${message.length} bytes in room ${roomName}`);
    });

    socket.on("close", () => {
        console.log(`Disconnected from room ${roomName}`);
    });
});

server.listen(PORT, () => {
    console.log(`CodeArena collaboration server running on port ${PORT}`);
});

