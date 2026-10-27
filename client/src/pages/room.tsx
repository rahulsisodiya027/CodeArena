
import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { io, type Socket } from "socket.io-client";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import "./room.css";

interface Participant {
    id: string;
    username: string;
}

interface ExecutionResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    compile_output?: string;
    status?: string;
    time?: string | null;
    memory?: number | null;
    error?: string;
}

const DEFAULT_CODE =
    '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeArena!";\n    return 0;\n}';

const LANGUAGE_TEMPLATES: Record<string, string> = {
    cpp: DEFAULT_CODE,
    javascript: 'console.log("Hello, CodeArena!");',
    python: 'print("Hello, CodeArena!")',
};

function Room() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const modelRef = useRef<Monaco.editor.ITextModel | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);
    const providerRef = useRef<WebsocketProvider | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const initializedRef = useRef(false);

    const [language, setLanguage] = useState("cpp");
    const [output, setOutput] = useState(
        "Your program output will appear here."
    );
    const [isRunning, setIsRunning] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isSynced, setIsSynced] = useState(false);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [roomError, setRoomError] = useState("");

    // Socket.IO is retained for room membership and participants.
    useEffect(() => {
        if (!roomId) {
            setRoomError("Room ID is missing.");
            return;
        }

        const socket = io("http://localhost:5000");
        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
            setRoomError("");

            socket.emit("join-room", {
                roomId,
                username: `Coder-${Math.random().toString(36).slice(2, 7)}`,
            });
        });

        socket.on("disconnect", () => {
            setIsConnected(false);
        });

        socket.on("connect_error", () => {
            setIsConnected(false);
            setRoomError("Unable to connect to the room server.");
        });

        socket.on("room-error", (message: string) => {
            setRoomError(message);
        });

        socket.on(
            "participants-updated",
            (updatedParticipants: Participant[]) => {
                setParticipants(updatedParticipants);
            }
        );

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [roomId]);

    // Create a shared Yjs document and bind it to Monaco.
    const handleEditorMount: OnMount = (editor) => {
        if (!roomId || initializedRef.current) return;

        initializedRef.current = true;

        const model = editor.getModel();

        if (!model) {
            setRoomError("Unable to initialize the code editor.");
            initializedRef.current = false;
            return;
        }

        editorRef.current = editor;
        modelRef.current = model;

        const ydoc = new Y.Doc();

        const provider = new WebsocketProvider(
            "ws://localhost:1234",
            `codearena-${roomId}`,
            ydoc
        );

        const ytext = ydoc.getText("monaco");

        ydocRef.current = ydoc;
        providerRef.current = provider;
        // Save Yjs editor changes to MongoDB through the backend.
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const handleYjsUpdate = () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
        const socket = socketRef.current;

        if (!socket?.connected || !roomId) {
            return;
        }

        socket.emit("save-code", {
            roomId,
            code: ytext.toString(),
            language:
                modelRef.current?.getLanguageId() === "javascript"
                    ? "javascript"
                    : modelRef.current?.getLanguageId() === "python"
                      ? "python"
                      : "cpp",
        });
    }, 1000);
};

