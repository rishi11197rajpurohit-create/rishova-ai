import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-typescript";
import "./App.css";

const AUTH_API = "https://rishova-auth-backend.onrender.com/api/auth";
const AI_API = "https://rishova-ai-backend.onrender.com/api/ai";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
});

// Custom Code Block with direct Copy button & VS Code Styling
const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "text";
  const codeContent = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    Prism.highlightAll();
  }, [children]);

  if (inline) {
    return <code className="inline-code" {...props}>{children}</code>;
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang-tag">{lang.toUpperCase()}</span>
        <button className="copy-code-btn" onClick={handleCopy}>
          {copied ? "✔ Copied!" : "📋 Copy"}
        </button>
      </div>
      <pre className={`language-${lang}`}>
        <code className={`language-${lang}`}>{codeContent}</code>
      </pre>
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

  const [inputPrompt, setInputPrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Namaste! Main **RISHOVA AI** hoon. Aap mujhse diagram banwa sakte hain, PDF analyze karwa sakte hain, ya complete software & APIs build karwa sakte hain.",
      intent: "CHAT"
    }
  ]);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState("code");
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
    Prism.highlightAll();
  }, [messages, activeCode, activeTab]);

  useEffect(() => {
    if (activeTab === "canvas" && activeDiagram && diagramRef.current) {
      diagramRef.current.removeAttribute("data-processed");
      diagramRef.current.innerHTML = activeDiagram;
      mermaid.init(undefined, diagramRef.current).catch((err) => {
        console.error("Mermaid render error:", err);
      });
    }
  }, [activeDiagram, activeTab]);

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
      let res;
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

      const data = await res.json();
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
      } else if (responseData.code_snippet) {
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
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
          <span className="badge">Universal Studio</span>
        </div>
        <div className="user-section">
          <span>{userName}</span>
          <button className="logout-btn" onClick={() => { localStorage.clear(); setToken(null); }}>Logout</button>
        </div>
      </header>

      <div className="main-content">
        {/* Left 50% Panel: Conversational Intelligence */}
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
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: CodeBlock
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  )}
                </div>

                {m.commands && m.commands.length > 0 && (
                  <div className="cmd-box">
                    <div className="cmd-header">
                      <span>⚡ Step-by-Step Terminal Commands</span>
                      <button onClick={() => copyToClipboard(m.commands.join("\n"))}>📋 Copy All Commands</button>
                    </div>
                    <pre className="language-bash"><code className="language-bash">{m.commands.join("\n")}</code></pre>
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="chat-message assistant loading">⚡ Rishova AI is generating full code & commands...</div>}
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
              placeholder={selectedFile ? "Ask a question about this file..." : "Build an API, full software, diagrams, or ask anything..."}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || (!inputPrompt.trim() && !selectedFile)}>Send</button>
          </form>
        </div>

        {/* Right 50% Panel: Universal Workspace */}
        <div className="preview-panel">
          <div className="panel-header">
            <div className="tab-switchers">
              <button
                className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
                onClick={() => setActiveTab("code")}
              >
                💻 Code Workspace (VS Code View)
              </button>
              <button
                className={`tab-btn ${activeTab === "canvas" ? "active" : ""}`}
                onClick={() => setActiveTab("canvas")}
              >
                🎨 Canvas & Architecture
              </button>
            </div>

            {activeTab === "code" && activeCode && (
              <div className="canvas-controls">
                <span className="lang-badge">{activeLang.toUpperCase()}</span>
                <button className="action-btn download-btn" onClick={() => copyToClipboard(activeCode)}>📋 Copy Full Code</button>
              </div>
            )}

            {activeTab === "canvas" && activeDiagram && (
              <div className="canvas-controls">
                <button className="action-btn" onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.2))}>🔍 -</button>
                <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
                <button className="action-btn" onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}>🔍 +</button>
                <button className="action-btn download-btn" onClick={downloadSVG}>⬇ SVG</button>
                <button className="action-btn" onClick={() => copyToClipboard(activeDiagram)}>📋 Copy</button>
              </div>
            )}
          </div>

          <div className="workspace-content">
            {activeTab === "code" ? (
              <div className="code-viewer-area">
                {activeCode ? (
                  <pre className={`code-pre language-${activeLang}`}>
                    <code className={`language-${activeLang}`}>
                      {activeCode}
                    </code>
                  </pre>
                ) : (
                  <div className="canvas-placeholder">
                    <p>💻 VS Code Workspace Ready</p>
                    <span>Ask Rishova AI to build an API or app to view full syntax highlighted code here.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="canvas-area">
                {activeDiagram ? (
                  <div
                    ref={diagramRef}
                    className="mermaid-wrapper"
                    style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center", transition: "transform 0.2s ease" }}
                  />
                ) : (
                  <div className="canvas-placeholder">
                    <p>🎨 Interactive Canvas Ready</p>
                    <span>Ask Rishova to generate a diagram or architecture flow.</span>
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