import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import Editor from "@monaco-editor/react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "./App.css";

const AUTH_API = "https://rishova-auth-backend.onrender.com/api/auth";
const AI_BACKEND = "https://rishova-ai-backend.onrender.com";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true,
});

const PROMPT_TEMPLATES = [
  {
    category: "🎨 AI Image Studio",
    title: "Cyberpunk Developer Workspace",
    prompt: "Generate image of an Indian developer coding in a futuristic cyber studio at night with neon lights and holographic screens."
  },
  {
    category: "🏗️ System Architecture",
    title: "Microservices Flowchart",
    prompt: "Design a complete scalable Microservices Architecture for an E-Commerce application with API Gateway, Auth Service, Redis Cache, and Kafka message broker in ```mermaid graph TD."
  },
  {
    category: "💻 Full-Stack Web App",
    title: "Interactive Kanban Board",
    prompt: "Build a single-file interactive Kanban Task Management Board with HTML, CSS, and vanilla JavaScript. Include drag-and-drop support, local storage persistence, and modern dark styling."
  },
  {
    category: "🧠 DSA Algorithms",
    title: "0/1 Knapsack Problem",
    prompt: "Write a complete Python implementation of 0/1 Knapsack Problem with both Top-Down Memoization and Bottom-Up Tabulation."
  }
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("rishova_token") || null);
  const [userName, setUserName] = useState(localStorage.getItem("rishova_user") || "User");
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authMsg, setAuthMsg] = useState("");

  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem("rishova_sessions");
    return saved ? JSON.parse(saved) : [{
      id: "default-session",
      title: "New Project",
      messages: [{
        role: "assistant",
        content: "राम राम सा! Welcome to **RISHOVA AI Universal Studio**.\nBuild software, generate high-res AI images, or design system architectures.",
        intent: "CHAT"
      }],
      workspaceFiles: {},
      selectedFileName: "",
      activeDiagram: ""
    }];
  });

  const [activeSessionId, setActiveSessionId] = useState("default-session");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const [inputPrompt, setInputPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("code");

  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const [isRunOutputVisible, setIsRunOutputVisible] = useState(false);
  const pyodideRef = useRef(null);

  const diagramRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("rishova_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, loading]);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      if (activeTab === "canvas" && activeSession?.activeDiagram && diagramRef.current) {
        try {
          let code = activeSession.activeDiagram.trim();
          if (!code.startsWith("graph") && !code.startsWith("flowchart")) {
            code = "graph TD\n" + code;
          }
          const { svg } = await mermaid.render(`mermaid-${Date.now()}`, code);
          if (isMounted && diagramRef.current) diagramRef.current.innerHTML = svg;
        } catch {
          if (isMounted && diagramRef.current) {
            diagramRef.current.innerHTML = `<div style="color:#f87171;padding:12px;">⚠️ Rendering Architecture Diagram...</div>`;
          }
        }
      }
    };
    renderDiagram();
    return () => { isMounted = false; };
  }, [activeSession?.activeDiagram, activeTab]);

  const handleExecuteCode = async () => {
    const file = activeSession.workspaceFiles[activeSession.selectedFileName];
    if (!file || !file.code) return;

    setIsRunningCode(true);
    setIsRunOutputVisible(true);
    setRunOutput("⏳ Initializing environment...\n");

    const ext = (activeSession.selectedFileName || "").toLowerCase();
    if (ext.endsWith(".py") || file.language === "python") {
      try {
        if (!pyodideRef.current && window.loadPyodide) {
          setRunOutput("📦 Loading WebAssembly Python...\n");
          pyodideRef.current = await window.loadPyodide();
        }
        pyodideRef.current.setStdout({ batched: (t) => setRunOutput((p) => p + t + "\n") });
        await pyodideRef.current.runPythonAsync(file.code);
        setRunOutput((p) => p + "\n✔ Execution completed successfully.");
      } catch (err) {
        setRunOutput((p) => p + `\n❌ Python Error: ${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    } else {
      try {
        let buff = "";
        const fn = new Function("console", file.code);
        fn({ log: (...a) => { buff += a.join(" ") + "\n"; } });
        setRunOutput(buff || "Execution completed (no console logs).\n");
      } catch (err) {
        setRunOutput(`❌ JS Error: ${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    }
  };

  const triggerPrompt = async (promptText) => {
    if (!promptText.trim()) return;

    const userMsg = { role: "user", content: promptText };
    const updatedMsgs = [...activeSession.messages, userMsg];

    setSessions((prev) =>
      prev.map((s) => s.id === activeSessionId ? { ...s, messages: updatedMsgs } : s)
    );
    setLoading(true);

    // 🎨 1. AI IMAGE GENERATION (Client-Side Instant Rendering - Zero Server 404)
    const isImageQuery = /generate image|create image|draw|photo of|paint|image of|तस्वीर|फोटो/i.test(promptText);
    if (isImageQuery) {
      const cleanPrompt = promptText.replace(/generate image|create image|draw|photo of|paint|an image of|image of|तस्वीर|फोटो|बनाओ/gi, "").trim() || "Futuristic AI Universe";
      const encoded = encodeURIComponent(cleanPrompt);
      const seed = Math.floor(Math.random() * 99999);
      const imgUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}`;

      const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin:0; background:#09090b; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; padding:16px; box-sizing:border-box; }
    .card { background:#18181b; border:1px solid #27272a; border-radius:12px; padding:18px; max-width:640px; width:100%; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.8); }
    img { width:100%; border-radius:8px; display:block; margin:14px 0; border:1px solid #3f3f46; }
    .badge { background:#0284c7; color:#fff; padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:600; text-transform:uppercase; }
    .btn { background:#2563eb; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block; transition:0.2s; }
    .btn:hover { background:#1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">✨ FLUX AI ULTRA HD</span>
    <p style="color:#94a3b8; font-size:0.88rem; margin:10px 0;">"${cleanPrompt}"</p>
    <img src="${imgUrl}" alt="${cleanPrompt}" />
    <a href="${imgUrl}" target="_blank" download="rishova_ai_artwork.jpg" class="btn">⬇ Download Ultra HD Image</a>
  </div>
</body>
</html>`;

      const assistantMsg = {
        role: "assistant",
        content: `### ✨ AI Artwork Generated\n\n![Generated Art](${imgUrl})\n\n**Prompt:** *"${cleanPrompt}"*\n\n👉 *Switch to the **👁️ Preview** tab to inspect and download your image in Ultra HD.*`,
        intent: "IMAGE"
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMsgs, assistantMsg],
                workspaceFiles: { "index.html": { language: "html", code: previewHtml } },
                selectedFileName: "index.html"
              }
            : s
        )
      );
      setActiveTab("preview");
      setLoading(false);
      return;
    }

    // ⚡ 2. BACKEND API INFERENCE
    try {
      const res = await fetch(`${AI_BACKEND}/api/ai/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          model: selectedModel,
          user_email: userName || "guest"
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}. Please ensure backend is deployed.`);
      }

      const raw = await res.json();
      const responseData = raw.data || {};
      const assistantMsg = {
        role: "assistant",
        content: responseData.markdown_response || raw.markdown_response || "Completed",
        intent: raw.intent || "CHAT"
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMsgs, assistantMsg],
                workspaceFiles: responseData.files || {},
                selectedFileName: Object.keys(responseData.files || {})[0] || "",
                activeDiagram: responseData.mermaid || ""
              }
            : s
        )
      );

      if (raw.intent === "DIAGRAM") setActiveTab("canvas");
      else if (Object.keys(responseData.files || {}).length > 0) setActiveTab("code");

    } catch (err) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMsgs, { role: "assistant", content: `❌ Error: ${err.message}`, intent: "CHAT" }]
              }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputPrompt.trim() || loading) return;
    const p = inputPrompt;
    setInputPrompt("");
    triggerPrompt(p);
  };

  const getPreviewContent = () => {
    const file = activeSession?.workspaceFiles?.[activeSession?.selectedFileName];
    return file?.code || `<div style="color:#71717a;text-align:center;padding:50px;font-family:sans-serif;"><h3>⚡ Live Sandbox</h3><p>Generated image cards or apps will render here.</p></div>`;
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-box">
          <h2>{isRegister ? "Create Rishova Account" : "Login to Rishova AI"}</h2>
          {authMsg && <p className="auth-msg">{authMsg}</p>}
          <form onSubmit={async (e) => {
            e.preventDefault();
            const res = await fetch(`${AUTH_API}/${isRegister ? "register" : "login"}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(authForm)
            });
            const d = await res.json();
            if (res.ok) {
              if (isRegister) { setIsRegister(false); setAuthMsg("Account created! Please login."); }
              else {
                localStorage.setItem("rishova_token", d.token);
                localStorage.setItem("rishova_user", d.user?.name || "User");
                setToken(d.token);
                setUserName(d.user?.name || "User");
              }
            } else setAuthMsg(d.message || "Authentication error");
          }}>
            {isRegister && <input type="text" placeholder="Full Name" onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required />}
            <input type="email" placeholder="Email" onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
            <input type="password" placeholder="Password" onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required />
            <button type="submit">{isRegister ? "Register" : "Login"}</button>
          </form>
          <button className="switch-btn" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? "Already have an account? Login" : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <button className="icon-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="logo-title">
            <h1>RISHOVA AI</h1>
            <span className="badge">Universal Studio</span>
          </div>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="model-select-dropdown">
            <option value="llama-3.3-70b-versatile">⚡ Llama 3.3 70B (Architect)</option>
            <option value="gemma2-9b-it">🚀 Gemma 2 9B (Ultra Fast)</option>
          </select>
        </div>
        <div className="user-section" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="cloud-sync-status-btn" onClick={() => setIsTemplatesOpen(true)} style={{ background: "#1e293b", borderColor: "#38bdf8", color: "#38bdf8" }}>
            💡 Templates
          </button>
          <span className="user-name-text">👤 {userName}</span>
          <button className="logout-btn" onClick={() => { localStorage.clear(); setToken(null); }}>Logout</button>
        </div>
      </header>

      {isTemplatesOpen && (
        <div className="settings-modal-overlay" onClick={() => setIsTemplatesOpen(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div className="settings-modal-header">
              <h3>💡 Prompt Templates Library</h3>
              <button className="settings-close-btn" onClick={() => setIsTemplatesOpen(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
              {PROMPT_TEMPLATES.map((tmpl, i) => (
                <div key={i} style={{ background: "#27272a", border: "1px solid #3f3f46", padding: "12px", borderRadius: "8px", cursor: "pointer" }} onClick={() => { setInputPrompt(tmpl.prompt); setIsTemplatesOpen(false); }}>
                  <span style={{ color: "#38bdf8", fontSize: "0.72rem", fontWeight: "600" }}>{tmpl.category}</span>
                  <h4 style={{ margin: "4px 0", color: "#fff", fontSize: "0.95rem" }}>{tmpl.title}</h4>
                  <p style={{ margin: 0, color: "#a1a1aa", fontSize: "0.82rem" }}>{tmpl.prompt.slice(0, 95)}...</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="studio-body-layout">
        {sidebarOpen && (
          <aside className="sessions-sidebar">
            <div className="sidebar-header">
              <button className="new-project-btn" onClick={() => {
                const newId = `session-${Date.now()}`;
                setSessions([{ id: newId, title: "New Project", messages: [{ role: "assistant", content: "New workspace ready.", intent: "CHAT" }], workspaceFiles: {} }, ...sessions]);
                setActiveSessionId(newId);
              }}>+ New Project</button>
            </div>
            <div className="sessions-list">
              {sessions.map((s) => (
                <div key={s.id} className={`session-item ${s.id === activeSessionId ? "active" : ""}`} onClick={() => setActiveSessionId(s.id)}>
                  <span>📁</span>
                  <span className="session-title">{s.title}</span>
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="main-content">
          <div className="chat-panel">
            <div className="chat-history">
              {activeSession.messages.map((m, idx) => (
                <div key={idx} className={`chat-message ${m.role}`}>
                  <div className="message-header">
                    <strong>{m.role === "user" ? "You" : "Rishova AI"}</strong>
                    {m.intent && <span className="intent-tag">{m.intent}</span>}
                  </div>
                  <div className="message-body markdown-content">
                    <ReactMarkdown remarkPlugins="{[remarkGfm]}">
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {loading && <div className="chat-message assistant loading">⚡ Rishova Studio is generating output...</div>}
              <div ref={chatBottomRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSend}>
              <button type="button" className="attach-btn" onClick={() => {
                setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, messages: [{ role: "assistant", content: "Chat cleared.", intent: "CHAT" }], workspaceFiles: {} } : s));
              }} title="Clear Project Messages">🗑️</button>
              <input
                type="text"
                placeholder="Build software, generate image, or ask any question..."
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={loading}
              />
              <button type="submit" disabled={loading || !inputPrompt.trim()}>Send</button>
            </form>
          </div>

          <div className="preview-panel">
            <div className="panel-header">
              <div className="tab-switchers">
                <button className={`tab-btn ${activeTab === "code" ? "active" : ""}`} onClick={() => setActiveTab("code")}>💻 Code</button>
                <button className={`tab-btn ${activeTab === "preview" ? "active" : ""}`} onClick={() => setActiveTab("preview")}>👁️ Preview</button>
                <button className={`tab-btn ${activeTab === "canvas" ? "active" : ""}`} onClick={() => setActiveTab("canvas")}>🎨 Canvas</button>
              </div>
              {activeTab === "code" && Object.keys(activeSession.workspaceFiles).length > 0 && (
                <button className="action-btn" onClick={handleExecuteCode} style={{ background: "#16a34a", color: "#fff", fontWeight: 600 }}>
                  ▶ Run Code
                </button>
              )}
            </div>

            <div className="workspace-content">
              {activeTab === "code" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  {Object.keys(activeSession.workspaceFiles).length > 0 ? (
                    <Editor ""} "'Fira 14, Code', enabled: false fontFamily: fontSize: height="100%" language="javascript" minimap: monospace", options="{{" theme="vs-dark" value="{activeSession.workspaceFiles[activeSession.selectedFileName]?.code" { || } }}/>
                  ) : (
                    <div className="canvas-placeholder">💻 Code workspace ready. Ask Rishova to code or generate software.</div>
                  )}
                  {isRunOutputVisible && (
                    <div style={{ flex: "0 0 35%", background: "#0a0a0c", borderTop: "1px solid #27272a", padding: "10px" }}>
                      <pre style={{ margin: 0, color: "#e4e4e7", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{runOutput}</pre>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "preview" && (
                <iframe title="Preview" srcDoc={getPreviewContent()} className="sandbox-iframe" style={{ width: "100%", height: "100%", border: "none" }} />
              )}

              {activeTab === "canvas" && (
                <div className="canvas-area">
                  <div ref={diagramRef} className="mermaid-wrapper" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}