require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const axios = require("axios");
const { Server } = require("socket.io");

const connectDB = require("./db");
const Room = require("./room");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});

app.use(cors({
    origin: "http://localhost:5173",
}));

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 5000;

// Default code for a new room
const DEFAULT_CODE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << "Hello, CodeArena!" << endl;
    return 0;
}`;

// In-memory room cache
const rooms = new Map();

// Supported languages
const SUPPORTED_LANGUAGES = ["cpp", "javascript", "python"];

const LANGUAGE_IDS = {
    cpp: 54,
    javascript: 63,
    python: 71,
};

// Validate room IDs
function isValidRoomId(roomId) {
    return (
        typeof roomId === "string" &&
        /^[a-zA-Z0-9_-]{1,50}$/.test(roomId)
    );
}

// Get a room from memory or MongoDB
async function getRoom(roomId) {
    if (rooms.has(roomId)) {
        return rooms.get(roomId);
    }

    let room = await Room.findOne({ roomId });

    if (!room) {
        room = await Room.create({
            roomId,
            code: DEFAULT_CODE,
            language: "cpp",
        });
    }

    const roomData = {
        code: room.code || DEFAULT_CODE,
        language: room.language || "cpp",
        participants: new Map(),
        saveTimer: null,
    };

    rooms.set(roomId, roomData);

    return roomData;
}

// Save the room's cached code to MongoDB after a short delay
function scheduleRoomSave(roomId) {
    const room = rooms.get(roomId);

    if (!room) {
        return;
    }

    if (room.saveTimer) {
        clearTimeout(room.saveTimer);
    }

    room.saveTimer = setTimeout(async () => {
        try {
            await Room.updateOne(
                { roomId },
                {
                    $set: {
                        code: room.code,
                        language: room.language,
                    },
                }
            );

            console.log(`Room ${roomId} saved to MongoDB`);
        } catch (error) {
            console.error(
                `Failed to save room ${roomId}:`,
                error.message
            );
        }

        room.saveTimer = null;
    }, 1000);
}

// Save a room immediately
async function saveRoomImmediately(roomId) {
    const room = rooms.get(roomId);

    if (!room) {
        return;
    }

    if (room.saveTimer) {
        clearTimeout(room.saveTimer);
        room.saveTimer = null;
    }

    try {
        await Room.updateOne(
            { roomId },
            {
                $set: {
                    code: room.code,
                    language: room.language,
                },
            }
        );

        console.log(`Room ${roomId} saved before cleanup`);
    } catch (error) {
        console.error(
            `Failed to save room ${roomId}:`,
            error.message
        );
    }
}

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "CodeArena backend is running!",
    });
});

// Get room data
app.get("/api/rooms/:roomId", async (req, res) => {
    try {
        const { roomId } = req.params;

        if (!isValidRoomId(roomId)) {
            return res.status(400).json({
                message: "Invalid room ID.",
            });
        }

        const room = await Room.findOne({ roomId });

        if (!room) {
            return res.status(404).json({
                message: "Room not found.",
            });
        }

        return res.json({
            roomId: room.roomId,
            code: room.code,
            language: room.language,
            updatedAt: room.updatedAt,
        });
    } catch (error) {
        console.error("Get room error:", error.message);

        return res.status(500).json({
            message: "Failed to retrieve room.",
        });
    }
});

// Create a room
app.post("/api/rooms", async (req, res) => {
    try {
        const roomId =
            typeof req.body.roomId === "string"
                ? req.body.roomId
                : require("crypto").randomUUID().slice(0, 8).toUpperCase();

        if (!isValidRoomId(roomId)) {
            return res.status(400).json({
                message: "Invalid room ID.",
            });
        }

        let room = await Room.findOne({ roomId });

        if (!room) {
            room = await Room.create({
                roomId,
                code: DEFAULT_CODE,
                language: "cpp",
            });
        }

        return res.status(201).json({
            message: "Room created successfully.",
            roomId: room.roomId,
            code: room.code,
            language: room.language,
        });
    } catch (error) {
        console.error("Create room error:", error.message);

        return res.status(500).json({
            message: "Failed to create room.",
        });
    }
});

// Socket.IO room management
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Join a room
    socket.on("join-room", async (data = {}) => {
        try {
            const { roomId, username } = data;

            if (!isValidRoomId(roomId)) {
                socket.emit("room-error", "Invalid room ID.");
                return;
            }

            const room = await getRoom(roomId);

            // Leave a previously joined room
            if (socket.data.roomId) {
                socket.leave(socket.data.roomId);

                const previousRoom = rooms.get(socket.data.roomId);

                if (previousRoom) {
                    previousRoom.participants.delete(socket.id);

                    io.to(socket.data.roomId).emit(
                        "participants-updated",
                        Array.from(previousRoom.participants.values())
                    );
                }
            }

            socket.data.roomId = roomId;

            socket.join(roomId);

            const participant = {
                id: socket.id,
                username:
                    typeof username === "string" && username.trim()
                        ? username.slice(0, 40)
                        : "Anonymous",
            };

            room.participants.set(socket.id, participant);

            // Send saved room state to the joining client
            socket.emit("room-state", {
                roomId,
                code: room.code,
                language: room.language,
            });

            // Notify everyone in the room
            io.to(roomId).emit(
                "participants-updated",
                Array.from(room.participants.values())
            );

            console.log(`Client ${socket.id} joined room ${roomId}`);
        } catch (error) {
            console.error("Join room error:", error.message);

            socket.emit("room-error", "Unable to join the room.");
        }
    });

    // Handle code changes sent through Socket.IO
    socket.on("code-change", async (data = {}) => {
        try {
            const { roomId, code, language } = data;

            if (
                !isValidRoomId(roomId) ||
                typeof code !== "string" ||
                code.length > 100000 ||
                !SUPPORTED_LANGUAGES.includes(language)
            ) {
                return;
            }

            // Only allow changes to the room the socket joined
            if (socket.data.roomId !== roomId) {
                return;
            }

            const room = rooms.get(roomId);

            if (!room) {
                return;
            }

            room.code = code;
            room.language = language;

            // Notify other clients in the room
            socket.to(roomId).emit("code-update", {
                code,
                language,
            });

            scheduleRoomSave(roomId);
        } catch (error) {
            console.error("Code change error:", error.message);
        }
    });

    // Save code explicitly to MongoDB
    socket.on("save-code", async (data = {}) => {
        try {
            const { roomId, code, language } = data;

            if (
                !isValidRoomId(roomId) ||
                typeof code !== "string" ||
                code.length > 100000 ||
                !SUPPORTED_LANGUAGES.includes(language)
            ) {
                socket.emit("save-code-error", {
                    message: "Invalid code or language.",
                });
                return;
            }

            if (socket.data.roomId !== roomId) {
                socket.emit("save-code-error", {
                    message: "You have not joined this room.",
                });
                return;
            }

            const room = rooms.get(roomId);

            if (!room) {
                socket.emit("save-code-error", {
                    message: "Room not found.",
                });
                return;
            }

            room.code = code;
            room.language = language;

            if (room.saveTimer) {
                clearTimeout(room.saveTimer);
                room.saveTimer = null;
            }

            const result = await Room.updateOne(
                { roomId },
                {
                    $set: {
                        code,
                        language,
                    },
                }
            );

            if (result.matchedCount === 0) {
                socket.emit("save-code-error", {
                    message: "Room not found in MongoDB.",
                });
                return;
            }

            console.log(`Room ${roomId} saved to MongoDB`);

            socket.emit("code-saved", {
                roomId,
                message: "Code saved successfully.",
            });
        } catch (error) {
            console.error("Save code error:", error.message);

            socket.emit("save-code-error", {
                message: "Failed to save code.",
            });
        }
    });

    // Update the selected language
    socket.on("language-change", (data = {}) => {
        const { roomId, language } = data;

        if (
            !isValidRoomId(roomId) ||
            !SUPPORTED_LANGUAGES.includes(language) ||
            socket.data.roomId !== roomId
        ) {
            return;
        }

        const room = rooms.get(roomId);

        if (!room) {
            return;
        }

        room.language = language;

        socket.to(roomId).emit("language-update", {
            language,
        });

        scheduleRoomSave(roomId);
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
        console.log("Client disconnected:", socket.id);

        const roomId = socket.data.roomId;

        if (!roomId) {
            return;
        }

        const room = rooms.get(roomId);

        if (!room) {
            return;
        }

        room.participants.delete(socket.id);

        io.to(roomId).emit(
            "participants-updated",
            Array.from(room.participants.values())
        );

        // Save and remove the cached room when everyone leaves
        if (room.participants.size === 0) {
            await saveRoomImmediately(roomId);
            rooms.delete(roomId);
        }
    });
});

// Execute code using Judge0
app.post("/api/execute", async (req, res) => {
    try {
        const { code, language } = req.body;

        if (typeof code !== "string" || !code.trim()) {
            return res.status(400).json({
                message: "Please provide code to execute.",
            });
        }

        if (code.length > 100000) {
            return res.status(400).json({
                message: "Code is too large.",
            });
        }

        if (!SUPPORTED_LANGUAGES.includes(language)) {
            return res.status(400).json({
                message: "Unsupported programming language.",
            });
        }

        const judge0Url = process.env.JUDGE0_URL;
        const judge0ApiKey = process.env.JUDGE0_API_KEY;

        if (!judge0Url) {
            return res.status(500).json({
                message: "Judge0 is not configured. Set JUDGE0_URL in your .env file.",
            });
        }

        const headers = {
            "Content-Type": "application/json",
        };

        if (judge0ApiKey) {
            headers["X-Auth-Token"] = judge0ApiKey;
        }

        const response = await axios.post(
            `${judge0Url.replace(/\/$/, "")}/submissions?base64_encoded=false&wait=true`,
            {
                source_code: code,
                language_id: LANGUAGE_IDS[language],
            },
            {
                headers,
                timeout: 30000,
            }
        );

        return res.json({
            stdout: response.data.stdout || "",
            stderr: response.data.stderr || "",
            compile_output: response.data.compile_output || "",
            message: response.data.message || "",
            status: response.data.status || null,
            time: response.data.time || null,
            memory: response.data.memory || null,
        });
    } catch (error) {
        console.error(
            "Code execution error:",
            error.response?.data || error.message
        );

        if (error.code === "ECONNABORTED") {
            return res.status(504).json({
                message: "Code execution timed out.",
            });
        }

        return res.status(500).json({
            message: "Code execution failed. Check your Judge0 configuration.",
        });
    }
});

// Start server after connecting to MongoDB
async function startServer() {
    try {
        await connectDB();

        server.listen(PORT, () => {
            console.log(`CodeArena backend running on port ${PORT}`);
            console.log(`Health check: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
}

startServer();