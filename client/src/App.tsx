
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Room from "./pages/room";


import { useEffect, useState } from "react";
import API from "./services/api";
import "./App.css";

function Home() {
    const [backendStatus, setBackendStatus] = useState("Connecting...");
    const [roomId, setRoomId] = useState("");

    useEffect(() => {
        API.get("/health")
            .then((response) => {
                setBackendStatus(response.data.message);
            })
            .catch(() => {
                setBackendStatus("Backend disconnected");
            });
    }, []);

    function createRoom() {
        const newRoomId = crypto.randomUUID().slice(0, 8).toUpperCase();

        window.location.href = `/room/${newRoomId}`;
    }

    function joinRoom() {
        const id = roomId.trim();

        if (!id) {
            alert("Please enter a room ID.");
            return;
        }

        window.location.href = `/room/${encodeURIComponent(id)}`;
    }

    return (
        <div className="app">
            <nav className="navbar">
                <a className="logo" href="/">
                    <span className="logo-icon">&lt;/&gt;</span>
                    CodeArena
                </a>

                <div className="nav-links">
                    <a href="#problems">Problems</a>
                    <a href="#collaborate">Collaborate</a>
                    <a href="#about">About</a>
                </div>

                <div className="nav-status">
                    <span className="status-dot"></span>
                    {backendStatus === "Backend disconnected"
                        ? "Offline"
                        : backendStatus === "Connecting..."
                          ? "Connecting"
                          : "System Online"}
                </div>
            </nav>

            <main>
                <section className="hero" id="about">
                    <div className="hero-badge">
                        <span>✦</span> CODE TOGETHER. BUILD TOGETHER.
                    </div>

                    <h1>
                        Where Developers
                        <br />
                        <span>Build Together.</span>
                    </h1>

                    <p className="hero-description">
                        Solve DSA problems, collaborate in real time, and
                        sharpen your coding skills with developers around
                        the world.
                    </p>

                    <div className="hero-actions" id="collaborate">
                        <button
                            className="primary-button"
                            onClick={createRoom}
                        >
                            Create Coding Room ↗
                        </button>

                        <a className="secondary-button" href="#problems">
                            Explore Problems ↓
                        </a>
                    </div>

                    <div className="hero-note">
                        Built for developers who learn by solving problems.
                    </div>
                </section>

                <section className="workspace">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">YOUR WORKSPACE</p>
                            <h2>Ready to start coding?</h2>
                        </div>

                        <span className="live-label">
                            <span className="status-dot"></span>
                            Live workspace
                        </span>
                    </div>

                    <div className="workspace-grid">
                        <article className="feature-card create-card">
                            <div className="card-icon purple-icon">
                                &lt;/&gt;
                            </div>

                            <h3>Create a Room</h3>

                            <p>
                                Start a collaborative coding session and
                                invite your friends to solve problems together.
                            </p>

                            <button
                                className="card-button"
                                onClick={createRoom}
                            >
                                Create new room →
                            </button>
                        </article>

                        <article className="feature-card join-card">
                            <div className="card-icon blue-icon">↗</div>

                            <h3>Join a Room</h3>

                            <p>
                                Have a room ID? Enter it below to join
                                an existing coding session.
                            </p>

                            <form
                                className="join-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    joinRoom();
                                }}
                            >
                                <input
                                    value={roomId}
                                    onChange={(event) =>
                                        setRoomId(event.target.value)
                                    }
                                    placeholder="Enter room ID"
                                    aria-label="Room ID"
                                />

                                <button type="submit">Join →</button>
                            </form>
                        </article>
                    </div>
                </section>

                <section className="problems-section" id="problems">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">PRACTICE MAKES PROGRESS</p>
                            <h2>Explore DSA Problems</h2>
                        </div>

                        <span className="coming-soon">Coming next</span>
                    </div>

                    <div className="problem-grid">
                        <article className="problem-card">
                            <span className="difficulty easy">EASY</span>
                            <h3>Two Sum</h3>
                            <p>Arrays · Hashing</p>
                            <span className="problem-arrow">↗</span>
                        </article>

                        <article className="problem-card">
                            <span className="difficulty medium">MEDIUM</span>
                            <h3>Number of Islands</h3>
                            <p>Graphs · DFS · BFS</p>
                            <span className="problem-arrow">↗</span>
                        </article>

                        <article className="problem-card">
                            <span className="difficulty medium">MEDIUM</span>
                            <h3>Course Schedule</h3>
                            <p>Graphs · Topological Sort</p>
                            <span className="problem-arrow">↗</span>
                        </article>
                    </div>
                </section>
            </main>

            <footer>
                <a className="logo footer-logo" href="/">
                    <span className="logo-icon">&lt;/&gt;</span>
                    CodeArena
                </a>

                <p>Practice together. Think deeper. Code better.</p>

                <span>Built with React and Node.js</span>
            </footer>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/room/:roomId" element={<Room />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;

