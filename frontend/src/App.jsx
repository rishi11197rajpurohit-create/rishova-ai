import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

const BACKEND_URL = "https://rishova-ai-backend.onrender.com";

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
  const [copiedKey, setCopiedKey] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

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

  const handleNewChat = () => {
    if (loading && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
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

  const handleSend = async (overrideText = null) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const initialAiMsg = { role: "assistant", content: "" };
    const historyBeforeThis = [...currentSession.messages];
    const updatedMessages = [...historyBeforeThis, userMsg, initialAiMsg];

    const isFirst = currentSession.messages.length === 0;
    const newTitle = isFirst ? (text.slice(0, 26) + (text.length > 26 ? "..." : "")) : currentSession.title;

    setSessions((prev) =>
      prev.map((s) => (s.id === currentId ? { ...s, title: newTitle, messages: updatedMessages } : s))
    );

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    abortControllerRef.current = new AbortController();

    try {
      // Send conversation history so Rishova remembers previous queries
      const conversationPayload = [...historyBeforeThis, userMsg];

      const res = await fetch(`${BACKEND_URL}/api/ai/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          messages: conversationPayload,
          user_email: "Rishikesh"
        }),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      if (res.body && res.body.getReader) {
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
      } else {
        const data = await res.json();
        const reply = data?.data?.markdown_response || data?.detail || "Kripya dobara try karein.";
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== currentId) return s;
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { role: "assistant", content: reply };
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
            msgs[msgs.length - 1] = { role: "assistant", content: "Backend se connect nahi ho paya. Kripya dobara try karein." };
            return { ...s, messages: msgs };
          })
        );
      }
    } finally {
      setLoading(false);
    }
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
            <span className="model-badge">Qwen 3 (27B Engine)</span>
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
                      <div className="user-text">{m.content}</div>
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