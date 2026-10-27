
const express = require("express");
const http = require("http");
const cors = require("cors");
const axios = require("axios");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

app.use(
    cors({
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
        methods: ["GET", "POST"],
    })
);

app.use(express.json({ limit: "1mb" }));

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
        methods: ["GET", "POST"],
    },
});

app.get("/api/health", (req, res) => {
    res.json({ message: "CodeArena backend is running!" });
});

// Store the latest code and language for each room.
const rooms = new Map();

function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeArena!";\n    return 0;\n}',
            language: "cpp",
            participants: new Map(),
        });
    }

    return rooms.get(roomId);
}

function getParticipants(roomId) {
    const room = rooms.get(roomId);

    if (!room) return [];

    return Array.from(room.participants.values());
}

io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("join-room", ({ roomId, username }) => {
        if (
            typeof roomId !== "string" ||
            !/^[a-zA-Z0-9_-]{1,50}$/.test(roomId)
        ) {
            socket.emit("room-error", "Invalid room ID.");
            return;
        }

        const safeUsername =
            typeof username === "string" && username.trim()
                ? username.trim().slice(0, 30)
                : `User-${socket.id.slice(0, 5)}`;

        // Leave the previous room if this socket switches rooms.
        const previousRoomId = socket.data.roomId;

        if (previousRoomId && previousRoomId !== roomId) {
            const previousRoom = rooms.get(previousRoomId);

            socket.leave(previousRoomId);

            if (previousRoom) {
                previousRoom.participants.delete(socket.id);

                io.to(previousRoomId).emit(
                    "participants-updated",
                    getParticipants(previousRoomId)
                );
            }
        }

        const room = getRoom(roomId);

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.username = safeUsername;

        room.participants.set(socket.id, {
            id: socket.id,
            username: safeUsername,
        });

        // Send the existing room state to the newly joined user.
        socket.emit("room-state", {
            code: room.code,
            language: room.language,
        });

        // Broadcast the participant list to everyone in this room.
        io.to(roomId).emit(
            "participants-updated",
            getParticipants(roomId)
        );

        console.log(`${safeUsername} joined room ${roomId}`);
    });

    socket.on("code-change", ({ code, language }) => {
        const roomId = socket.data.roomId;

        if (!roomId || typeof code !== "string") return;
        if (code.length > 100000) return;

        const room = rooms.get(roomId);

        if (!room) return;

        room.code = code;

        if (
            ["cpp", "javascript", "python"].includes(language)
        ) {
            room.language = language;
        }

        // Send updates to everyone else in the room.
        socket.to(roomId).emit("code-update", {
            code: room.code,
            language: room.language,
        });
    });

    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;

        if (roomId) {
            const room = rooms.get(roomId);

            if (room) {
                room.participants.delete(socket.id);

                io.to(roomId).emit(
                    "participants-updated",
                    getParticipants(roomId)
                );

                // Delete empty rooms to release server memory.
                if (room.participants.size === 0) {
                    rooms.delete(roomId);
                }
            }
        }

        console.log("Socket disconnected:", socket.id);
    });
});

// Code execution endpoint.
app.post("/api/execute", async (req, res) => {
    try {
        const { code, language, stdin = "" } = req.body;

        if (
            typeof code !== "string" ||
            !code.trim() ||
            code.length > 100000 ||
            typeof language !== "string" ||
            typeof stdin !== "string" ||
            stdin.length > 10000
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid code, language, or input.",
            });
        }

        const languageIds = {
            cpp: 54,
            javascript: 63,
            python: 71,
        };

        const languageId = languageIds[language];

        if (!languageId) {
            return res.status(400).json({
                success: false,
                error: "Unsupported programming language.",
            });
        }

        const response = await axios.post(
            "https://ce.judge0.com/submissions?base64_encoded=false&wait=true",
            {
                source_code: code,
                language_id: languageId,
                stdin,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 20000,
            }
        );

        const result = response.data;

        res.json({
            success: true,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            compile_output: result.compile_output || "",
            status: result.status?.description || "Unknown",
            time: result.time ?? null,
            memory: result.memory ?? null,
        });
    } catch (error) {
        console.error(
            "Execution error:",
            error.response?.data || error.message
        );

        res.status(502).json({
            success: false,
            error: "Code execution service is unavailable. Please try again.",
        });
    }
});

server.listen(PORT, () => {
    console.log(`CodeArena backend running on port ${PORT}`);
});

