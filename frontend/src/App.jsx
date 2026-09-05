import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://rishova-ai-backend.onrender.com";

export default function App() {
  // 1. Crash-proof Sessions Initialization
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem("rishova_sessions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s, idx) => ({
            id: s?.id || String(idx + 1),
            title: s?.title || "Project Session",
            files: s?.files && typeof s.files === "object" ? s.files : { "index.html": { language: "html", code: "<h1>Rishova Studio Ready</h1>" } },
            messages: Array.isArray(s?.messages) ? s.messages : []
          }));
        }
      }
    } catch (e) {
      console.warn("Storage reset to safe state.");
    }
    return [{
      id: "1",
      title: "New Chat",
      files: { "index.html": { language: "html", code: "<h1>Rishova Studio Ready</h1>" } },
      messages: []
    }];
  });

  const [currentSessionId, setCurrentSessionId] = useState("1");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [activeTab, setActiveTab] = useState("Preview");
  const [selectedFile, setSelectedFile] = useState("index.html");
  const [attachedFile, setAttachedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tokensUsed, setTokensUsed] = useState(1546);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 2. Safe Settings
  const [userSettings, setUserSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("rishova_settings");
      return saved ? JSON.parse(saved) : { theme: "dark", autoSave: true };
    } catch (e) {
      return { theme: "dark", autoSave: true };
    }
  });

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Safe fallback for current active session
  const currentSession = sessions.find((s) => s.id === currentSessionId) || sessions[0] || {
    id: "1",
    title: "New Chat",
    files: { "index.html": { language: "html", code: "<h1>Rishova Studio Ready</h1>" } },
    messages: []
  };

  // Safe Quota Storage
  useEffect(() => {
    try {
      const light = sessions.map((s) => ({
        id: s.id,
        title: s.title,
        files: s.files && typeof s.files === "object" ? s.files : {},
        messages: (s.messages || []).slice(-8).map((m) => ({
          role: m.role,
          content: typeof m.content === "string" && m.content.length > 300 ? m.content.slice(0, 300) + "..." : m.content,
          intent: m.intent || "CHAT",
          attachedFileName: m.attachedFileName || ""
        }))
      }));
      localStorage.setItem("rishova_sessions", JSON.stringify(light));
    } catch (err) {
      console.warn("Storage quota full, keeping in-memory.");
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem("rishova_settings", JSON.stringify(userSettings));
    } catch (err) {}
  }, [userSettings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages]);

  const handleNewChat = () => {
    const newId = String(Date.now());
    const newSession = {
      id: newId,
      title: `Chat ${sessions.length + 1}`,
      files: { "index.html": { language: "html", code: "<!-- Fresh Canvas -->" } },
      messages: []
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() && !attachedFile) return;

    const userMsg = {
      role: "user",
      content: prompt,
      attachedFileName: attachedFile ? attachedFile.name : null
    };

    const updatedMessages = [...(currentSession.messages || []), userMsg];
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSessionId ? { ...s, messages: updatedMessages } : s))
    );

    const userPrompt = prompt;
    const fileToSend = attachedFile;
    setPrompt("");
    setAttachedFile(null);
    setLoading(true);

    try {
      let resData = null;

      if (fileToSend) {
        const formData = new FormData();
        formData.append("files", fileToSend);
        formData.append("prompt", userPrompt || "Analyze this file");
        formData.append("model", model);
        formData.append("user_email", "Rishikesh");

        const res = await fetch(`${BACKEND_URL}/api/ai/documents-multi`, {
          method: "POST",
          body: formData
        });
        resData = await res.json();
      } else {
        const res = await fetch(`${BACKEND_URL}/api/ai/universal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userPrompt,
            model: model,
            user_email: "Rishikesh"
          })
        });
        resData = await res.json();
      }

      if (resData && resData.data) {
        const aiMsg = {
          role: "assistant",
          content: resData.data.markdown_response || "Done.",
          intent: resData.intent || "CHAT",
          code_snippet: resData.data.code_snippet || ""
        };

        const incomingFiles = resData.data.files && typeof resData.data.files === "object" ? resData.data.files : {};
        const mergedFiles = { ...(currentSession.files || {}), ...incomingFiles };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  title: s.title === "New Chat" ? (userPrompt.slice(0, 20) || "Project") : s.title,
                  files: mergedFiles,
                  messages: [...updatedMessages, aiMsg]
                }
              : s
          )
        );

        const fileKeys = Object.keys(mergedFiles || {});
        if (fileKeys.length > 0 && !mergedFiles[selectedFile]) {
          setSelectedFile(fileKeys[0]);
        }

        if (resData.intent === "IMAGE") {
          setActiveTab("Preview");
        }

        setTokensUsed((prev) => prev + 420);
      }
    } catch (err) {
      const errorMsg = {
        role: "assistant",
        content: `Error connecting to backend: ${err.message}`
      };
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, messages: [...updatedMessages, errorMsg] } : s))
      );
    } finally {
      setLoading(false);
    }
  };

  const safeFileKeys = Object.keys(currentSession?.files || {});
  const activeFileContent = currentSession?.files?.[selectedFile]?.code || (currentSession?.files?.["index.html"]?.code || "<!-- Output Preview -->");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0b0f17", color: "#f1f5f9", fontFamily: "sans-serif" }}>
      {/* Navbar */}
      <div style={{ height: "52px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: "#0f172a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span onClick={() => setSidebarOpen(!sidebarOpen)} style={{ fontSize: "1.2rem", cursor: "pointer", color: "#94a3b8" }}>☰</span>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "0.5px", color: "#38bdf8" }}>RISHOVA AI</span>
          <span style={{ fontSize: "0.75rem", background: "#1e293b", color: "#94a3b8", padding: "3px 8px", borderRadius: "12px", border: "1px solid #334155" }}>Universal Studio</span>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "6px", padding: "4px 8px", fontSize: "0.8rem", marginLeft: "8px" }}
          >
            <option value="llama-3.3-70b-versatile">⚡ Llama 3.3 70B (Complex Architect)</option>
            <option value="llama-3.2-11b-vision-preview">📷 Llama 3.2 Vision (Image & Docs)</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.8rem" }}>
          <span style={{ background: "#1e293b", padding: "5px 10px", borderRadius: "6px", color: "#94a3b8", border: "1px solid #334155" }}>
            {tokensUsed} / 50000 Tokens
          </span>
          <button style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "5px 10px", borderRadius: "6px", cursor: "pointer" }}>☁ Cloud Save</button>
          <button style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "5px 10px", borderRadius: "6px", cursor: "pointer" }}>⚙ Settings</button>
          <div style={{ background: "#7c3aed", color: "#fff", padding: "5px 12px", borderRadius: "20px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
            <span>👤</span> Rishikesh
          </div>
        </div>
      </div>

      {/* Main Studio Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Collapsible Sidebar for Chats */}
        {sidebarOpen && (
          <div style={{ width: "240px", borderRight: "1px solid #1e293b", background: "#0b101d", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px", borderBottom: "1px solid #1e293b" }}>
              <button
                onClick={handleNewChat}
                style={{ width: "100%", background: "#0284c7", color: "#fff", border: "none", padding: "8px", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
              >
                + New Chat
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setCurrentSessionId(s.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    marginBottom: "4px",
                    background: s.id === currentSessionId ? "#1e293b" : "transparent",
                    color: s.id === currentSessionId ? "#38bdf8" : "#94a3b8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  💬 {s.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Stream Panel */}
        <div style={{ width: "420px", borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", background: "#090d16" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {(currentSession.messages || []).map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "3px" }}>
                  {msg.role === "user" ? "You" : "Rishova AI"}
                </div>
                <div
                  style={{
                    background: msg.role === "user" ? "#0284c7" : "#1e293b",
                    color: "#fff",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    maxWidth: "92%",
                    fontSize: "0.88rem",
                    lineHeight: "1.4"
                  }}
                >
                  {msg.attachedFileName && (
                    <div style={{ fontSize: "0.75rem", background: "rgba(0,0,0,0.25)", padding: "4px 8px", borderRadius: "4px", marginBottom: "6px" }}>
                      📎 {msg.attachedFileName}
                    </div>
                  )}
                  <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ color: "#38bdf8", fontSize: "0.85rem", fontStyle: "italic", padding: "8px" }}>
                ⚡ Processing via Rishova AI Engine...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div style={{ padding: "12px", borderTop: "1px solid #1e293b", background: "#0f172a" }}>
            {attachedFile && (
              <div style={{ fontSize: "0.75rem", color: "#38bdf8", marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📎 {attachedFile.name}</span>
                <span onClick={() => setAttachedFile(null)} style={{ cursor: "pointer", color: "#ef4444" }}>✕</span>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} accept="image/*,.pdf" />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "8px 12px", borderRadius: "6px", cursor: "pointer" }}
                title="Attach Photo or Document"
              >
                📎
              </button>
              <input
                type="text"
                placeholder="Type instructions, swap background, build..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", padding: "9px 12px", color: "#f8fafc", fontSize: "0.88rem", outline: "none" }}
              />
              <button
                onClick={handleSend}
                disabled={loading}
                style={{ background: "#0284c7", border: "none", color: "#fff", padding: "9px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem" }}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Preview & Code */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#030712" }}>
          <div style={{ height: "42px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", background: "#0a0f1d" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {["Code", "Preview", "Canvas"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: activeTab === tab ? "#1e293b" : "transparent",
                    color: activeTab === tab ? "#38bdf8" : "#94a3b8",
                    border: activeTab === tab ? "1px solid #334155" : "1px solid transparent",
                    padding: "4px 14px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 600
                  }}
                >
                  {tab === "Code" ? "💻 Code" : tab === "Preview" ? "👁 Preview" : "🎨 Canvas"}
                </button>
              ))}
            </div>

            {activeTab === "Code" && (
              <div style={{ display: "flex", gap: "6px" }}>
                {safeFileKeys.map((fname) => (
                  <button
                    key={fname}
                    onClick={() => setSelectedFile(fname)}
                    style={{
                      background: selectedFile === fname ? "#0284c7" : "#1e293b",
                      color: "#fff",
                      border: "none",
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      cursor: "pointer"
                    }}
                  >
                    {fname}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, position: "relative" }}>
            {activeTab === "Preview" && (
              <iframe
                title="Studio Preview"
                srcDoc={activeFileContent}
                sandbox="allow-scripts allow-downloads allow-same-origin"
                style={{ width: "100%", height: "100%", border: "none", background: "#09090b" }}
              />
            )}

            {activeTab === "Code" && (
              <textarea
                readOnly
                value={activeFileContent}
                style={{ width: "100%", height: "100%", background: "#050811", color: "#38bdf8", border: "none", padding: "16px", fontFamily: "monospace", fontSize: "0.85rem", outline: "none", resize: "none" }}
              />
            )}

            {activeTab === "Canvas" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b", fontSize: "0.95rem" }}>
                🎨 Rishova Interactive Canvas Studio Ready
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}