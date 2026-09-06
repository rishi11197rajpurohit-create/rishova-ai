import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

const BACKEND_URL = "https://rishova-ai-backend.onrender.com";

const AVAILABLE_MODELS = [
  { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 (27B)" },
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 (27B)" },
  { id: "allam-2-7b", label: "Allam 2 (7B Fast)" }
];

export default function App() {
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem("rishova_chat_sessions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [{ id: "1", title: "New chat", messages: [] }];
  });

  const [currentId, setCurrentId] = useState(() => sessions[0]?.id || "1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState("qwen/qwen3.6-27b");
  const [copiedKey, setCopiedKey] = useState(null);
  
  // Voice & Edit states
  const [isListening, setIsListening] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);
  const recognitionRef = useRef(null);

  const currentSession = sessions.find((s) => s.id === currentId) || sessions[0];

  useEffect(() => {
    try {
      localStorage.setItem("rishova_chat_sessions", JSON.stringify(sessions));
    } catch (e) {}
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Real-time Voice Typing (Live Streaming)
  const baseInputRef = useRef(""); // पिछला टाइप किया हुआ टेक्स्ट याद रखने के लिए

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = true;       // जब तक खुद बंद न करें, सुनता रहेगा
      recog.interimResults = true;    // बोलते ही तुरंत शब्द स्क्रीन पर दिखाएगा
      recog.lang = "hi-IN";

      recog.onresult = (event) => {
        let liveTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          liveTranscript += event.results[i][0].transcript;
        }
        
        // पुराने टेक्स्ट के आगे बोलते हुए शब्द लाइव जोड़ना
        const prefix = baseInputRef.current ? baseInputRef.current + " " : "";
        setInput(prefix + liveTranscript);
      };

      recog.onerror = () => setIsListening(false);
      recog.onend = () => setIsListening(false);
      recognitionRef.current = recog;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert("Aapke browser me speech recognition support nahi hai. Chrome ya Edge use karein.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      baseInputRef.current = input; // बोलने से पहले का टेक्स्ट सेव करें
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert("Aapke browser me speech recognition support nahi hai. Chrome ya Edge use karein.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleNewChat = () => {
    if (loading && abortControllerRef.current) abortControllerRef.current.abort();
    const newId = String(Date.now());
    const newSession = { id: newId, title: "New chat", messages: [] };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentId(newId);
  };

  const handleDeleteSession = (id, e) => {
    e.stopPropagation();
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh = [{ id: String(Date.now()), title: "New chat", messages: [] }];
      setSessions(fresh);
      setCurrentId(fresh[0].id);
    } else {
      setSessions(remaining);
      if (currentId === id) setCurrentId(remaining[0].id);
    }
  };

  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  };

  const exportChat = () => {
    if (!currentSession.messages || currentSession.messages.length === 0) return;
    let exportContent = `# ${currentSession.title}\nExported from Rishova AI\n\n---\n\n`;
    currentSession.messages.forEach((m) => {
      const speaker = m.role === "user" ? "### 👤 User" : "### 🤖 Rishova AI";
      exportContent += `${speaker}\n\n${m.content}\n\n---\n\n`;
    });

    const blob = new Blob([exportContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentSession.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = async (overrideText = null, customHistory = null) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const initialAiMsg = { role: "assistant", content: "" };

    const baseHistory = customHistory !== null 
      ? customHistory 
      : currentSession.messages.filter((m) => m.content.trim() !== "");

    const conversationPayload = [...baseHistory, userMsg];
    const updatedMessages = [...baseHistory, userMsg, initialAiMsg];

    const isFirst = baseHistory.length === 0;
    const newTitle = isFirst ? (text.slice(0, 26) + (text.length > 26 ? "..." : "")) : currentSession.title;

    setSessions((prev) =>
      prev.map((s) => (s.id === currentId ? { ...s, title: newTitle, messages: updatedMessages } : s))
    );

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          messages: conversationPayload,
          model: selectedModel,
          user_email: "Rishikesh"
        }),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamedText += chunk;

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== currentId) return s;
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { role: "assistant", content: streamedText };
            return { ...s, messages: msgs };
          })
        );
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== currentId) return s;
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { role: "assistant", content: "Kuch dikkat aayi. Kripya dobara try karein." };
            return { ...s, messages: msgs };
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Edit Message trigger
  const triggerEdit = (idx, currentMsg) => {
    setEditingIndex(idx);
    setEditText(currentMsg);
  };

  const submitEdit = (idx) => {
    if (!editText.trim()) return;
    const trimmedHistory = currentSession.messages.slice(0, idx);
    setEditingIndex(null);
    handleSend(editText, trimmedHistory);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="chatgpt-container">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <span>+</span> New chat
          </button>
        </div>

        <div className="history-list">
          <div className="history-label">Recent chats</div>
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`history-item ${s.id === currentId ? "active" : ""}`}
              onClick={() => setCurrentId(s.id)}
            >
              <span className="history-title">💬 {s.title}</span>
              <button
                className="delete-chat-btn"
                title="Delete chat"
                onClick={(e) => handleDeleteSession(s.id, e)}
              >
                🗑
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar user-avatar">R</div>
            <span>Rishikesh</span>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <span className="brand-name">Rishova AI</span>
            
            {/* Model Switcher Dropdown */}
            <select
              className="model-select-dropdown"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="topbar-right">
            {currentSession.messages.length > 0 && (
              <button className="export-btn" onClick={exportChat} title="Download chat as Markdown">
                📥 Export
              </button>
            )}
          </div>
        </header>

        <div className="chat-viewport">
          {currentSession.messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-logo">R</div>
              <h2>Rishova AI se aap kya poochna chahte hain?</h2>
              <div className="preset-grid">
                <button onClick={() => handleSend("Python me quick sort algorithm samjhao code ke sath")}>
                  💡 Python me quick sort algorithm
                </button>
                <button onClick={() => handleSend("Ek professional leave application email likho")}>
                  ✍️ Professional leave email
                </button>
                <button onClick={() => handleSend("Rishova AI kya kya kar sakta hai?")}>
                  ⚡ Rishova AI ke capabilities
                </button>
              </div>
            </div>
          ) : (
            <div className="messages-flow">
              {currentSession.messages.map((m, idx) => (
                <div key={idx} className={`message-row ${m.role}`}>
                  {m.role === "assistant" && <div className="avatar assistant-avatar">R</div>}

                  <div className="bubble">
                    {m.role === "user" ? (
                      editingIndex === idx ? (
                        <div className="edit-box-wrapper">
                          <textarea
                            className="edit-textarea"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                          <div className="edit-buttons">
                            <button className="edit-btn save" onClick={() => submitEdit(idx)}>Save & Submit</button>
                            <button className="edit-btn cancel" onClick={() => setEditingIndex(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="user-text-container">
                          <div className="user-text">{m.content}</div>
                          <button
                            className="edit-trigger-btn"
                            title="Edit message"
                            onClick={() => triggerEdit(idx, m.content)}
                          >
                            ✏️
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="markdown-body">
                        {m.content === "" && loading ? (
                          <div style={{ color: "#777", fontSize: "0.9rem" }}>Thinking...</div>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeString = String(children).replace(/\n$/, "");
                                const isMultiLine = codeString.includes("\n");
                                const blockKey = `code-${idx}-${codeString.slice(0, 8)}`;

                                if (match || isMultiLine) {
                                  return (
                                    <div className="code-block-wrapper">
                                      <div className="code-header">
                                        <span>{match ? match[1] : "code"}</span>
                                        <button
                                          className="copy-btn"
                                          onClick={() => copyToClipboard(codeString, blockKey)}
                                        >
                                          {copiedKey === blockKey ? "✓ Copied!" : "📋 Copy code"}
                                        </button>
                                      </div>
                                      <SyntaxHighlighter
                                        style={vscDarkPlus}
                                        language={match ? match[1] : "text"}
                                        PreTag="div"
                                        customStyle={{ margin: 0, padding: "14px 18px", background: "#1e1e1e", fontSize: "0.88rem" }}
                                        {...props}
                                      >
                                        {codeString}
                                      </SyntaxHighlighter>
                                    </div>
                                  );
                                }

                                return (
                                  <code className="inline-code" {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        )}

                        {m.role === "assistant" && m.content && (
                          <div className="message-actions">
                            <button
                              className="msg-action-btn"
                              onClick={() => copyToClipboard(m.content, `msg-${idx}`)}
                            >
                              {copiedKey === `msg-${idx}` ? "✓ Copied" : "📋 Copy response"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Dock */}
        <div className="input-dock-container">
          <div className="input-dock">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message Rishova AI..."
            />

            {/* Voice Input Button */}
            <button
              className={`mic-btn ${isListening ? "listening" : ""}`}
              onClick={toggleVoiceInput}
              title={isListening ? "Listening... click to stop" : "Speak (Voice input)"}
            >
              🎤
            </button>

            {loading ? (
              <button className="stop-btn" onClick={stopGenerating} title="Stop generating">
                ■
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={!input.trim()}
              >
                ↑
              </button>
            )}
          </div>
          <div className="disclaimer">
            Rishova AI can make mistakes. Verify important information.
          </div>
        </div>
      </main>
    </div>
  );
}