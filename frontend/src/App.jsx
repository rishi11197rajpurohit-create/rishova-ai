import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

const BACKEND_URL = "https://rishova-ai-backend.onrender.com";

export default function App() {
  // Always create a fresh new chat on fresh visit, but retain past chats in history
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem("rishova_chat_sessions");
      const initialChat = { id: String(Date.now()), title: "New chat", messages: [] };
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If first chat is already empty, reuse it, otherwise prepend fresh chat
          if (parsed[0].messages.length === 0) return parsed;
          return [initialChat, ...parsed];
        }
      }
      return [initialChat];
    } catch (e) {
      return [{ id: String(Date.now()), title: "New chat", messages: [] }];
    }
  });

  const [currentId, setCurrentId] = useState(() => sessions[0]?.id || "1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  // Multiple files support & side-by-side preview
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [previewPdfUrl, setPreviewPdfUrl] = useState(null);
  const [previewPdfName, setPreviewPdfName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  // Voice & Edit
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const baseInputRef = useRef("");

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

  // Voice setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "hi-IN";

      recog.onresult = (event) => {
        let liveTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          liveTranscript += event.results[i][0].transcript;
        }
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
      alert("Browser me speech recognition supported nahi hai.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      baseInputRef.current = input;
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const toggleSpeak = (text, idx) => {
    if (!window.speechSynthesis) return;
    if (speakingIndex === idx) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanSpeech = text.replace(/[*#`_~\[\]]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = "hi-IN";
    utterance.rate = 1.0;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(idx);
    window.speechSynthesis.speak(utterance);
  };

  // Upload Multiple Files
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFile(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    // Also store local object URL for instant side preview
    const firstPdf = files.find((f) => f.type === "application/pdf");
    if (firstPdf) {
      const url = URL.createObjectURL(firstPdf);
      setPreviewPdfUrl(url);
      setPreviewPdfName(firstPdf.name);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setAttachedFiles((prev) => [...prev, ...data.files]);
    } catch (err) {
      alert("Files upload karne me dikkat aayi. Kripya dobara try karein.");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleNewChat = () => {
    if (loading && abortControllerRef.current) abortControllerRef.current.abort();
    window.speechSynthesis?.cancel();
    setSpeakingIndex(null);
    setAttachedFiles([]);
    setPreviewPdfUrl(null);
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
    const rawText = (overrideText || input).trim();
    if ((!rawText && attachedFiles.length === 0) || loading) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    let fullPrompt = rawText;
    let displayPrompt = rawText;

    if (attachedFiles.length > 0) {
      const docsSummary = attachedFiles.map((f) => `--- FILE: "${f.filename}" ---\n${f.text}`).join("\n\n");
      const fileNames = attachedFiles.map((f) => f.filename).join(", ");
      fullPrompt = `[Attached Documents: ${fileNames}]\n${docsSummary}\n\nUser Question: ${rawText || "Please explain and summarize these documents."}`;
      displayPrompt = `📎 [Attached: ${fileNames}]\n\n${rawText || "In documents ke baare me batao."}`;
      setAttachedFiles([]);
    }

    const userMsg = { role: "user", content: fullPrompt, display: displayPrompt };
    const initialAiMsg = { role: "assistant", content: "" };

    const baseHistory = customHistory !== null 
      ? customHistory.filter((m) => m.content && m.content.trim() !== "")
      : currentSession.messages.filter((m) => m.content && m.content.trim() !== "");

    const conversationPayload = [...baseHistory, { role: "user", content: fullPrompt }];
    const updatedMessages = [...baseHistory, userMsg, initialAiMsg];

    const isFirst = baseHistory.length === 0;
    const titleSeed = displayPrompt.replace(/\[Attached.*?\]/g, "").trim() || "Chat";
    const newTitle = isFirst ? (titleSeed.slice(0, 26) + (titleSeed.length > 26 ? "..." : "")) : currentSession.title;

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
          prompt: fullPrompt,
          messages: conversationPayload,
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
            msgs[msgs.length - 1] = { role: "assistant", content: "Connection issue. Please retry in a few seconds." };
            return { ...s, messages: msgs };
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

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
    <div className="chatgpt-container dark">
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

      {/* Main Workspace Area (Split Screen if PDF Open) */}
      <div className="workspace-layout">
        <main className="main-area">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                ☰
              </button>
              <span className="brand-name">Rishova AI</span>
            </div>

            <div className="topbar-right">
              {previewPdfUrl && (
                <button className="export-btn" onClick={() => setPreviewPdfUrl(null)}>
                  ✕ Close PDF
                </button>
              )}
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
                            <div className="user-text">{m.display || m.content}</div>
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
                            <div style={{ color: "#888", fontSize: "0.9rem" }}>Thinking...</div>
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
                              <button
                                className="msg-action-btn"
                                onClick={() => toggleSpeak(m.content, idx)}
                                title="Read response aloud"
                              >
                                {speakingIndex === idx ? "⏹ Stop" : "🔊 Read Aloud"}
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
            {/* Multi-file preview tag list */}
            {attachedFiles.length > 0 && (
              <div className="multi-file-tray">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="file-chip">
                    <span>📄 {f.filename}</span>
                    <button onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="input-dock">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                multiple
                accept=".pdf,.txt,.py,.js,.html,.json,.md"
                onChange={handleFileUpload}
              />

              <button
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload multiple PDFs or text files"
                disabled={uploadingFile}
              >
                {uploadingFile ? "⏳" : "📎"}
              </button>

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
                placeholder={attachedFiles.length > 0 ? "Ask anything about attached files..." : "Message Rishova AI..."}
              />

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
                  disabled={!input.trim() && attachedFiles.length === 0}
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

        {/* ChatGPT Style Side-by-Side PDF Viewer */}
        {previewPdfUrl && (
          <aside className="pdf-side-viewer">
            <div className="pdf-viewer-header">
              <span>📄 {previewPdfName}</span>
              <button onClick={() => setPreviewPdfUrl(null)}>✕</button>
            </div>
            <iframe src={previewPdfUrl} title="Document Preview" className="pdf-iframe" />
          </aside>
        )}
      </div>
    </div>
  );
}