import React, { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import "./App.css";

const AUTH_API = "https://rishova-auth-backend.onrender.com/api/auth";
const AI_API = "https://rishova-ai-backend.onrender.com/api/ai";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});

export default function App() {
  const getCleanUserName = () => {
    const raw = localStorage.getItem("rishova_user");
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" ? parsed.name || "User" : parsed;
    } catch {
      return raw;
    }
  };

  const [token, setToken] = useState(localStorage.getItem("rishova_token") || null);
  const [userName, setUserName] = useState(getCleanUserName());
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authMsg, setAuthMsg] = useState("");

  const [inputPrompt, setInputPrompt] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "नमस्ते! मैं **RISHOVA AI** हूँ। आप मुझसे कुछ भी पूछ सकते हैं — जैसे 'Create an E-Commerce Architecture Diagram', 'Teach me Python Loops from zero', या 'Build a Node.js Auth API'।",
      intent: "CHAT"
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [activeDiagram, setActiveDiagram] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);

  const diagramRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (activeDiagram && diagramRef.current) {
      diagramRef.current.removeAttribute("data-processed");
      diagramRef.current.innerHTML = activeDiagram;
      mermaid.init(undefined, diagramRef.current).catch((err) => {
        console.error("Mermaid render error:", err);
      });
    }
  }, [activeDiagram]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthMsg("");
    const endpoint = isRegister ? `${AUTH_API}/register` : `${AUTH_API}/login`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Auth Error");

      if (isRegister) {
        setAuthMsg("अकाउंट बन गया! अब लॉगिन करें।");
        setIsRegister(false);
      } else {
        const cleanName = data.user && typeof data.user === "object" ? data.user.name : (data.user || "User");
        localStorage.setItem("rishova_token", data.token);
        localStorage.setItem("rishova_user", cleanName);
        setToken(data.token);
        setUserName(cleanName);
      }
    } catch (err) {
      setAuthMsg(err.message);
    }
  };

  const handleSendPrompt = async (e) => {
    e.preventDefault();
    if (!inputPrompt.trim() || loading) return;

    const userText = inputPrompt;
    setInputPrompt("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setLoading(true);

    try {
      const res = await fetch(`${AI_API}/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "AI Processing Error");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.data.markdown_response,
          intent: data.intent,
          mermaid: data.data.mermaid,
          commands: data.data.commands
        }
      ]);

      if (data.intent === "DIAGRAM" && data.data.mermaid) {
        setActiveDiagram(data.data.mermaid);
        setZoomLevel(1);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${err.message}`, intent: "CHAT" }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const openInCanvas = (mermaidCode) => {
    setActiveDiagram(mermaidCode);
    setZoomLevel(1);
    const canvasEl = document.querySelector(".canvas-area");
    if (canvasEl) {
      canvasEl.scrollTop = 0;
      canvasEl.scrollLeft = 0;
    }
  };

  const downloadSVG = () => {
    if (!diagramRef.current) return;
    const svgElement = diagramRef.current.querySelector("svg");
    if (!svgElement) {
      alert("No rendered diagram found to download!");
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rishova-diagram.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-box">
          <h2>{isRegister ? "Create Rishova Account" : "Login to Rishova AI"}</h2>
          {authMsg && <p className="auth-msg">{authMsg}</p>}
          <form onSubmit={handleAuthSubmit}>
            {isRegister && (
              <input
                type="text"
                placeholder="Full Name"
                value={authForm.name}
                onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email Address"
              value={authForm.email}
              onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
              required
            />
            <button type="submit">{isRegister ? "Register" : "Login"}</button>
          </form>
          <button className="switch-btn" onClick={() => { setIsRegister(!isRegister); setAuthMsg(""); }}>
            {isRegister ? "Already have an account? Login" : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-title">
          <h1>RISHOVA AI</h1>
          <span className="badge">Universal Workspace</span>
        </div>
        <div className="user-section">
          <span>{userName}</span>
          <button className="logout-btn" onClick={() => { localStorage.clear(); setToken(null); }}>Logout</button>
        </div>
      </header>

      <div className="main-content">
        <div className="chat-panel">
          <div className="chat-history">
            {messages.map((m, idx) => (
              <div key={idx} className={`chat-message ${m.role}`}>
                <div className="message-header">
                  <strong>{m.role === "user" ? "You" : "Rishova AI"}</strong>
                  {m.intent && <span className="intent-tag">{m.intent}</span>}
                </div>
                <div className="message-body" style={{ whiteSpace: "pre-wrap" }}>
                  {m.content}
                </div>

                {m.mermaid && (
                  <button className="view-diagram-btn" onClick={() => openInCanvas(m.mermaid)}>
                    📊 Focus & Reset Canvas
                  </button>
                )}

                {m.commands && m.commands.length > 0 && (
                  <div className="cmd-box">
                    <div className="cmd-header">
                      <span>Terminal Commands</span>
                      <button onClick={() => copyToClipboard(m.commands.join("\n"))}>Copy Command</button>
                    </div>
                    <pre>{m.commands.join("\n")}</pre>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="chat-message assistant loading">⚡ Rishova AI is thinking & orchestrating...</div>}
            <div ref={chatBottomRef} />
          </div>

          <form className="chat-input-area" onSubmit={handleSendPrompt}>
            <input
              type="text"
              placeholder="Ask anything, build software, learn concepts, or generate diagrams..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !inputPrompt.trim()}>Send</button>
          </form>
        </div>

        <div className="preview-panel">
          <div className="panel-header">
            <h3>Visual & Canvas Workspace</h3>
            {activeDiagram && (
              <div className="canvas-controls">
                <button className="action-btn" onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.2))}>🔍 -</button>
                <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
                <button className="action-btn" onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}>🔍 +</button>
                <button className="action-btn download-btn" onClick={downloadSVG}>⬇ SVG</button>
                <button className="action-btn" onClick={() => copyToClipboard(activeDiagram)}>📋 Copy</button>
              </div>
            )}
          </div>
          <div className="canvas-area">
            {activeDiagram ? (
              <div
                ref={diagramRef}
                className="mermaid-wrapper"
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center", transition: "transform 0.2s ease" }}
              />
            ) : (
              <div className="canvas-placeholder">
                <p>🎨 Interactive Canvas is Ready</p>
                <span>Ask Rishova to generate a diagram or architecture flow to see it rendered live here.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}