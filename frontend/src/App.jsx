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
    saveAs(blob, `snippet_${Date.now()}.${extMap[lang] || "txt"}`);
  };

  if (inline || (!match && !codeContent.includes("\n") && codeContent.length < 40)) {
    return <code className="inline-code-pill" {...props}>{children}</code>;
  }

  return (
    <div className="studio-code-card">
      <div className="studio-code-header">
        <span className="studio-lang-title">{(lang || "CODE").toUpperCase()}</span>
        <div className="studio-code-actions">
          <button className="circle-action-btn" title="Download Snippet" onClick={handleDownload}>⤓</button>
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
        content: "राम राम सा! Welcome to **RISHOVA AI Universal Studio**.\nAsk me to code, generate AI images, draw architecture diagrams, or analyze documents.",
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        createNewSession();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchUsage = async () => {
    try {
      const email = encodeURIComponent(userName || "guest");
      const res = await fetch(`${AI_BACKEND}/api/usage/${email}`);
      if (res.ok) {
        let data;
      try {
        const rawText = await res.text();
        data = JSON.parse(rawText);
      } catch (err) {
        throw new Error("Backend is updating or returned non-JSON response. Please retry in a few seconds.");
      }
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
        } catch {
          if (isMounted && diagramRef.current) {
            diagramRef.current.innerHTML = `<div style="color: #f87171; padding: 16px;">⚠️ Diagram Rendering issue.</div>`;
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

  const handleCloudSync = async () => {
    try {
      setIsCloudSyncing(true);
      const email = userName || "guest";
      const res = await fetch(`${AI_BACKEND}/api/cloud/sync`, {
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

  const handleExecuteActiveCode = async () => {
    const current = activeSession.workspaceFiles[activeSession.selectedFileName];
    if (!current || !current.code) {
      alert("No active code to run!");
      return;
    }

    setIsRunningCode(true);
    setIsRunOutputVisible(true);
    setRunOutput("⏳ Initializing runtime execution environment...\n");

    const ext = (activeSession.selectedFileName || "").toLowerCase();
    const isPython = ext.endsWith(".py") || current.language === "python";
    const isJS = ext.endsWith(".js") || current.language === "javascript";

    if (isPython) {
      try {
        if (!pyodideRef.current && window.loadPyodide) {
          setRunOutput("📦 Initializing WebAssembly Python environment...\n");
          pyodideRef.current = await window.loadPyodide();
        }
        pyodideRef.current.setStdout({
          batched: (text) => setRunOutput((prev) => prev + text + "\n")
        });
        pyodideRef.current.setStderr({
          batched: (text) => setRunOutput((prev) => prev + "⚠️ Error: " + text + "\n")
        });
        setRunOutput("🐍 Executing Python Script...\n--- [OUTPUT] ---\n");
        await pyodideRef.current.runPythonAsync(current.code);
        setRunOutput((prev) => prev + "\n✔ Execution finished successfully.");
      } catch (err) {
        setRunOutput((prev) => prev + `\n❌ Python Error:\n${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    } else if (isJS) {
      try {
        setRunOutput("⚡ Executing JavaScript Sandbox...\n--- [OUTPUT] ---\n");
        let outputBuffer = "";
        const customConsole = {
          log: (...args) => { outputBuffer += args.join(" ") + "\n"; },
          error: (...args) => { outputBuffer += "⚠️ " + args.join(" ") + "\n"; },
          warn: (...args) => { outputBuffer += "⚡ " + args.join(" ") + "\n"; }
        };
        const runFn = new Function("console", current.code);
        runFn(customConsole);
        setRunOutput((prev) => prev + (outputBuffer || "Code executed cleanly.\n") + "\n✔ Execution finished.");
      } catch (err) {
        setRunOutput((prev) => prev + `\n❌ JavaScript Error:\n${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    } else {
      setRunOutput("⚠️ Live execution is optimized for Python (.py) and JavaScript (.js). Open '👁️ Preview' tab for HTML/CSS.");
      setIsRunningCode(false);
    }
  };

  const handleClearCurrentChat = () => {
    if (window.confirm("Are you sure you want to clear messages in this project?")) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [{
                  role: "assistant",
                  content: "Chat cleared. What software, architecture, or project would you like to explore next?",
                  intent: "CHAT"
                }],
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

  const handleTextToSpeech = (text, index) => {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/```[\s\S]*?```/g, "Code block omitted.").replace(/[#*_`]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = userSettings.language === "en" ? "en-US" : "hi-IN";
    utterance.rate = 1.0;

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

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
    recognition.lang = userSettings.language === "en" ? "en-US" : "hi-IN";
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
      pinned: false,
      messages: [{
        role: "assistant",
        content: "New workspace ready. What software, diagram, or AI image would you like to explore?",
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
    setIsRunOutputVisible(false);
    setRunOutput("");
  };

  const togglePinSession = (sessionId, e) => {
    e.stopPropagation();
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, pinned: !s.pinned } : s)
    );
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

  const triggerPromptExecution = async (textToSend, attachedFilesList = []) => {
    if (!textToSend && (!attachedFilesList || attachedFilesList.length === 0)) return;

    const fileNames = attachedFilesList.map((f) => f.name).join(", ");
    const userText = textToSend || (attachedFilesList.length > 0 ? `Process attached files: ${fileNames}` : "");
    const updatedMessages = [
      ...activeSession.messages,
      { role: "user", content: userText, attachedFile: fileNames || null }
    ];

    let sessionTitle = activeSession.title;
    if (sessionTitle === "New Workspace Project" || sessionTitle === "New Project") {
      sessionTitle = userText.slice(0, 26) + (userText.length > 26 ? "..." : "");
    }

    setSessions((prev) =>
      prev.map((s) => s.id === activeSessionId ? { ...s, title: sessionTitle, messages: updatedMessages } : s)
    );

    setLoading(true);

    // AI IMAGE GENERATION (Direct Client Instant Generation)
    const isImageQuery = /generate image|create image|draw|photo of|paint|image of|तस्वीर|फोटो/i.test(userText);
    if (isImageQuery && (!attachedFilesList || attachedFilesList.length === 0)) {
      const cleanPrompt = userText.replace(/generate image|create image|draw|photo of|paint|an image of|image of|तस्वीर|फोटो|बनाओ/gi, "").trim() || "Futuristic AI Studio";
      const encoded = encodeURIComponent(cleanPrompt);
      const seed = Math.floor(Math.random() * 99999);
      const imgUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}`;

      const previewHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Rishova AI Image Studio</title>
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
        content: `### ✨ AI Artwork Generated\n\n![Generated Art](${imgUrl})\n\n**Prompt:** *"${cleanPrompt}"*\n\n👉 *Switch to the **👁️ Preview** tab to view and download your image in Ultra HD.*`,
        intent: "IMAGE"
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [...updatedMessages, assistantMsg],
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

    // BACKEND API INFERENCE
    try {
      let res;
      if (attachedFilesList && attachedFilesList.length > 0) {
        const formData = new FormData();
        attachedFilesList.forEach((file) => formData.append("files", file));
        formData.append("prompt", userText);
        formData.append("model", selectedModel);
        formData.append("user_email", userName || "guest");

        res = await fetch(`${AI_BACKEND}/api/ai/documents-multi`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`${AI_BACKEND}/api/ai/universal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: userText,
            model: selectedModel,
            user_email: userName || "guest"
          }),
        });
      }

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}.`);
      }

      const data = await res.json();
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
      } else if (data.intent === "IMAGE" || Object.keys(returnedFiles).length > 0) {
        newWorkspaceFiles = returnedFiles;
        newSelectedFile = Object.keys(returnedFiles)[0] || "index.html";
        setActiveTab("preview");
      } else if (responseData.code_snippet) {
        newWorkspaceFiles = {
          "main.py": { language: responseData.language || "python", code: responseData.code_snippet }
        };
        newSelectedFile = "main.py";
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
    if ((!inputPrompt.trim() && selectedFiles.length === 0) || loading) return;

    const userText = inputPrompt;
    const filesToUpload = [...selectedFiles];

    setInputPrompt("");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    await triggerPromptExecution(userText, filesToUpload);
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

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${activeSession.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`);
    setShowExportMenu(false);
  };

  const getLivePreviewSource = () => {
    const files = activeSession.workspaceFiles || {};
    let htmlContent = "";

    Object.entries(files).forEach(([name, file]) => {
      const lower = name.toLowerCase();
      const code = file.code || "";
      if (lower.endsWith(".html") || code.includes("<!DOCTYPE") || code.includes("<html") || code.includes("<style")) {
        htmlContent = code;
      }
    });

    if (!htmlContent) {
      const current = files[activeSession.selectedFileName];
      if (current && (current.language === "html" || current.code.includes("<div"))) {
        htmlContent = current.code;
      } else {
        htmlContent = `
          <div style="font-family: sans-serif; padding: 50px 20px; text-align: center; color: #a1a1aa; background: #0b0b0e; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <h2 style="color: #f4f4f5; margin-bottom: 10px;">⚡ Live Preview Sandbox</h2>
            <p style="font-size: 0.95rem;">Ask Rishova to generate an AI Image, interactive app, or diagram to preview here.</p>
          </div>
        `;
      }
    }
    return htmlContent;
  };

  const currentFile = activeSession?.workspaceFiles?.[activeSession?.selectedFileName] || null;

  const sortedAndFilteredSessions = [...sessions]
    .filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

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
            title="Toggle Sessions Sidebar (Ctrl+B)"
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
          <button
            className="cloud-sync-status-btn"
            onClick={() => setIsTemplatesOpen(true)}
            title="Prompt Templates Library"
            style={{ background: "#1e293b", borderColor: "#38bdf8", color: "#38bdf8" }}
          >
            💡 Templates
          </button>

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
            onClick={() => setIsShortcutsOpen(true)}
            title="Keyboard Shortcuts & Help Guide"
            style={{ background: "#27272a" }}
          >
            ⌨️ Shortcuts
          </button>

          <button
            className="cloud-sync-status-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Studio Settings & Preferences"
            style={{ background: "#27272a" }}
          >
            ⚙️ Settings
          </button>

          <span className="user-name-text">👤 {userName}</span>
          <button className="logout-btn" onClick={() => { localStorage.clear(); setToken(null); }}>Logout</button>
        </div>
      </header>

      {isTemplatesOpen && (
        <div className="settings-modal-overlay" onClick={() => setIsTemplatesOpen(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="settings-modal-header">
              <h3>💡 Prompt Templates Library</h3>
              <button className="settings-close-btn" onClick={() => setIsTemplatesOpen(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
              {PROMPT_TEMPLATES.map((tmpl, i) => (
                <div 
                  key={i} 
                  style={{
                    background: "#27272a",
                    border: "1px solid #3f3f46",
                    borderRadius: "8px",
                    padding: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onClick={() => {
                    setInputPrompt(tmpl.prompt);
                    setIsTemplatesOpen(false);
                  }}
                >
                  <span style={{ fontSize: "0.72rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: "600" }}>{tmpl.category}</span>
                  <h4 style={{ margin: "4px 0", color: "#f4f4f5", fontSize: "0.95rem" }}>{tmpl.title}</h4>
                  <p style={{ margin: 0, color: "#a1a1aa", fontSize: "0.82rem", lineBreak: "anywhere" }}>{tmpl.prompt.slice(0, 95)}...</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isShortcutsOpen && (
        <div className="settings-modal-overlay" onClick={() => setIsShortcutsOpen(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>⌨️ Keyboard Shortcuts & Quick Navigation</h3>
              <button className="settings-close-btn" onClick={() => setIsShortcutsOpen(false)}>✕</button>
            </div>
            <table className="shortcuts-table">
              <tbody>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>K</kbd></td>
                  <td>Create New Project / Clear Workspace</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl</kbd> + <kbd>B</kbd></td>
                  <td>Toggle Left Sidebar</td>
                </tr>
                <tr>
                  <td><kbd>Enter</kbd></td>
                  <td>Send Prompt to Rishova AI</td>
                </tr>
                <tr>
                  <td><kbd>🔊 Listen</kbd></td>
                  <td>AI Text-to-Speech Output</td>
                </tr>
                <tr>
                  <td><kbd>🎤 Mic</kbd></td>
                  <td>Speech-to-Text Voice Input</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="settings-modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>⚙️ Studio Settings & Preferences</h3>
              <button className="settings-close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
            </div>

            <div className="settings-group">
              <label>AI Response Style:</label>
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
              <label>Language Preference / भाषा:</label>
              <select 
                className="settings-input-control"
                value={userSettings.language}
                onChange={(e) => setUserSettings({ ...userSettings, language: e.target.value })}
              >
                <optgroup label="भारतीय भाषाएँ (Indian Languages)">
                  <option value="mwr">मारवाड़ी / राजस्थानी (Marwari)</option>
                  <option value="hi">हिंदी (Hindi)</option>
                  <option value="hinglish">Hinglish (हिंदी + English)</option>
                </optgroup>
                <optgroup label="Global World Languages">
                  <option value="en">English (US/UK)</option>
                  <option value="es">Español (Spanish)</option>
                </optgroup>
              </select>
            </div>

            <div className="settings-danger-zone">
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
                <span>+</span> New Project (Ctrl+K)
              </button>
            </div>

            <div className="sidebar-search-box">
              <input
                type="text"
                placeholder="🔍 Search projects & history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sidebar-search-input"
              />
            </div>

            <div className="sessions-list">
              <div className="sessions-section-title">Projects & History</div>
              {sortedAndFilteredSessions.map((s) => (
                <div
                  key={s.id}
                  className={`session-item ${s.id === activeSessionId ? "active" : ""}`}
                  onClick={() => setActiveSessionId(s.id)}
                >
                  <span className="session-icon">{s.pinned ? "📌" : "📁"}</span>
                  <span className="session-title" title={s.title}>{s.title}</span>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <button
                      className={`pin-session-btn ${s.pinned ? "pinned" : ""}`}
                      onClick={(e) => togglePinSession(s.id, e)}
                    >
                      ★
                    </button>
                    <button
                      className="delete-session-btn"
                      onClick={(e) => deleteSession(s.id, e)}
                    >
                      ×
                    </button>
                  </div>
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
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {m.intent && <span className="intent-tag">{m.intent}</span>}
                      {m.role === "assistant" && (
                        <button 
                          className="tts-speaker-btn"
                          onClick={() => handleTextToSpeech(m.content, idx)}
                        >
                          {speakingIndex === idx ? "⏹ Stop" : "🔊 Listen"}
                        </button>
                      )}
                    </div>
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
                          code: StudioCodeBlock,
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {loading && <div className="chat-message assistant loading">⚡ Rishova Studio is generating multimodal output...</div>}
              <div ref={chatBottomRef} />
            </div>

            {selectedFiles.length > 0 && (
              <div className="selected-file-preview">
                <span>📎 {selectedFiles.length} file(s) attached: {selectedFiles.map((f) => f.name).join(", ")}</span>
                <button onClick={() => setSelectedFiles([])}>✖</button>
              </div>
            )}

            <form className="chat-input-area" onSubmit={handleSendPrompt}>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                style={{ display: "none" }}
                accept=".pdf,.txt,.md,.js,.py,.json,.csv,.sql,.png,.jpg,.jpeg,.webp,.mp3,.wav"
                onChange={(e) => {
                  if (e.target.files) {
                    setSelectedFiles(Array.from(e.target.files));
                  }
                }}
              />
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload Documents or Photos to Edit"
              >
                📎
              </button>

              <button
                type="button"
                className="attach-btn"
                onClick={handleClearCurrentChat}
                title="Clear Current Chat"
              >
                🗑️
              </button>

              <button
                type="button"
                className={`voice-btn ${isListening ? "listening" : ""}`}
                onClick={handleToggleVoice}
                title="Voice Input"
              >
                {isListening ? "🔴" : "🎤"}
              </button>

              <input
                type="text"
                placeholder={
                  isListening
                    ? "Listening... Speak now..."
                    : selectedFiles.length > 0
                    ? `Describe how to edit this photo or ask about files...`
                    : "Build software, architecture, generate/edit images, or click '💡 Templates'..."
                }
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={loading}
              />
              <button type="submit" disabled={loading || (!inputPrompt.trim() && selectedFiles.length === 0)}>Send</button>
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
                  <button 
                    className="action-btn"
                    onClick={handleExecuteActiveCode}
                    disabled={isRunningCode}
                    style={{ background: "#16a34a", borderColor: "#22c55e", color: "#fff", fontWeight: "600" }}
                  >
                    {isRunningCode ? "⏳ Running..." : "▶ Run Code"}
                  </button>
                  <button className="action-btn" onClick={() => copyToClipboard(currentFile ? currentFile.code : "")}>
                    📋 Copy
                  </button>
                  <button className="action-btn download-btn" onClick={downloadProjectZip}>
                    📦 ZIP
                  </button>
                </div>
              )}
            </div>

            <div className="workspace-content">
              {activeTab === "code" && (
                <div className="code-viewer-area" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  {Object.keys(activeSession.workspaceFiles).length > 0 ? (
                    <div className="multi-file-workspace" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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

                      <div className="active-code-card" style={{ flex: isRunOutputVisible ? "0 0 65%" : "1" }}>
                        <Editor
                          height="100%"
                          language="javascript"
                          theme="vs-dark"
                          value={currentFile ? currentFile.code : ""}
                          onChange={handleEditorCodeChange}
                          options={{
                            fontSize: 14,
                            fontFamily: "'Fira Code', 'Consolas', monospace",
                            minimap: { enabled: false },
                            automaticLayout: true,
                          }}
                        />
                      </div>

                      {isRunOutputVisible && (
                        <div style={{ flex: "0 0 35%", background: "#0a0a0c", borderTop: "1px solid #27272a", padding: "10px" }}>
                          <pre style={{ margin: 0, color: "#e4e4e7", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
                            {runOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="canvas-placeholder">
                      <p>💻 Monaco Code Workspace Ready</p>
                      <span>Ask Rishova AI to build software or click '💡 Templates' above.</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "preview" && (
                <div className="live-preview-container" style={{ width: "100%", height: "100%" }}>
                  <iframe
                    title="Live Web Sandbox"
                    srcDoc={getLivePreviewSource()}
                    sandbox="allow-scripts allow-modals allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                    allowFullScreen
                    className="sandbox-iframe"
                    style={{ width: "100%", height: "100%", border: "none" }}
                  />
                </div>
              )}

              {activeTab === "canvas" && (
                <div 
                  className="canvas-area"
                  ref={canvasContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                >
                  {activeSession.activeDiagram ? (
                    <div ref={diagramRef} className="mermaid-wrapper" />
                  ) : (
                    <div className="canvas-placeholder">
                      <p>🎨 Interactive Architecture Canvas Ready</p>
                      <span>Ask Rishova to generate a system architecture or flowchart.</span>
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