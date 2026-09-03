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

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true,
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
    saveAs(blob, `snippet.${extMap[lang] || "txt"}`);
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button className="circle-action-btn" title="Copy Code" onClick={handleCopy}>
            {copied ? "✔" : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
            padding: "14px 16px",
            backgroundColor: "#131316",
            fontSize: "0.9rem",
            lineHeight: "1.6",
            fontFamily: "'Fira Code', 'Consolas', monospace",
            overflowX: "auto",
          }}
          codeTagProps={{
            style: {
              display: "block",
              fontFamily: "'Fira Code', 'Consolas', monospace",
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

  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [usageData, setUsageData] = useState({ tokens_used: 0, daily_limit: 50000 });
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Settings Modal State (Section 26)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userSettings, setUserSettings] = useState(() => {
    const saved = localStorage.getItem("rishova_settings");
    return saved ? JSON.parse(saved) : {
      responseStyle: "detailed",
      language: "en",
      fontSize: "14",
    };
  });

  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem("rishova_sessions");
    return saved ? JSON.parse(saved) : [{
      id: "default-session",
      title: "New Workspace Project",
      messages: [{
        role: "assistant",
        content: "Welcome to **RISHOVA AI Studio**. Ask me to architect, code, debug, learn, or analyze data.",
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

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const [inputPrompt, setInputPrompt] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("code");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const [consoleLogs, setConsoleLogs] = useState([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

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
      const email = userName || "guest";
      const res = await fetch(`https://rishova-ai-backend.onrender.com/api/usage/${email}`);
      if (res.ok) {
        const data = await res.json();
        setUsageData(data);
      }
    } catch (e) {}
  };

  const handleCloudSync = async () => {
    try {
      setIsCloudSyncing(true);
      const email = userName || "guest";
      const res = await fetch("https://rishova-ai-backend.onrender.com/api/cloud/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_email: email, sessions }),
      });
      if (res.ok) {
        alert("☁️ All Projects Synchronized to Cloud Database!");
      } else {
        throw new Error("Sync failed");
      }
    } catch (e) {
      alert("Sync notice: " + e.message);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [sessions]);

  useEffect(() => {
    const handleSandboxMessage = (event) => {
      if (event.data && event.data.type === "PREVIEW_CONSOLE_LOG") {
        setConsoleLogs((prev) => [...prev, { level: event.data.level, message: event.data.message, time: new Date().toLocaleTimeString() }]);
      }
    };
    window.addEventListener("message", handleSandboxMessage);
    return () => window.removeEventListener("message", handleSandboxMessage);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const renderMermaidDiagram = async () => {
      if (activeTab === "canvas" && activeSession?.activeDiagram && diagramRef.current) {
        try {
          let cleanSyntax = activeSession.activeDiagram.trim();
          if (
            !cleanSyntax.startsWith("graph") &&
            !cleanSyntax.startsWith("flowchart") &&
            !cleanSyntax.startsWith("sequenceDiagram") &&
            !cleanSyntax.startsWith("erDiagram") &&
            !cleanSyntax.startsWith("classDiagram")
          ) {
            cleanSyntax = "graph TD\n" + cleanSyntax;
          }

          const uniqueId = `mermaid-svg-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, cleanSyntax);

          if (isMounted && diagramRef.current) {
            diagramRef.current.innerHTML = svg;
          }
        } catch (renderError) {
          if (isMounted && diagramRef.current) {
            diagramRef.current.innerHTML = `
              <div style="color: #f87171; padding: 16px; background: #1f1215; border: 1px solid #7f1d1d; border-radius: 8px; font-family: monospace; font-size: 0.85rem;">
                ⚠️ Diagram Notice: Rendering issue with Mermaid syntax.
              </div>
            `;
          }
        }
      }
    };

    renderMermaidDiagram();
    return () => { isMounted = false; };
  }, [activeSession?.activeDiagram, activeTab]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = userSettings.language === "hi" ? "hi-IN" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    const initialText = inputPrompt ? inputPrompt.trim() + " " : "";

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInputPrompt(initialText + finalTranscript.trim());
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

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
        setAuthMsg("Account created! Please login now.");
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
        content: "New workspace ready. What software, diagram, or analytics would you like to build?",
        intent: "CHAT"
      }],
      workspaceFiles: {},
      selectedFileName: "",
      activeDiagram: "",
      commands: []
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setActiveTab("code");
    setPanPosition({ x: 0, y: 0 });
    setZoomLevel(1);
    setConsoleLogs([]);
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

  const triggerPromptExecution = async (textToSend, attachedFile = null) => {
    if (!textToSend && !attachedFile) return;

    const userText = textToSend || (attachedFile ? `Analyze file: ${attachedFile.name}` : "");
    const updatedMessages = [
      ...activeSession.messages,
      { role: "user", content: userText, attachedFile: attachedFile ? attachedFile.name : null }
    ];

    let sessionTitle = activeSession.title;
    if (sessionTitle === "New Workspace Project" || sessionTitle === "New Project") {
      sessionTitle = userText.slice(0, 26) + (userText.length > 26 ? "..." : "");
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
      if (attachedFile) {
        const formData = new FormData();
        formData.append("file", attachedFile);
        formData.append("prompt", userText);
        formData.append("model", selectedModel);
        formData.append("user_email", userName || "guest");

        res = await fetch("https://rishova-ai-backend.onrender.com/api/ai/document", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("https://rishova-ai-backend.onrender.com/api/ai/universal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            prompt: userText, 
            model: selectedModel, 
            user_email: userName || "guest"
          }),
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
        if (data.intent === "CAREER" || data.intent === "LEARNING" || data.intent === "DATA") {
          setActiveTab("preview");
        } else {
          setActiveTab("code");
        }
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
      fetchUsage();
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

  const handleSendPrompt = async (e) => {
    e.preventDefault();
    if ((!inputPrompt.trim() && !selectedFile) || loading) return;

    const userText = inputPrompt;
    const fileToUpload = selectedFile;

    setInputPrompt("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    await triggerPromptExecution(userText, fileToUpload);
  };

  const handleAIAction = (actionType) => {
    const current = activeSession.workspaceFiles[activeSession.selectedFileName];
    if (!current || !current.code) {
      alert("No active code file to analyze!");
      return;
    }

    let actionPrompt = "";
    if (actionType === "explain") {
      actionPrompt = `Explain this file '${activeSession.selectedFileName}' in detail:\n\`\`\`${current.language}\n${current.code}\n\`\`\``;
    } else if (actionType === "debug") {
      actionPrompt = `Review and find potential bugs, security vulnerabilities, and logic flaws in '${activeSession.selectedFileName}':\n\`\`\`${current.language}\n${current.code}\n\`\`\``;
    } else if (actionType === "optimize") {
      actionPrompt = `Refactor and optimize this file '${activeSession.selectedFileName}' for performance, modularity, and cleanliness:\n\`\`\`${current.language}\n${current.code}\n\`\`\``;
    }

    triggerPromptExecution(actionPrompt, null);
  };

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

  const getLivePreviewSource = () => {
    const files = activeSession.workspaceFiles || {};
    let htmlContent = "";
    let cssContent = "";
    let jsContent = "";

    Object.entries(files).forEach(([name, file]) => {
      const lower = name.toLowerCase();
      const code = file.code || "";

      if (lower.endsWith(".html") || code.includes("<!DOCTYPE") || code.includes("<html") || code.includes("<header")) {
        htmlContent = code;
      } else if (lower.endsWith(".css") || file.language === "css" || code.includes(":root") || (code.includes("{") && code.includes("margin") && code.includes("color"))) {
        cssContent += `\n<style>\n${code}\n</style>\n`;
      } else if ((lower.endsWith(".js") || file.language === "javascript") && !lower.includes("server") && !lower.includes("node") && !code.includes("express()")) {
        jsContent += `\n<script>\ntry {\n${code}\n} catch(err) { console.error('Preview JS Error:', err); }\n<\/script>\n`;
      }
    });

    if (!htmlContent) {
      const current = files[activeSession.selectedFileName];
      if (current && (current.language === "html" || current.code.includes("<div") || current.code.includes("<button"))) {
        htmlContent = current.code;
      } else {
        htmlContent = `
          <div style="font-family: sans-serif; padding: 50px 20px; text-align: center; color: #a1a1aa; background: #0b0b0e; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <h2 style="color: #f4f4f5; margin-bottom: 10px;">⚡ Live Preview Sandbox</h2>
            <p style="font-size: 0.95rem;">Ask Rishova to generate an HTML/CSS landing page, resume, quiz, or data dashboard to view live here.</p>
          </div>
        `;
      }
    }

    const consoleInterceptor = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;
          function sendToParent(level, args) {
            try {
              const msg = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
              window.parent.postMessage({ type: 'PREVIEW_CONSOLE_LOG', level: level, message: msg }, '*');
            } catch(e) {}
          }
          console.log = function() { sendToParent('info', arguments); originalLog.apply(console, arguments); };
          console.error = function() { sendToParent('error', arguments); originalError.apply(console, arguments); };
          console.warn = function() { sendToParent('warn', arguments); originalWarn.apply(console, arguments); };
        })();
      </script>
    `;

    if (cssContent && !htmlContent.includes(cssContent)) {
      if (htmlContent.includes("</head>")) {
        htmlContent = htmlContent.replace("</head>", `${cssContent}</head>`);
      } else {
        htmlContent = `${cssContent}\n${htmlContent}`;
      }
    }

    if (jsContent && !htmlContent.includes(jsContent)) {
      if (htmlContent.includes("</body>")) {
        htmlContent = htmlContent.replace("</body>", `${consoleInterceptor}\n${jsContent}</body>`);
      } else {
        htmlContent = `${htmlContent}\n${consoleInterceptor}\n${jsContent}`;
      }
    } else {
      htmlContent = `${consoleInterceptor}\n${htmlContent}`;
    }

    return htmlContent;
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

          <div className="model-selector-container">
            <span className="model-label">Engine:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="model-select-dropdown"
            >
              <option value="llama-3.3-70b-versatile">⚡ Llama 3.3 70B (Complex Architect)</option>
              <option value="gemma2-9b-it">🚀 Gemma 2 9B (Super Fast Chat)</option>
            </select>
          </div>
        </div>

        <div className="user-section" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="usage-meter-pill" title="Daily API Quota Usage">
            <span>⚡ {usageData.tokens_used || 0} / {usageData.daily_limit || 50000} Tokens</span>
            <div className="usage-progress-track">
              <div
                className="usage-progress-fill"
                style={{ width: `${Math.min(100, ((usageData.tokens_used || 0) / (usageData.daily_limit || 50000)) * 100)}%` }}
              />
            </div>
          </div>

          <button 
            className="cloud-sync-status-btn"
            onClick={handleCloudSync}
            disabled={isCloudSyncing}
            title="Save all workspace sessions to Cloud DB"
          >
            {isCloudSyncing ? "⏳ Syncing..." : "☁️ Cloud Save"}
          </button>

          <button
            className="cloud-sync-status-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Studio Settings & Preferences (Section 26)"
            style={{ background: "#27272a" }}
          >
            ⚙️ Settings
          </button>

          <span className="user-name-text">👤 {userName}</span>
          <button className="logout-btn" onClick={() => { localStorage.clear(); setToken(null); }}>Logout</button>
        </div>
      </header>

      {/* Settings Modal - Section 26 */}
      {isSettingsOpen && (
        <div className="settings-modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>⚙️ Studio Settings & Preferences</h3>
              <button className="settings-close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
            </div>

            <div className="settings-group">
              <label>AI Response Style (Section 26):</label>
              <select 
                className="settings-input-control"
                value={userSettings.responseStyle}
                onChange={(e) => setUserSettings({ ...userSettings, responseStyle: e.target.value })}
              >
                <option value="detailed">Detailed & Step-by-Step (Academic)</option>
                <option value="concise">Concise & Direct (Fast)</option>
                <option value="code_only">Code-Centric (Developer Mode)</option>
              </select>
            </div>

            <div className="settings-group">
              <label>Voice Recognition Language:</label>
              <select 
                className="settings-input-control"
                value={userSettings.language}
                onChange={(e) => setUserSettings({ ...userSettings, language: e.target.value })}
              >
                <option value="en">English (US/UK)</option>
                <option value="hi">Hindi (India)</option>
              </select>
            </div>

            <div className="settings-group">
              <label>Editor Font Size:</label>
              <select 
                className="settings-input-control"
                value={userSettings.fontSize}
                onChange={(e) => setUserSettings({ ...userSettings, fontSize: e.target.value })}
              >
                <option value="12">12px (Compact)</option>
                <option value="14">14px (Standard)</option>
                <option value="16">16px (Large)</option>
              </select>
            </div>

            <div className="settings-danger-zone">
              <label style={{ color: "#ef4444", fontWeight: 600, display: "block", marginBottom: "8px" }}>Storage & Cache Management (Section 26):</label>
              <button 
                className="clear-storage-btn"
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear all local workspace sessions?")) {
                    localStorage.removeItem("rishova_sessions");
                    window.location.reload();
                  }
                }}
              >
                🗑️ Clear Local Sessions & Cache
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="studio-body-layout">
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

        <div className="main-content">
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
                            padding: "12px 14px",
                            backgroundColor: "#131316",
                            fontSize: "0.88rem",
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

              <button
                type="button"
                className={`voice-btn ${isListening ? "listening" : ""}`}
                onClick={handleToggleVoice}
                title={isListening ? "Listening... Click to Stop" : "Voice Input (Speech-to-Text)"}
              >
                {isListening ? "🔴" : "🎤"}
              </button>

              <input
                type="text"
                placeholder={
                  isListening
                    ? "Listening to voice... Speak now..."
                    : selectedFile
                    ? "Ask a question about this file..."
                    : "Build an API, full software, diagrams, charts, or search anything..."
                }
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={loading}
              />
              <button type="submit" disabled={loading || (!inputPrompt.trim() && !selectedFile)}>Send</button>
            </form>
          </div>

          <div className={`preview-panel ${isFullScreenCanvas ? "fullscreen-canvas-mode" : ""}`}>
            <div className="panel-header">
              <div className="tab-switchers">
                <button
                  className={`tab-btn ${activeTab === "code" ? "active" : ""}`}
                  onClick={() => { setActiveTab("code"); setIsFullScreenCanvas(false); }}
                >
                  💻 Code
                </button>
                <button
                  className={`tab-btn ${activeTab === "preview" ? "active" : ""}`}
                  onClick={() => { setActiveTab("preview"); setIsFullScreenCanvas(false); }}
                >
                  👁️ Preview
                </button>
                <button
                  className={`tab-btn ${activeTab === "canvas" ? "active" : ""}`}
                  onClick={() => setActiveTab("canvas")}
                >
                  🎨 Canvas
                </button>
              </div>

              {activeTab === "code" && Object.keys(activeSession.workspaceFiles).length > 0 && (
                <div className="canvas-controls">
                  <div className="ai-actions-group">
                    <button className="ai-action-btn" onClick={() => handleAIAction("explain")} title="Explain active code">
                      ⚡ Explain
                    </button>
                    <button className="ai-action-btn" onClick={() => handleAIAction("debug")} title="Scan for bugs & security flaws">
                      🐛 Find Bugs
                    </button>
                    <button className="ai-action-btn" onClick={() => handleAIAction("optimize")} title="Refactor and optimize code">
                      ✨ Optimize
                    </button>
                  </div>

                  <span className="active-file-indicator">
                    {getMonacoLang(activeSession.selectedFileName).toUpperCase()}
                  </span>
                  <button className="action-btn" onClick={() => copyToClipboard(currentFile ? currentFile.code : "")}>
                    📋 Copy
                  </button>

                  <div className="export-dropdown-wrapper" ref={exportDropdownRef}>
                    <button 
                      className="action-btn download-btn export-trigger-btn"
                      onClick={() => setShowExportMenu(!showExportMenu)}
                    >
                      ⤓ Export ▾
                    </button>
                    {showExportMenu && (
                      <div className="export-dropdown-menu">
                        <div className="dropdown-label">Export Options</div>
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
                        <hr style={{ borderColor: "#27272a", margin: "4px 0" }} />
                        <button onClick={handleCloudSync}>
                          <span>☁️ Sync to Cloud DB</span>
                          <small>Backup projects</small>
                        </button>
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
              {activeTab === "code" && (
                <div className="code-viewer-area">
                  {Object.keys(activeSession.workspaceFiles).length > 0 ? (
                    <div className="multi-file-workspace">
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

                      <div className="active-code-card">
                        <Editor
                          height="100%"
                          language={getMonacoLang(activeSession.selectedFileName)}
                          theme="vs-dark"
                          value={currentFile ? currentFile.code : ""}
                          onChange={handleEditorCodeChange}
                          options={{
                            fontSize: parseInt(userSettings.fontSize || "14"),
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
              )}

              {activeTab === "preview" && (
                <div className="live-preview-container" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
                  <iframe
                    title="Live Web Sandbox"
                    srcDoc={getLivePreviewSource()}
                    sandbox="allow-scripts allow-modals"
                    className="sandbox-iframe"
                    style={{ flex: 1, border: "none" }}
                  />

                  <div className="console-toggle-bar">
                    <button 
                      className={`bottom-console-btn ${isConsoleOpen ? "open" : ""}`}
                      onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                    >
                      📟 {isConsoleOpen ? "Hide Console Logs" : `Show Console Logs (${consoleLogs.length})`}
                    </button>
                    {isConsoleOpen && (
                      <button className="clear-console-btn" onClick={() => setConsoleLogs([])}>
                        Clear Logs
                      </button>
                    )}
                  </div>

                  {isConsoleOpen && (
                    <div className="sandbox-console-panel">
                      <div className="console-logs-list">
                        {consoleLogs.length === 0 ? (
                          <div className="empty-console">No logs captured yet. Any console.log() or runtime errors will appear here.</div>
                        ) : (
                          consoleLogs.map((log, idx) => (
                            <div key={idx} className={`console-log-row log-${log.level}`}>
                              <span className="log-time">[{log.time}]</span>
                              <span className="log-badge">{log.level.toUpperCase()}</span>
                              <span className="log-text">{log.message}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "canvas" && (
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