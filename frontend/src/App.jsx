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
    category: "🏗️ Architecture",
    title: "Microservices Flowchart",
    prompt: "Design a complete scalable Microservices Architecture for an E-Commerce application with API Gateway, Auth Service, Redis Cache, and Kafka message broker in ```mermaid graph TD."
  },
  {
    category: "💻 Full-Stack App",
    title: "Interactive Kanban Board",
    prompt: "Build a single-file interactive Kanban Task Management Board with HTML, CSS, and vanilla JavaScript. Include drag-and-drop support, local storage persistence, and modern dark styling."
  },
  {
    category: "🎨 AI Image Art",
    title: "Cyberpunk Developer Studio",
    prompt: "Generate image of an Indian developer coding in a futuristic cyber studio at night with neon lights and holographic screens."
  },
  {
    category: "🧠 DSA Algorithms",
    title: "Dynamic Programming: 0/1 Knapsack",
    prompt: "Write a complete Python implementation of 0/1 Knapsack Problem with both Top-Down Memoization and Bottom-Up Tabulation. Include time & space complexity analysis."
  }
];

const StudioCodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const codeContent = String(children || "").replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap = { javascript: "js", python: "py", bash: "sh", json: "json", css: "css", html: "html", sql: "sql", srt: "srt" };
    const blob = new Blob([codeContent], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `code_${Date.now()}.${extMap[lang] || "txt"}`);
  };

  if (inline || (!match && !codeContent.includes("\n") && codeContent.length < 40)) {
    return <code className="inline-code-pill" {...props}>{children}</code>;
  }

  return (
    <div className="studio-code-card">
      <div className="studio-code-header">
        <span className="studio-lang-title">{(lang || "CODE").toUpperCase()}</span>
        <div className="studio-code-actions">
          <button className="circle-action-btn" title="Download File" onClick={handleDownload}>⤓</button>
          <button className="circle-action-btn" title="Copy Code" onClick={handleCopy}>{copied ? "✔" : "📋"}</button>
        </div>
      </div>
      <div className="studio-code-body">
        <pre style={{ margin: 0, padding: "14px 16px", background: "#131316", color: "#f4f4f5", overflowX: "auto", fontFamily: "'Fira Code', 'Consolas', monospace", fontSize: "0.88rem", lineHeight: "1.6" }}>
          <code>{codeContent}</code>
        </pre>
      </div>
    </div>
  );
};

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

  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [usageData, setUsageData] = useState({ tokens_used: 1546, daily_limit: 50000 });
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [userSettings, setUserSettings] = useState(() => {
    const saved = localStorage.getItem("rishova_settings");
    return saved ? JSON.parse(saved) : {
      responseStyle: "detailed",
      language: "mwr",
      fontSize: "14",
    };
  });

  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem("rishova_sessions");
    return saved ? JSON.parse(saved) : [{
      id: "default-session",
      title: "New Workspace Project",
      pinned: false,
      messages: [{
        role: "assistant",
        content: "राम राम सा! Welcome to **RISHOVA AI Universal Studio**.\nBuild software, diagrams, analyze files, or click '💡 Templates' above.",
        intent: "CHAT"
      }],
      workspaceFiles: {},
      selectedFileName: "",
      activeDiagram: "",
      commands: []
    }];
  });

  const [activeSessionId, setActiveSessionId] = useState("default-session");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const [inputPrompt, setInputPrompt] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("code");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const [speakingIndex, setSpeakingIndex] = useState(null);

  const [consoleLogs, setConsoleLogs] = useState([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  const [isRunningCode, setIsRunningCode] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const [isRunOutputVisible, setIsRunOutputVisible] = useState(false);
  const pyodideRef = useRef(null);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullScreenCanvas, setIsFullScreenCanvas] = useState(false);

  const diagramRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const chatBottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const exportDropdownRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("rishova_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem("rishova_settings", JSON.stringify(userSettings));
  }, [userSettings]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, loading]);

  const fetchUsage = async () => {
    try {
      const email = encodeURIComponent(userName || "guest");
      const res = await fetch(`${AI_BACKEND}/api/usage/${email}`);
      if (res.ok) {
        const data = await res.json();
        setUsageData(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchUsage();
  }, [sessions]);

  useEffect(() => {
    let isMounted = true;
    const renderMermaidDiagram = async () => {
      if (activeTab === "canvas" && activeSession?.activeDiagram && diagramRef.current) {
        try {
          let cleanSyntax = activeSession.activeDiagram.trim();
          if (!cleanSyntax.startsWith("graph") && !cleanSyntax.startsWith("flowchart")) {
            cleanSyntax = "graph TD\n" + cleanSyntax;
          }
          const uniqueId = `mermaid-svg-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, cleanSyntax);
          if (isMounted && diagramRef.current) diagramRef.current.innerHTML = svg;
        } catch {
          if (isMounted && diagramRef.current) {
            diagramRef.current.innerHTML = `<div style="color:#f87171;padding:16px;">⚠️ Rendering diagram...</div>`;
          }
        }
      }
    };
    renderMermaidDiagram();
    return () => { isMounted = false; };
  }, [activeSession?.activeDiagram, activeTab]);

  const handleExecuteActiveCode = async () => {
    const current = activeSession.workspaceFiles[activeSession.selectedFileName];
    if (!current || !current.code) {
      alert("No active code to run!");
      return;
    }
    setIsRunningCode(true);
    setIsRunOutputVisible(true);
    setRunOutput("⏳ Running in browser...\n");

    const ext = (activeSession.selectedFileName || "").toLowerCase();
    if (ext.endsWith(".py") || current.language === "python") {
      try {
        if (!pyodideRef.current && window.loadPyodide) {
          setRunOutput("📦 Initializing Python runtime...\n");
          pyodideRef.current = await window.loadPyodide();
        }
        pyodideRef.current.setStdout({ batched: (t) => setRunOutput((p) => p + t + "\n") });
        await pyodideRef.current.runPythonAsync(current.code);
        setRunOutput((p) => p + "\n✔ Finished.");
      } catch (err) {
        setRunOutput((p) => p + `\n❌ Python Error: ${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    } else {
      try {
        let buff = "";
        const fn = new Function("console", current.code);
        fn({ log: (...a) => { buff += a.join(" ") + "\n"; } });
        setRunOutput(buff || "Executed cleanly.");
      } catch (err) {
        setRunOutput(`❌ JS Error: ${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    }
  };

  const handleClearCurrentChat = () => {
    if (window.confirm("Clear chat in this project?")) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [{ role: "assistant", content: "Chat cleared. What shall we create next?", intent: "CHAT" }],
                workspaceFiles: {},
                selectedFileName: "",
                activeDiagram: "",
                commands: []
              }
            : s
        )
      );
    }
  };

  const triggerPromptExecution = async (textToSend, attachedFilesList = []) => {
    if (!textToSend && (!attachedFilesList || attachedFilesList.length === 0)) return;

    const userText = textToSend || "Process attached file";
    const updatedMessages = [
      ...activeSession.messages,
      { role: "user", content: userText }
    ];

    setSessions((prev) =>
      prev.map((s) => s.id === activeSessionId ? { ...s, messages: updatedMessages } : s)
    );

    setLoading(true);

    // 🎨 AI IMAGE GENERATION (Direct Client Execution - 100% Reliable)
    const isImageGen = /generate image|create image|draw|photo of|paint|तस्वीर|फोटो/i.test(userText);
    if (isImageGen) {
      const cleanPrompt = userText.replace(/generate image|create image|draw|photo of|paint|an image of|तस्वीर|फोटो|बनाओ/gi, "").trim() || "Futuristic AI Studio";
      const encoded = encodeURIComponent(cleanPrompt);
      const imgUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;

      const htmlCard = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin:0; background:#09090b; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; padding:20px; }
            .card { background:#18181b; border:1px solid #27272a; border-radius:12px; padding:16px; max-width:650px; width:100%; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.7); }
            img { width:100%; border-radius:8px; display:block; margin:12px 0; border:1px solid #3f3f46; }
            a { background:#0284c7; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-block; }
          </style>
        </head>
        <body>
          <div class="card">
            <span style="background:#3b82f6;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">✨ FLUX AI STUDIO</span>
            <p style="color:#94a3b8;font-size:0.85rem;margin:8px 0;">"${cleanPrompt}"</p>
            <img src="${imgUrl}" alt="${cleanPrompt}" />
            <a href="${imgUrl}" target="_blank" download="rishova_art.jpg">⬇ Download Ultra HD</a>
          </div>
        </body>
        </html>
      `;

      const assistantMsg = {
        role: "assistant",
        content: `✨ **AI Image Generated Successfully:**\n\n![Generated Art](${imgUrl})\n\n**Prompt:** *"${cleanPrompt}"*\n\nSwitch to **👁️ Preview** on the right to download in Ultra HD.`,
        intent: "IMAGE"
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMessages, assistantMsg],
                workspaceFiles: { "index.html": { language: "html", code: htmlCard } },
                selectedFileName: "index.html"
              }
            : s
        )
      );
      setActiveTab("preview");
      setLoading(false);
      return;
    }

    // ⚡ BACKEND TEXT / CODING EXECUTION
    try {
      const res = await fetch(`${AI_BACKEND}/api/ai/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userText,
          model: selectedModel,
          user_email: userName || "guest"
        })
      });

      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Server warming up. Please try once again!");
      }

      const responseData = data.data || {};
      const assistantMsg = {
        role: "assistant",
        content: responseData.markdown_response || data.markdown_response || "Completed",
        intent: data.intent || "CHAT"
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMessages, assistantMsg],
                workspaceFiles: responseData.files || {},
                selectedFileName: Object.keys(responseData.files || {})[0] || "",
                activeDiagram: responseData.mermaid || ""
              }
            : s
        )
      );

      if (data.intent === "DIAGRAM") setActiveTab("canvas");
      else if (Object.keys(responseData.files || {}).length > 0) setActiveTab("code");

    } catch (err) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMessages, { role: "assistant", content: `❌ Notice: ${err.message}`, intent: "CHAT" }]
              }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendPrompt = async (e) => {
    e.preventDefault();
    if (!inputPrompt.trim() || loading) return;
    const text = inputPrompt;
    setInputPrompt("");
    await triggerPromptExecution(text);
  };

  const getLivePreviewSource = () => {
    const file = activeSession?.workspaceFiles?.[activeSession?.selectedFileName];
    if (file && file.code) return file.code;
    return `<div style="color:#a1a1aa;text-align:center;padding:50px;font-family:sans-serif;"><h3>⚡ Preview Sandbox</h3><p>Generate an image or app to preview here.</p></div>`;
  };

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-box">
          <h2>{isRegister ? "Create Rishova Account" : "Login to Rishova AI"}</h2>
          {authMsg && <p className="auth-msg">{authMsg}</p>}
          <form onSubmit={async (e) => {
            e.preventDefault();
            const endpoint = isRegister ? `${AUTH_API}/register` : `${AUTH_API}/login`;
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(authForm)
            });
            const d = await res.json();
            if (res.ok) {
              if (isRegister) { setIsRegister(false); setAuthMsg("Registered! Please login."); }
              else {
                localStorage.setItem("rishova_token", d.token);
                localStorage.setItem("rishova_user", d.user?.name || "User");
                setToken(d.token);
                setUserName(d.user?.name || "User");
              }
            } else setAuthMsg(d.message || "Error");
          }}>
            {isRegister && <input type="text" placeholder="Full Name" onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} required />}
            <input type="email" placeholder="Email" onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
            <input type="password" placeholder="Password" onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required />
            <button type="submit">{isRegister ? "Register" : "Login"}</button>
          </form>
          <button className="switch-btn" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? "Already have account? Login" : "No account? Register"}
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
            <option value="llama-3.3-70b-versatile">⚡ Llama 3.3 70B (Complex Architect)</option>
            <option value="gemma2-9b-it">🚀 Gemma 2 9B (Super Fast)</option>
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
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "550px" }}>
            <div className="settings-modal-header">
              <h3>💡 Prompt Templates</h3>
              <button className="settings-close-btn" onClick={() => setIsTemplatesOpen(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
              {PROMPT_TEMPLATES.map((t, i) => (
                <div key={i} style={{ background: "#27272a", padding: "12px", borderRadius: "8px", cursor: "pointer" }} onClick={() => { setInputPrompt(t.prompt); setIsTemplatesOpen(false); }}>
                  <span style={{ color: "#38bdf8", fontSize: "0.75rem", fontWeight: 600 }}>{t.category}</span>
                  <h4 style={{ margin: "4px 0", color: "#fff" }}>{t.title}</h4>
                  <p style={{ margin: 0, color: "#a1a1aa", fontSize: "0.82rem" }}>{t.prompt.slice(0, 90)}...</p>
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
                const nId = `session-${Date.now()}`;
                setSessions([{ id: nId, title: "New Project", pinned: false, messages: [{ role: "assistant", content: "New workspace ready.", intent: "CHAT" }], workspaceFiles: {} }, ...sessions]);
                setActiveSessionId(nId);
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
                    <ReactMarkdown StudioCodeBlock code: components="{{" remarkPlugins="{[remarkGfm]}" }}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {loading && <div className="chat-message assistant loading">⚡ Generating high-quality output...</div>}
              <div ref={chatBottomRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSendPrompt}>
              <button type="button" className="attach-btn" onClick={handleClearCurrentChat} title="Clear Chat">🗑️</button>
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
                <button className="action-btn" onClick={handleExecuteActiveCode} style={{ background: "#16a34a", color: "#fff", fontWeight: 600 }}>
                  ▶ Run Code
                </button>
              )}
            </div>

            <div className="workspace-content">
              {activeTab === "code" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  {Object.keys(activeSession.workspaceFiles).length > 0 ? (
                    <Editor ""} "'Fira 14, Code', enabled: false fontFamily: fontSize: height="100%" minimap: monospace", options="{{" theme="vs-dark" value="{activeSession.workspaceFiles[activeSession.selectedFileName]?.code" { || } }}/>
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
                <iframe title="Preview" srcDoc={getLivePreviewSource()} className="sandbox-iframe" style={{ width: "100%", height: "100%", border: "none" }} />
              )}

              {activeTab === "canvas" && (
                <div className="canvas-area" ref={canvasContainerRef}>
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