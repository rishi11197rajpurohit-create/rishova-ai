import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import Editor from "@monaco-editor/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "./App.css";

const AUTH_API = "https://rishova-auth-backend.onrender.com/api/auth";
const AI_API = "https://rishova-ai-backend.onrender.com/api/ai";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});

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
    const extMap = { javascript: "js", python: "py", bash: "sh", json: "json", css: "css", html: "html", sql: "sql" };
    const blob = new Blob([codeContent], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `code.${extMap[lang] || "txt"}`);
  };

  if (inline || (!match && !codeContent.includes("\n") && codeContent.length < 40)) {
    return <code className="inline-code-pill" {...props}>{children}</code>;
  }

  return (
    <div className="studio-code-card">
      <div className="studio-code-header">
        <span className="studio-lang-title">{(lang || "CODE").toUpperCase()}</span>
        <div className="studio-code-actions">
          <button className="circle-action-btn" title="Download Code" onClick={handleDownload}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button className="circle-action-btn" title="Copy Code" onClick={handleCopy}>
            {copied ? (
              <span className="copied-badge">✔</span>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
      <div className="studio-code-body">
        <SyntaxHighlighter
          language={lang || "javascript"}
          style={vscDarkPlus}
          showLineNumbers={false}
          wrapLines={true}
          lineProps={{ style: { display: "block", width: "100%" } }}
          customStyle={{
            margin: 0,
            padding: "16px 20px",
            backgroundColor: "#131316",
            fontSize: "0.93rem",
            lineHeight: "1.7",
            fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
            overflowX: "auto",
          }}
          codeTagProps={{
            style: {
              display: "block",
              fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
              whiteSpace: "pre",
            }
          }}
        >
          {codeContent}
        </SyntaxHighlighter>
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

  // Sessions / Chat History State
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem("rishova_sessions");
    return saved ? JSON.parse(saved) : [{
      id: "default-session",
      title: "New Workspace Project",
      messages: [{
        role: "assistant",
        content: "Namaste! Main **RISHOVA AI Studio** hoon. Aap mujhse kisi bhi software, API, ya system architecture ka complete code generate karwa sakte hain.",
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

  // Active Session Shortcut
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const [inputPrompt, setInputPrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState("code");
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Canvas Pan/Zoom/Fullscreen State
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

  // Persist sessions
  useEffect(() => {
    localStorage.setItem("rishova_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, loading]);

  // Mermaid Diagram Renderer
  useEffect(() => {
    if (activeTab === "canvas" && activeSession?.activeDiagram && diagramRef.current) {
      diagramRef.current.removeAttribute("data-processed");
      diagramRef.current.innerHTML = activeSession.activeDiagram;
      mermaid.init(undefined, diagramRef.current).catch((err) => {
        console.error("Mermaid Render Error:", err);
      });
    }
  }, [activeSession?.activeDiagram, activeTab]);

  // Export menu outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        setAuthMsg("Account ban gaya! Ab login karein.");
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

  const createNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      title: "New Project",
      messages: [{
        role: "assistant",
        content: "Naya workspace ready hai. Kya develop karna chahte hain?",
        intent: "CHAT"
      }],
      workspaceFiles: {},
      selectedFileName: "",
      activeDiagram: "",
      commands: []
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setPanPosition({ x: 0, y: 0 });
    setZoomLevel(1);
  };

  const deleteSession = (sessionId, e) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      createNewSession();
      return;
    }
    const filtered = sessions.filter((s) => s.id !== sessionId);
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      setActiveSessionId(filtered[0].id);
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

    // Append user message to active session
    const updatedMessages = [
      ...activeSession.messages,
      { role: "user", content: userText, attachedFile: fileToUpload ? fileToUpload.name : null }
    ];

    // Update Title if default
    let sessionTitle = activeSession.title;
    if (sessionTitle === "New Workspace Project" || sessionTitle === "New Project") {
      sessionTitle = userText.slice(0, 30) + (userText.length > 30 ? "..." : "");
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, title: sessionTitle, messages: updatedMessages }
          : s
      )
    );

    setLoading(true);

    try {
      let res;
      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("prompt", userText);

        res = await fetch("https://rishova-ai-backend.onrender.com/api/ai/document", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("https://rishova-ai-backend.onrender.com/api/ai/universal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userText }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || "AI Error");

      const responseData = data.data || {};
      const returnedFiles = responseData.files || {};

      const assistantMsg = {
        role: "assistant",
        content: responseData.markdown_response || "",
        intent: data.intent,
        mermaid: responseData.mermaid || "",
        commands: responseData.commands || []
      };

      let newWorkspaceFiles = activeSession.workspaceFiles;
      let newSelectedFile = activeSession.selectedFileName;
      let newActiveDiagram = activeSession.activeDiagram;

      if (data.intent === "DIAGRAM" && responseData.mermaid) {
        newActiveDiagram = responseData.mermaid;
        setActiveTab("canvas");
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      } else if (Object.keys(returnedFiles).length > 0) {
        newWorkspaceFiles = returnedFiles;
        newSelectedFile = Object.keys(returnedFiles)[0];
        setActiveTab("code");
      } else if (responseData.code_snippet) {
        newWorkspaceFiles = {
          "app.js": { language: responseData.language || "javascript", code: responseData.code_snippet }
        };
        newSelectedFile = "app.js";
        setActiveTab("code");
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMessages, assistantMsg],
                workspaceFiles: newWorkspaceFiles,
                selectedFileName: newSelectedFile,
                activeDiagram: newActiveDiagram,
                commands: responseData.commands || []
              }
            : s
        )
      );
    } catch (err) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [
                  ...s.messages,
                  { role: "assistant", content: `❌ Error: ${err.message}`, intent: "CHAT" }
                ]
              }
            : s
        )
      );
    } finally {
      setLoading(false);
    }
  };

  // Monaco Editor live changes handler
  const handleEditorCodeChange = (newCode) => {
    if (!activeSession?.selectedFileName) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          workspaceFiles: {
            ...s.workspaceFiles,
            [s.selectedFileName]: {
              ...s.workspaceFiles[s.selectedFileName],
              code: newCode
            }
          }
        };
      })
    );
  };

  // Canvas Pan & Drag Handlers
  const handleMouseDown = (e) => {
    if (activeTab !== "canvas") return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  // Universal Export Handlers
  const downloadActiveFile = () => {
    const current = activeSession.workspaceFiles[activeSession.selectedFileName];
    if (!current) return;
    const blob = new Blob([current.code], { type: "text/plain;charset=utf-8" });
    saveAs(blob, activeSession.selectedFileName);
    setShowExportMenu(false);
  };

  const downloadProjectZip = async () => {
    if (Object.keys(activeSession.workspaceFiles).length === 0) {
      alert("No files in workspace to download!");
      return;
    }
    const zip = new JSZip();
    Object.entries(activeSession.workspaceFiles).forEach(([name, fData]) => {
      zip.file(name, fData.code);
    });

    if (activeSession.commands && activeSession.commands.length > 0) {
      zip.file("setup_commands.sh", activeSession.commands.join("\n"));
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${activeSession.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`);
    setShowExportMenu(false);
  };

  const downloadMarkdownDoc = () => {
    const lastAssistant = [...activeSession.messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const blob = new Blob([lastAssistant.content], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, "documentation.md");
    setShowExportMenu(false);
  };

  const downloadPlainText = () => {
    const current = activeSession.workspaceFiles[activeSession.selectedFileName];
    if (!current) return;
    const blob = new Blob([current.code], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${activeSession.selectedFileName}.txt`);
    setShowExportMenu(false);
  };

  const downloadShellScript = () => {
    if (!activeSession.commands || activeSession.commands.length === 0) {
      alert("No shell commands available!");
      return;
    }
    const scriptContent = "#!/usr/bin/env bash\n\n" + activeSession.commands.join("\n") + "\n";
    const blob = new Blob([scriptContent], { type: "application/x-sh;charset=utf-8" });
    saveAs(blob, "run_setup.sh");
    setShowExportMenu(false);
  };

  const downloadSVG = () => {
    if (!diagramRef.current) return;
    const svgElement = diagramRef.current.querySelector("svg");
    if (!svgElement) {
      alert("No rendered diagram found!");
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, "architecture_diagram.svg");
  };

  const currentFile = activeSession?.workspaceFiles?.[activeSession?.selectedFileName] || null;

  const getMonacoLang = (ext) => {
    if (!ext) return "javascript";
    const clean = ext.toLowerCase();
    if (clean.endsWith(".js") || clean.endsWith(".jsx")) return "javascript";
    if (clean.endsWith(".ts") || clean.endsWith(".tsx")) return "typescript";
    if (clean.endsWith(".py")) return "python";
    if (clean.endsWith(".json")) return "json";
    if (clean.endsWith(".html")) return "html";
    if (clean.endsWith(".css")) return "css";
    if (clean.endsWith(".sql")) return "sql";
    if (clean.endsWith(".sh")) return "shell";
    return "javascript";
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
      {/* Top Main Navigation */}
      <header className="app-header">
        <div className="header-left">
          <button 
            className="icon-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Sessions Sidebar"
          >
            ☰
          </button>
          <div className="logo-title">
            <h1>RISHOVA AI</h1>
            <span className="badge">Universal Studio</span>
          </div>
        </div>
        <div className="user-section">
          <span className="user-name-text">👤 {userName}</span>
          <button className="logout-btn" onClick={() => { localStorage.clear(); setToken(null); }}>Logout</button>
        </div>
      </header>

      <div className="studio-body-layout">
        {/* Collapsible Left Sessions Sidebar */}
        {sidebarOpen && (
          <aside className="sessions-sidebar">
            <div className="sidebar-header">
              <button className="new-project-btn" onClick={createNewSession}>
                <span>+</span> New Project
              </button>
            </div>
            <div className="sessions-list">
              <div className="sessions-section-title">Projects & History</div>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`session-item ${s.id === activeSessionId ? "active" : ""}`}
                  onClick={() => setActiveSessionId(s.id)}
                >
                  <span className="session-icon">📁</span>
                  <span className="session-title" title={s.title}>{s.title}</span>
                  <button
                    className="delete-session-btn"
                    onClick={(e) => deleteSession(s.id, e)}
                    title="Delete Project"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* Center Split Screen: Chat on Left, Workspace on Right */}
        <div className="main-content">
          {/* Chat Panel */}
          <div className="chat-panel">
            <div className="chat-history">
              {activeSession.messages.map((m, idx) => (
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
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          pre: ({ children }) => <>{children}</>,
                          code: StudioCodeBlock
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )}
                  </div>

                  {m.commands && m.commands.length > 0 && (
                    <div className="cmd-box">
                      <div className="cmd-header">
                        <span>⚡ Quick Execution Terminal Commands</span>
                        <button onClick={() => copyToClipboard(m.commands.join("\n"))}>📋 Copy All</button>
                      </div>
                      <div className="studio-code-card">
                        <SyntaxHighlighter
                          language="bash"
                          style={vscDarkPlus}
                          showLineNumbers={false}
                          wrapLines={true}
                          lineProps={{ style: { display: "block", width: "100%" } }}
                          customStyle={{
                            margin: 0,
                            padding: "14px 16px",
                            backgroundColor: "#131316",
                            fontSize: "0.9rem",
                            lineHeight: "1.6"
                          }}
                          codeTagProps={{
                            style: { display: "block", whiteSpace: "pre" }
                          }}
                        >
                          {m.commands.join("\n")}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="chat-message assistant loading">⚡ Rishova Studio is generating architecture and code...</div>}
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
                accept=".pdf,.txt,.md,.js,.py,.json,.csv,.sql"
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
                title="Upload Document / File"
              >
                📎
              </button>
              <input
                type="text"
                placeholder={selectedFile ? "Ask a question about this file..." : "Build an API, full software, diagrams, or ask anything..."}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={loading}
              />
              <button type="submit" disabled={loading || (!inputPrompt.trim() && !selectedFile)}>Send</button>
            </form>
          </div>

          {/* Right Workspace Panel */}
          <div className={`preview-panel ${isFullScreenCanvas ? "fullscreen-canvas-mode" : ""}`}>
            <div className="panel-header">
              <div className="tab-switchers">
                <button
                  className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
                  onClick={() => { setActiveTab("code"); setIsFullScreenCanvas(false); }}
                >
                  💻 Monaco Code Workspace
                </button>
                <button
                  className={`tab-btn ${activeTab === "canvas" ? "active" : ""}`}
                  onClick={() => setActiveTab("canvas")}
                >
                  🎨 Architecture Canvas
                </button>
              </div>

              {activeTab === "code" && Object.keys(activeSession.workspaceFiles).length > 0 && (
                <div className="canvas-controls">
                  <span className="active-file-indicator">
                    {getMonacoLang(activeSession.selectedFileName).toUpperCase()}
                  </span>
                  <button className="action-btn" onClick={() => copyToClipboard(currentFile ? currentFile.code : "")}>
                    📋 Copy Code
                  </button>

                  {/* Universal Download Dropdown */}
                  <div className="export-dropdown-wrapper" ref={exportDropdownRef}>
                    <button 
                      className="action-btn download-btn export-trigger-btn"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                    >
                      ⤓ Export ▾
                    </button>
                    {showExportMenu && (
                      <div className="export-dropdown-menu">
                        <div className="dropdown-label">Export Project</div>
                        <button onClick={downloadProjectZip}>
                          <span>📦 Complete ZIP Project</span>
                          <small>All workspace files</small>
                        </button>
                        <button onClick={downloadActiveFile}>
                          <span>📄 Active File ({activeSession.selectedFileName})</span>
                          <small>Direct format</small>
                        </button>
                        <button onClick={downloadMarkdownDoc}>
                          <span>📑 Documentation (.md)</span>
                          <small>Markdown summary</small>
                        </button>
                        <button onClick={downloadPlainText}>
                          <span>📋 Plain Text (.txt)</span>
                          <small>Raw output</small>
                        </button>
                        {activeSession.commands && activeSession.commands.length > 0 && (
                          <button onClick={downloadShellScript}>
                            <span>⚡ Setup Script (.sh)</span>
                            <small>run_setup.sh</small>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "canvas" && activeSession.activeDiagram && (
                <div className="canvas-controls">
                  <button className="action-btn" onClick={() => setZoomLevel((z) => Math.max(0.3, z - 0.2))} title="Zoom Out">🔍 -</button>
                  <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
                  <button className="action-btn" onClick={() => setZoomLevel((z) => Math.min(3.0, z + 0.2))} title="Zoom In">🔍 +</button>
                  <button className="action-btn" onClick={() => { setZoomLevel(1); setPanPosition({ x: 0, y: 0 }); }} title="Reset View">↺ Reset</button>
                  <button className="action-btn" onClick={() => setIsFullScreenCanvas(!isFullScreenCanvas)} title="Toggle Fullscreen">
                    {isFullScreenCanvas ? "🗗 Exit" : "⛶ Fullscreen"}
                  </button>
                  <button className="action-btn download-btn" onClick={downloadSVG}>⬇ SVG</button>
                  <button className="action-btn" onClick={() => copyToClipboard(activeSession.activeDiagram)}>📋 Copy</button>
                </div>
              )}
            </div>

            <div className="workspace-content">
              {activeTab === "code" ? (
                <div className="code-viewer-area">
                  {Object.keys(activeSession.workspaceFiles).length > 0 ? (
                    <div className="multi-file-workspace">
                      {/* Interactive File Tabs */}
                      <div className="file-tabs-bar">
                        {Object.keys(activeSession.workspaceFiles).map((fname) => (
                          <button
                            key={fname}
                            className={`file-tab-item ${activeSession.selectedFileName === fname ? "active" : ""}`}
                            onClick={() => {
                              setSessions((prev) =>
                                prev.map((s) => s.id === activeSessionId ? { ...s, selectedFileName: fname } : s)
                              );
                            }}
                          >
                            📄 {fname}
                          </button>
                        ))}
                      </div>

                      {/* Official Monaco VS Code Editor */}
                      <div className="active-code-card monaco-container">
                        <Editor
                          height="100%"
                          language={getMonacoLang(activeSession.selectedFileName)}
                          theme="vs-dark"
                          value={currentFile ? currentFile.code : ""}
                          onChange={handleEditorCodeChange}
                          options={{
                            fontSize: 14,
                            fontFamily: "'Fira Code', 'Consolas', monospace",
                            minimap: { enabled: true },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 2,
                            wordWrap: "on",
                            formatOnPaste: true,
                            formatOnType: true,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="canvas-placeholder">
                      <p>💻 Monaco Code Workspace Ready</p>
                      <span>Ask Rishova AI to build software or APIs to write, edit, and export code here.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  className={`canvas-area ${isDragging ? "grabbing" : "grabbable"}`}
                  ref={canvasContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {activeSession.activeDiagram ? (
                    <div
                      ref={diagramRef}
                      className="mermaid-wrapper smooth-canvas"
                      style={{
                        transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})`,
                        transformOrigin: "center center",
                        cursor: isDragging ? "grabbing" : "grab"
                      }}
                    />
                  ) : (
                    <div className="canvas-placeholder">
                      <p>🎨 Interactive Architecture Canvas Ready</p>
                      <span>Ask Rishova to generate a system architecture, ERD database schema, or flowchart.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}