ydoc.on("update", handleYjsUpdate);

        const binding = new MonacoBinding(
            ytext,
            model,
            new Set([editor]),
            provider.awareness
        );

        bindingRef.current = binding;

        provider.on("status", ({ status }: { status: string }) => {
            setIsSynced(status === "connected");
        });

        provider.on("sync", (synced: boolean) => {
            if (!synced) return;

            // Initialize a new shared document only when it is empty.
            if (ytext.length === 0) {
                ytext.insert(0, DEFAULT_CODE);
            }
        });

        provider.on("connection-error", () => {
            setRoomError(
                "Yjs connection failed. Check that its WebSocket server is running on port 1234."
            );
        });
    };

    useEffect(() => {
        return () => {
            bindingRef.current?.destroy();
            providerRef.current?.destroy();
            ydocRef.current?.destroy();

            bindingRef.current = null;
            providerRef.current = null;
            ydocRef.current = null;
            editorRef.current = null;
            modelRef.current = null;
            initializedRef.current = false;
        };
    }, [roomId]);

    async function runCode() {
        if (isRunning) return;

        const code = editorRef.current?.getValue() ?? "";

        if (!code.trim()) {
            setOutput("Error: Please enter some code before running.");
            return;
        }

        setIsRunning(true);
        setOutput("Running your code...\nPlease wait.");

        try {
            const response = await API.post<ExecutionResult>("/execute", {
                code,
                language,
                stdin: "",
            });

            const result = response.data;

            if (!result.success) {
                setOutput(result.error || "Code execution failed.");
                return;
            }

            const lines = [
                `Status: ${result.status || "Unknown"}`,
                "",
            ];

            if (result.stdout) {
                lines.push("Output:", result.stdout.trimEnd(), "");
            }

            if (result.stderr) {
                lines.push("Runtime Error:", result.stderr.trimEnd(), "");
            }

            if (result.compile_output) {
                lines.push(
                    "Compilation Error:",
                    result.compile_output.trimEnd(),
                    ""
                );
            }

            if (
                !result.stdout &&
                !result.stderr &&
                !result.compile_output
            ) {
                lines.push("Program produced no output.", "");
            }

            if (result.time != null) {
                lines.push(`Execution Time: ${result.time} seconds`);
            }

            if (result.memory != null) {
                lines.push(`Memory Used: ${result.memory} KB`);
            }

            setOutput(lines.join("\n").trim());
        } catch (error: unknown) {
            console.error("Execution error:", error);

            setOutput(
                "Code execution failed. Check that the backend and Judge0 service are running."
            );
        } finally {
            setIsRunning(false);
        }
    }

    function changeLanguage(nextLanguage: string) {
        if (nextLanguage === language) return;

        setLanguage(nextLanguage);

        const editor = editorRef.current;

        if (editor) {
            const model = editor.getModel();

            if (model) {
                model.setValue(LANGUAGE_TEMPLATES[nextLanguage]);
            }
        }
    }

    async function copyInvitationLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            alert("Room invitation link copied!");
        } catch {
            alert("Unable to copy the link. Copy it from the address bar.");
        }
    }

    return (
        <div className="room-page">
            <header className="room-header">
                <button
                    className="room-logo"
                    onClick={() => navigate("/")}
                >
                    <span>&lt;/&gt;</span> CodeArena
                </button>

                <div className="room-info">
                    <span
                        className="room-status-dot"
                        style={{
                            background: isConnected ? "#4ade80" : "#f87171",
                        }}
                    />
                    {isConnected ? "Connected" : "Disconnected"}
                    {" · "}Room: {roomId}
                </div>

                <button
                    className="leave-button"
                    onClick={() => navigate("/")}
                >
                    Leave Room
                </button>
            </header>

            {roomError && (
                <div
                    role="alert"
                    style={{
                        padding: "10px 20px",
                        color: "#fca5a5",
                        background: "#2a1118",
                    }}
                >
                    {roomError}
                </div>
            )}

            <main className="room-layout">
                <aside className="room-sidebar">
                    <p className="sidebar-label">COLLABORATION ROOM</p>
                    <h2>Practice Together</h2>

                    <div className="room-detail-card">
                        <span>ROOM ID</span>
                        <strong>{roomId}</strong>

                        <button onClick={copyInvitationLink}>
                            Copy invitation link
                        </button>
                    </div>

                    <div className="participants-section">
                        <p className="sidebar-label">
                            PARTICIPANTS ({participants.length})
                        </p>

                        {participants.map((participant) => (
                            <div
                                className="participant"
                                key={participant.id}
                            >
                                <span className="avatar">
                                    {participant.username
                                        .charAt(0)
                                        .toUpperCase()}
                                </span>

                                <span>{participant.username}</span>
                                <span className="online-label">Online</span>
                            </div>
                        ))}

                        {participants.length === 0 && (
                            <p className="participant-note">
                                Waiting for participants...
                            </p>
                        )}
                    </div>

                    <div className="sidebar-bottom">
                        <span
                            className="room-status-dot"
                            style={{
                                background: isSynced ? "#4ade80" : "#facc15",
                            }}
                        />
                        {isSynced
                            ? "Collaborative editing connected"
                            : "Connecting collaborative editor..."}
                    </div>
                </aside>

                <section className="editor-section">
                    <div className="editor-toolbar">
                        <div>
                            <span className="file-icon">◆</span>
                            <span>
                                {language === "cpp"
                                    ? "main.cpp"
                                    : language === "javascript"
                                      ? "main.js"
                                      : "main.py"}
                            </span>
                        </div>

                        <select
                            value={language}
                            onChange={(event) =>
                                changeLanguage(event.target.value)
                            }
                            disabled={isRunning}
                            aria-label="Programming language"
                        >
                            <option value="cpp">C++</option>
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                        </select>
                    </div>

                    <div className="monaco-container">
                        <Editor
                            height="100%"
                            language={language}
                            theme="vs-dark"
                            defaultValue={DEFAULT_CODE}
                            onMount={handleEditorMount}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                automaticLayout: true,
                                scrollBeyondLastLine: false,
                                padding: { top: 16 },
                            }}
                        />
                    </div>

                    <div className="editor-actions">
                        <span className="editor-hint">
                            {isSynced
                                ? "Changes synchronize through Yjs."
                                : "Connecting to the shared document..."}
                        </span>

                        <button
                            className="run-button"
                            onClick={runCode}
                            disabled={isRunning}
                        >
                            {isRunning ? "⏳ Running..." : "▶ Run Code"}
                        </button>
                    </div>

                    <section className="output-section">
                        <div className="output-header">
                            <span>TERMINAL / OUTPUT</span>

                            <button
                                onClick={() =>
                                    setOutput(
                                        "Your program output will appear here."
                                    )
                                }
                                disabled={isRunning}
                            >
                                Clear
                            </button>
                        </div>

                        <pre className="output-content">{output}</pre>
                    </section>
                </section>
            </main>
        </div>
    );
}

export default Room;

