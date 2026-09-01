import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import mermaid from "mermaid";
import "./App.css";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});

const AUTH_API = "http://localhost:5000/api/auth";
const DIAGRAM_API = "http://localhost:5000/api/diagrams";
const AI_API = "http://localhost:8000/api/ai";

export default function App() {
  const [user, setUser] = useState(null);
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [authMsg, setAuthMsg] = useState("");

  // Tabs: 'prompt', 'code', 'history'
  const [activeTab, setActiveTab] = useState("prompt");
  const [prompt, setPrompt] = useState(
    "Customer selects restaurant -> Browses menu -> Adds items to cart -> Makes payment -> If payment fails: show retry -> If success: Restaurant accepts order -> Food prepared -> Driver assigned -> Live GPS tracking -> Food delivered -> Customer rates order"
  );
  const [mermaidCode, setMermaidCode] = useState("");
  const [diagramSvg, setDiagramSvg] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [saveStatus, setSaveStatus] = useState("");

  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("rishova_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      fetchHistory();
    }
  }, []);

  const getHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("rishova_token")}` },
  });

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${DIAGRAM_API}/history`, getHeaders());
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthMsg("");
    try {
      if (isRegister) {
        await axios.post(`${AUTH_API}/register`, formData);
        setAuthMsg("Registration successful! Please login.");
        setIsRegister(false);
      } else {
        const res = await axios.post(`${AUTH_API}/login`, {
          email: formData.email,
          password: formData.password,
        });
        localStorage.setItem("rishova_token", res.data.token);
        localStorage.setItem("rishova_user", JSON.stringify(res.data.user));
        setUser(res.data.user);
        setTimeout(fetchHistory, 300);
      }
    } catch (err) {
      setAuthMsg(err.response?.data?.error || "An error occurred.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("rishova_token");
    localStorage.removeItem("rishova_user");
    setUser(null);
  };

  const renderMermaid = async (code) => {
    if (!code || !code.trim()) return;
    try {
      const id = "mermaid-" + Math.random().toString(36).substring(2, 9);
      const { svg } = await mermaid.render(id, code);
      setDiagramSvg(svg);
      setErrorMsg("");
    } catch (err) {
      setErrorMsg("Mermaid Syntax Error: Check live editor code.");
    }
  };

  const generateDiagram = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorMsg("");
    setDiagramSvg("");

    try {
      const res = await axios.post(`${AI_API}/diagram`, { prompt });
      const code = res.data.mermaid;
      setMermaidCode(code);
      await renderMermaid(code);
      resetZoomPan();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.message || "Failed to generate diagram");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setMermaidCode(newCode);
    renderMermaid(newCode);
  };

  const saveDiagramToDB = async () => {
    if (!mermaidCode) return;
    setSaveStatus("Saving...");
    try {
      const title = prompt.slice(0, 35) + "...";
      await axios.post(
        `${DIAGRAM_API}/save`,
        { title, prompt, mermaid_code: mermaidCode },
        getHeaders()
      );
      setSaveStatus("Saved!");
      fetchHistory();
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      setSaveStatus("Failed to save");
    }
  };

  const loadFromHistory = (item) => {
    setPrompt(item.prompt);
    setMermaidCode(item.mermaid_code);
    renderMermaid(item.mermaid_code);
    resetZoomPan();
  };

  // Zoom & Pan Handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 0.1;
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev + zoomFactor, 3));
    } else {
      setScale((prev) => Math.max(prev - zoomFactor, 0.4));
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetZoomPan = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Exports
  const downloadSVG = () => {
    if (!diagramSvg) return;
    const blob = new Blob([diagramSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rishova-diagram-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = () => {
    const svgElement = document.querySelector(".diagram-plane svg");
    if (!svgElement) {
      alert("No diagram available to export!");
      return;
    }

    try {
      const rect = svgElement.getBoundingClientRect();
      const width = Math.max(rect.width || 800, 800);
      const height = Math.max(rect.height || 600, 600);

      const clonedSvg = svgElement.cloneNode(true);
      clonedSvg.setAttribute("width", width);
      clonedSvg.setAttribute("height", height);

      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const base64Data = btoa(unescape(encodeURIComponent(svgData)));
      const imageSrc = "data:image/svg+xml;base64," + base64Data;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2;
        canvas.height = height * 2;

        const ctx = canvas.getContext("2d");
        ctx.scale(2, 2);

        // Dark background
        ctx.fillStyle = "#07090e";
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);

        const pngUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `rishova-diagram-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };

      img.src = imageSrc;
    } catch (err) {
      console.error("Export PNG Error:", err);
      alert("Export PNG failed. Please use Export SVG.");
    }
  };

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>{isRegister ? "Create Rishova Account" : "Login to Rishova AI"}</h2>
          {authMsg && <p style={{ color: "#38bdf8", marginBottom: 10 }}>{authMsg}</p>}
          <form onSubmit={handleAuth}>
            {isRegister && (
              <input
                type="text"
                placeholder="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
            <button type="submit">{isRegister ? "Register" : "Login"}</button>
          </form>
          <div className="toggle-link" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? (
              <>Already have an account? <span>Login</span></>
            ) : (
              <>Don't have an account? <span>Register</span></>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="navbar">
        <h2 style={{ color: "#38bdf8", fontSize: 18 }}>Rishova AI Studio</h2>
        <div>
          <span style={{ marginRight: 15, color: "#94a3b8" }}>{user.name}</span>
          <button onClick={handleLogout} className="btn-action" style={{ background: "#ef4444", borderColor: "#ef4444" }}>
            Logout
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-panel">
          <div className="panel-tabs">
            <button
              className={`tab-btn ${activeTab === "prompt" ? "active" : ""}`}
              onClick={() => setActiveTab("prompt")}
            >
              AI Prompt
            </button>
            <button
              className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
              onClick={() => setActiveTab("code")}
            >
              Live Editor
            </button>
            <button
              className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              History ({history.length})
            </button>
          </div>

          {activeTab === "prompt" && (
            <div className="tab-content">
              <label style={{ fontSize: 12, fontWeight: "bold", color: "#94a3b8" }}>Requirements / Architecture Prompt:</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your diagram flow..."
              />
              <button
                onClick={generateDiagram}
                disabled={loading}
                className="btn-action btn-primary"
                style={{ padding: 12 }}
              >
                {loading ? "Generating AI Diagram..." : "Generate AI Diagram"}
              </button>
              {errorMsg && <p style={{ color: "#ef4444", fontSize: 12 }}>{errorMsg}</p>}
            </div>
          )}

          {activeTab === "code" && (
            <div className="tab-content">
              <label style={{ fontSize: 12, fontWeight: "bold", color: "#94a3b8" }}>Mermaid.js Source Code (Live Edit):</label>
              <textarea
                value={mermaidCode}
                onChange={handleCodeChange}
                placeholder="graph TD&#10;A[Start] --> B[End]"
              />
            </div>
          )}

          {activeTab === "history" && (
            <div className="tab-content">
              <label style={{ fontSize: 12, fontWeight: "bold", color: "#94a3b8" }}>Saved Diagrams:</label>
              {history.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: 13 }}>No diagrams saved yet.</p>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="history-item" onClick={() => loadFromHistory(item)}>
                    <div>
                      <div className="history-item-title">{item.title}</div>
                      <div className="history-item-date">{new Date(item.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>

        <main className="viewer-container">
          <div className="toolbar">
            <div className="controls-group">
              <button className="btn-action" onClick={() => setScale((s) => Math.min(s + 0.15, 3))}>Zoom In (+)</button>
              <button className="btn-action" onClick={() => setScale((s) => Math.max(s - 0.15, 0.4))}>Zoom Out (-)</button>
              <button className="btn-action" onClick={resetZoomPan}>Reset View</button>
              <span style={{ fontSize: 12, color: "#64748b" }}>{Math.round(scale * 100)}%</span>
            </div>

            <div className="controls-group">
              {diagramSvg && (
                <>
                  <button className="btn-action btn-success" onClick={saveDiagramToDB}>
                    {saveStatus || "Save to History"}
                  </button>
                  <button className="btn-action" onClick={downloadSVG}>Export SVG</button>
                  <button className="btn-action btn-primary" onClick={downloadPNG}>Export PNG</button>
                </>
              )}
            </div>
          </div>

          <div
            className="canvas-viewport"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            ref={canvasRef}
          >
            <div
              className="diagram-plane"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              }}
            >
              {diagramSvg ? (
                <div dangerouslySetInnerHTML={{ __html: diagramSvg }} />
              ) : (
                <p style={{ color: "#475569" }}>
                  {loading ? "Generating Diagram..." : "Canvas is ready. Generate or load a diagram."}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}