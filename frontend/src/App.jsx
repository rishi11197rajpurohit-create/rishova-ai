import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "./App.css";

const AUTH_API = "[https://rishova-auth-backend.onrender.com/api/auth](https://rishova-auth-backend.onrender.com/api/auth)";
const AI_API = "[https://rishova-ai-backend.onrender.com/api/ai](https://rishova-ai-backend.onrender.com/api/ai)";

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
  const [selectedFile, setSelectedFile] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "नमस्ते! मैं **RISHOVA AI** हूँ। आप मुझसे डायग्राम बनवा सकते हैं, PDF फाइल एनालाइज करवा सकते हैं, या पूरा सॉफ्टवेयर/कोड बिल्ड करवा सकते हैं।",
      intent: "CHAT"
    }
  ]);
  const [loading, setLoading] = useState(false);
  
  // Right Workspace State
  const [activeTab, setActiveTab] = useState("canvas"); // 'canvas' or 'code'
  const [activeDiagram, setActiveDiagram] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [activeLang, setActiveLang] = useState("javascript");
  const [zoomLevel, setZoomLevel] = useState(1);

  const diagramRef = useRef(null);
  const chatBottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (activeTab === "canvas" && activeDiagram && diagramRef.current) {
      diagramRef.current.removeAttribute("data-processed");
      diagramRef.current.innerHTML = activeDiagram;
      mermaid.init(undefined, diagramRef.current).catch((err) => {
        console.error("Mermaid render error:", err);
      });
    }
  }, [activeDiagram, activeTab]);

  useEffect(() => {
    if (activeTab === "code" && activeCode) {
      Prism.highlightAll();
    }
  }, [activeCode, activeTab]);

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
    if ((!inputPrompt.trim() && !selectedFile) || loading) return;

    const userText = inputPrompt || (selectedFile ? `Analyze file: ${selectedFile.name}` : "");
    const fileToUpload = selectedFile;
    
    setInputPrompt("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userText, attachedFile: fileToUpload ? fileToUpload.name : null }
    ]);
    setLoading(true);

    try {
      let res, data;
      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("prompt", userText);

        res = await fetch(`${AI_API}/document`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`${AI_API}/universal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userText }),
        });
      }

      const rawText = await res.text();
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error(`Server returned non-JSON response: ${rawText.slice(0, 100)}...`);
      }

      if (!res.ok) throw new Error(data.detail || data.message || "AI Processing Error");

      const responseData = data.data || {};

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: responseData.markdown_response || "",
          intent: data.intent,
          mermaid: responseData.mermaid || "",
          code_snippet: responseData.code_snippet || "",
          language: responseData.language || "javascript",
          commands: responseData.commands || []
        }
      ]);

      if (data.intent === "DIAGRAM" && responseData.mermaid) {
        setActiveDiagram(responseData.mermaid);
        setActiveTab("canvas");
        setZoomLevel(1);
      } else if (data.intent === "BUILDER" && responseData.code_snippet) {
        setActiveCode(responseData.code_snippet);
        setActiveLang(responseData.language || "javascript");
        setActiveTab("code");
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
    setActiveTab("canvas");
    setZoomLevel(1);
  };

  const openInCodeViewer = (code, lang) => {
    setActiveCode(code);
    setActiveLang(lang || "javascript");
    setActiveTab("code");
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
                {m.attachedFile && (
                  <div className="file-badge">📎 {m.attachedFile}</div>
                )}
                
                <div className="message-body markdown-content">
                  {m.role === "user" ? (
                    <p>{m.content}</p>
                  ) : (
                    <ReactMarkdown remarkPlugins="{[remarkGfm]}">
                      {m.content}
                    </ReactMarkdown>
                  )}
                </div>

                {m.mermaid && (
                  <button className="view-diagram-btn" onClick={() => openInCanvas(m.mermaid)}>
                    📊 Focus & View Diagram in Canvas
                  </button>
                )}

                {m.code_snippet && (
                  <button className="view-code-btn" onClick={() => openInCodeViewer(m.code_snippet, m.language)}>
                    💻 Open Code in Workspace Viewer
                  </button>
                )}

                {m.commands && m.commands.length > 0 && (
                  <div className="cmd-box">
                    <div className="cmd-header">
                      <span>⚡ Terminal Commands</span>
                      <button onClick={() => copyToClipboard(m.commands.join("\n"))}>Copy Command</button>
                    </div>
                    <pre>{m.commands.join("\n")}</pre>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="chat-message assistant loading">⚡ Rishova AI is orchestrating & building...</div>}
            <div ref={chatBottomRef} />
          </div>

          {selectedFile && (
            <div className="selected-file-preview">
              <span>📎 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              <button onClick={() => setSelectedFile(null)}>✖</button>
            </div>
          )}

          <form className="chat-input-area" onSubmit={handleSendPrompt}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".pdf,.txt,.md,.js,.py,.json,.csv"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                }
              }}
            />
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload PDF or Document"
            >
              📎
            </button>
            <input
              type="text"
              placeholder={selectedFile ? "Ask a question about this file..." : "Ask anything, build an app, generate diagrams..."}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || (!inputPrompt.trim() && !selectedFile)}>Send</button>
          </form>
        </div>

        <div className="preview-panel">
          <div className="panel-header">
            <div className="tab-switchers">
              <button
                className={`tab-btn ${activeTab === "canvas" ? "active" : ""}`}
                onClick={() => setActiveTab("canvas")}
              >
                🎨 Canvas & Architecture
              </button>
              <button
                className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
                onClick={() => setActiveTab("code")}
              >
                💻 Code Workspace
              </button>
            </div>

            {activeTab === "canvas" && activeDiagram && (
              <div className="canvas-controls">
                <button className="action-btn" onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.2))}>🔍 -</button>
                <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
                <button className="action-btn" onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}>🔍 +</button>
                <button className="action-btn download-btn" onClick={downloadSVG}>⬇ SVG</button>
                <button className="action-btn" onClick={() => copyToClipboard(activeDiagram)}>📋 Copy</button>
              </div>
            )}

            {activeTab === "code" && activeCode && (
              <div className="canvas-controls">
                <span className="lang-badge">{activeLang.toUpperCase()}</span>
                <button className="action-btn download-btn" onClick={() => copyToClipboard(activeCode)}>📋 Copy Code</button>
              </div>
            )}
          </div>

          <div className="workspace-content">
            {activeTab === "canvas" ? (
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
                    <span>Ask Rishova to generate a diagram or architecture flow.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="code-viewer-area">
                {activeCode ? (
                  <pre className="code-pre">
                    <code className={`language-${activeLang}`}>
                      {activeCode}
                    </code>
                  </pre>
                ) : (
                  <div className="canvas-placeholder">
                    <p>💻 Software Workspace Ready</p>
                    <span>Ask Rishova AI to create a component, API, or full application script to view and edit code here.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}