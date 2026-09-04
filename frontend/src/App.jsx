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

const PROMPT_TEMPLATES = [
  {
    category: "🏗️ System Architecture",
    title: "Microservices Architecture Flowchart",
    prompt: "Design a complete scalable Microservices Architecture for an E-Commerce application with API Gateway, Auth Service, Product Catalog, Redis Cache, and Kafka message broker. Output a clean Mermaid.js flowchart in ```mermaid."
  },
  {
    category: "💻 Full-Stack Web App",
    title: "Realtime Task Management Board",
    prompt: "Build a single-file interactive Kanban Task Management Board with HTML, CSS, and vanilla JavaScript. Include drag-and-drop support, local storage persistence, and modern dark glassmorphism styling."
  },
  {
    category: "🧠 DSA & Algorithms",
    title: "Dynamic Programming: 0/1 Knapsack",
    prompt: "Explain the 0/1 Knapsack Problem with both Top-Down Memoization and Bottom-Up Tabulation in Python. Include step-by-step space & time complexity analysis and runnable test cases."
  },
  {
    category: "📊 Data Science & Analytics",
    title: "Sales Analytics & Trend Visualizer",
    prompt: "Create an interactive HTML and Chart.js analytics dashboard demonstrating quarterly sales performance, profit margins, and KPI metric cards with mock data."
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
    const extMap = { javascript: "js", python: "py", bash: "sh", json: "json", css: "css", html: "html", sql: "sql", srt: "srt", vtt: "vtt" };
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
        <SyntaxHighlighter "#131316", "'Fira "0.9rem", "1.6", "100%" "14px "auto", "block", "javascript"} "pre", 'Consolas', 0, 16px", Code', backgroundColor: codeTagProps="{{" customStyle="{{" display: fontFamily: fontSize: language="{lang" lineHeight: lineProps="{{" margin: monospace", overflowX: padding: showLineNumbers="{false}" style="{vscDarkPlus}" style: whiteSpace: width: wrapLines="{true}" { || } }}>
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
        content: "राम राम सा! Welcome to **RISHOVA AI Universal Studio**.\nAsk me to code, draw architecture diagrams, analyze data, or explore structured courses and videos.",
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

  // In-Browser Code Runner State
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
      const email = userName || "guest";
      const res = await fetch(`[https://rishova-ai-backend.onrender.com/api/usage/$](https://rishova-ai-backend.onrender.com/api/usage/$){email}`);
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
      const res = await fetch("[https://rishova-ai-backend.onrender.com/api/cloud/sync](https://rishova-ai-backend.onrender.com/api/cloud/sync)", {
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
    const handleWindowMessages = (event) => {
      if (!event.data) return;
      if (event.data.type === "PREVIEW_CONSOLE_LOG") {
        setConsoleLogs((prev) => [...prev, { level: event.data.level, message: event.data.message, time: new Date().toLocaleTimeString() }]);
      } else if (event.data.type === "OPEN_EXTERNAL_URL" && event.data.url) {
        window.open(event.data.url, "_blank", "noopener,noreferrer");
      }
    };
    window.addEventListener("message", handleWindowMessages);
    return () => window.removeEventListener("message", handleWindowMessages);
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

  // Run Code in Browser (Python & JavaScript)
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
        if (!window.loadPyodide) {
          throw new Error("Pyodide library not found. Please refresh the page.");
        }
        if (!pyodideRef.current) {
          setRunOutput("📦 Downloading and initializing WebAssembly Python kernel...\n");
          pyodideRef.current = await window.loadPyodide({
            indexURL: "[https://cdn.jsdelivr.net/pyodide/v0.25.0/full/](https://cdn.jsdelivr.net/pyodide/v0.25.0/full/)"
          });
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
        setRunOutput((prev) => prev + `\n❌ Python Runtime Error:\n${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    } else if (isJS) {
      try {
        setRunOutput("⚡ Executing JavaScript in Sandbox...\n--- [OUTPUT] ---\n");
        let outputBuffer = "";
        const customConsole = {
          log: (...args) => { outputBuffer += args.join(" ") + "\n"; },
          error: (...args) => { outputBuffer += "⚠️ " + args.join(" ") + "\n"; },
          warn: (...args) => { outputBuffer += "⚡ " + args.join(" ") + "\n"; }
        };
        const runFn = new Function("console", current.code);
        runFn(customConsole);
        setRunOutput((prev) => prev + (outputBuffer || "Code executed with no console.log() output.\n") + "\n✔ Execution finished.");
      } catch (err) {
        setRunOutput((prev) => prev + `\n❌ JavaScript Runtime Error:\n${err.message}`);
      } finally {
        setIsRunningCode(false);
      }
    } else {
      setRunOutput(`⚠️ Live execution is currently optimized for Python (.py) and JavaScript (.js). Switch to the '👁️ Preview' tab to render HTML/CSS live.`);
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
        content: "New workspace ready. What software, diagram, or courses would you like to explore?",
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
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, title: sessionTitle, messages: updatedMessages }
          : s
      )
    );

    setLoading(true);

    try {
      let res;
      if (attachedFilesList && attachedFilesList.length > 0) {
        const formData = new FormData();
        attachedFilesList.forEach((file) => {
          formData.append("files", file);
        });
        formData.append("prompt", userText);
        formData.append("model", selectedModel);
        formData.append("user_email", userName || "guest");

        res = await fetch("[https://rishova-ai-backend.onrender.com/api/ai/documents-multi](https://rishova-ai-backend.onrender.com/api/ai/documents-multi)", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("[https://rishova-ai-backend.onrender.com/api/ai/universal](https://rishova-ai-backend.onrender.com/api/ai/universal)", {
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
        if (data.intent === "CAREER" || data.intent === "LEARNING" || data.intent === "DATA" || data.intent === "VIDEO") {
          setActiveTab("preview");
        } else {
          setActiveTab("code");
        }
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

    triggerPromptExecution(actionPrompt, []);
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

      if (lower.endsWith(".html") || code.includes("<!DOCTYPE") || code.includes("<html") || code.includes("<header") || code.includes("hub-card")) {
        htmlContent = code;
      } else if (lower.endsWith(".css") || file.language === "css" || code.includes(":root") || (code.includes("{") && code.includes("margin") && code.includes("color"))) {
        cssContent += `\n<style>\n${code}\n</style>\n`;
      } else if ((lower.endsWith(".js") || file.language === "javascript") && !lower.includes("server") && !lower.includes("node") && !code.includes("express()")) {
        jsContent += `\n<script>\ntry {\n${code}\n} catch(err) { console.error('Preview JS Error:', err); }\n<\/script>\n`;
      }
    });

    if (!htmlContent) {
      const current = files[activeSession.selectedFileName];
      if (current && (current.language === "html" || current.code.includes("<div") || current.code.includes("<button") || current.code.includes("hub-card"))) {
        htmlContent = current.code;
      } else {
        htmlContent = `
          <div style="font-family: sans-serif; padding: 50px 20px; text-align: center; color: #a1a1aa; background: #0b0b0e; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <h2 style="color: #f4f4f5; margin-bottom: 10px;">⚡ Live Preview Sandbox</h2>
            <p style="font-size: 0.95rem;">Ask Rishova to generate an interactive app, diagram, or video hub to preview here.</p>
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

      {/* Prompt Templates Modal */}
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

      {/* Keyboard Shortcuts Modal */}
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
                  <td>AI Text-to-Speech Output (Hear response aloud)</td>
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

      {/* Settings Modal */}
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
                  <option value="gu">ગુજરાતી (Gujarati)</option>
                  <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
                  <option value="bn">বাংলা (Bengali)</option>
                  <option value="mr">मराठी (Marathi)</option>
                  <option value="ta">தமிழ் (Tamil)</option>
                  <option value="te">తెలుగు (Telugu)</option>
                  <option value="ur">اردو (Urdu)</option>
                </optgroup>
                <optgroup label="Global World Languages">
                  <option value="en">English (US/UK)</option>
                  <option value="es">Español (Spanish)</option>
                  <option value="fr">Français (French)</option>
                  <option value="de">Deutsch (German)</option>
                  <option value="ar">العربية (Arabic)</option>
                  <option value="ru">Русский (Russian)</option>
                  <option value="ja">日本語 (Japanese)</option>
                  <option value="zh">中文 (Chinese)</option>
                </optgroup>
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
              <label style={{ color: "#ef4444", fontWeight: 600, display: "block", marginBottom: "8px" }}>Storage & Cache Management:</label>
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
                      title={s.pinned ? "Unpin Project" : "Pin Project to Top"}
                    >
                      ★
                    </button>
                    <button
                      className="delete-session-btn"
                      onClick={(e) => deleteSession(s.id, e)}
                      title="Delete Project"
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
                          title="Read response aloud (Text-to-Speech)"
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
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "underline" }}>
                              {children}
                            </a>
                          )
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
              {loading && <div className="chat-message assistant loading">⚡ Rishova Studio is processing multimodal request...</div>}
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
                title="Upload Documents, Images (OCR), or Audio"
              >
                📎
              </button>

              <button
                type="button"
                className="attach-btn"
                onClick={handleClearCurrentChat}
                title="Clear Current Chat History"
                style={{ fontSize: "0.9rem" }}
              >
                🗑️
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
                    : selectedFiles.length > 0
                    ? `Ask anything about these ${selectedFiles.length} files...`
                    : "Build software, architecture, analyze data, or click '💡 Templates'..."
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
                    title="Run Active Code in Browser (Python/JS)"
                    style={{ background: "#16a34a", borderColor: "#22c55e", color: "#fff", fontWeight: "600" }}
                  >
                    {isRunningCode ? "⏳ Running..." : "▶ Run Code"}
                  </button>

                  <div className="ai-actions-group">
                    <button className="ai-action-btn" onClick={() => handleAIAction("explain")} title="Explain active code">
                      ⚡ Explain
                    </button>
                    <button className="ai-action-btn" onClick={() => handleAIAction("debug")} title="Scan for bugs">
                      🐛 Find Bugs
                    </button>
                    <button className="ai-action-btn" onClick={() => handleAIAction("optimize")} title="Refactor code">
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

                      {/* In-Browser Execution Output Terminal */}
                      {isRunOutputVisible && (
                        <div style={{ flex: "0 0 35%", background: "#0a0a0c", borderTop: "1px solid #27272a", display: "flex", flexDirection: "column" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px", background: "#18181b", borderBottom: "1px solid #27272a" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: "600", color: "#38bdf8" }}>💻 Terminal Execution Output</span>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button onClick={() => setRunOutput("")} style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "0.75rem" }}>Clear</button>
                              <button onClick={() => setIsRunOutputVisible(false)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.75rem" }}>✕ Close</button>
                            </div>
                          </div>
                          <pre style={{ margin: 0, padding: "12px", flex: 1, overflowY: "auto", fontFamily: "'Fira Code', monospace", fontSize: "0.82rem", color: "#e4e4e7", whiteSpace: "pre-wrap" }}>
                            {runOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="canvas-placeholder">
                      <p>💻 Monaco Code Workspace Ready</p>
                      <span>Ask Rishova AI to build software or click '💡 Templates' at the top to load a project.</span>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "preview" && (
                <div className="live-preview-container" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
                  <iframe
                    title="Live Web Sandbox"
                    srcDoc={getLivePreviewSource()}
                    sandbox="allow-scripts allow-modals allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
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