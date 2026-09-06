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
  const [copiedIndex, setCopiedIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const currentSession = sessions.find((s) => s.id === currentId) || sessions[0];

  useEffect(() => {
    try {
      localStorage.setItem("rishova_chat_sessions", JSON.stringify(sessions));
    } catch (e) {}
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages, loading]);

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleNewChat = () => {
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

  const handleSend = async (overrideText = null) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const updatedMessages = [...currentSession.messages, userMsg];

    const isFirst = currentSession.messages.length === 0;
    const newTitle = isFirst ? (text.slice(0, 26) + (text.length > 26 ? "..." : "")) : currentSession.title;

    setSessions((prev) =>
      prev.map((s) => (s.id === currentId ? { ...s, title: newTitle, messages: updatedMessages } : s))
    );

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          user_email: "Rishikesh"
        })
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      const reply = data?.data?.markdown_response || data?.detail || "Kuch dikkat aayi, kripya dobara try karein.";

      const aiMsg = { role: "assistant", content: reply };
      setSessions((prev) =>
        prev.map((s) => (s.id === currentId ? { ...s, messages: [...updatedMessages, aiMsg] } : s))
      );
    } catch (err) {
      const errReply = { role: "assistant", content: "Backend se connect nahi ho paya. Kripya Render status check karein." };
      setSessions((prev) =>
        prev.map((s) => (s.id === currentId ? { ...s, messages: [...updatedMessages, errReply] } : s))
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(key);
    setTimeout(() => setCopiedIndex(null), 2000);
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

      {/* Main Content Area */}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              ☰
            </button>
            <span className="brand-name">Rishova AI</span>
            <span className="model-badge">Qwen 3 (27B)</span>
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
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || "");
                              const codeString = String(children).replace(/\n$/, "");
                              const blockKey = `${idx}-${codeString.slice(0, 10)}`;

                              return !inline ? (
                                <div className="code-block-wrapper">
                                  <div className="code-header">
                                    <span>{match ? match[1] : "code"}</span>
                                    <button
                                      className="copy-btn"
                                      onClick={() => copyToClipboard(codeString, blockKey)}
                                    >
                                      {copiedIndex === blockKey ? "✓ Copied!" : "📋 Copy code"}
                                    </button>
                                  </div>
                                  <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match ? match[1] : "text"}
                                    PreTag="div"
                                    customStyle={{ margin: 0, padding: "12px 16px", background: "#0d0d0d", fontSize: "0.88rem" }}
                                    {...props}
                                  >
                                    {codeString}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className="inline-code" {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>

                        {/* Copy entire assistant message */}
                        <div className="message-actions">
                          <button
                            className="msg-action-btn"
                            onClick={() => copyToClipboard(m.content, `msg-${idx}`)}
                          >
                            {copiedIndex === `msg-${idx}` ? "✓ Copied response" : "📋 Copy"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message-row assistant">
                  <div className="avatar assistant-avatar">R</div>
                  <div className="bubble">
                    <div className="typing-dots">Thinking...</div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Input Dock */}
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
            <button
              className="send-btn"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
            >
              ↑
            </button>
          </div>
          <div className="disclaimer">
            Rishova AI can make mistakes. Verify important information.
          </div>
        </div>
      </main>
    </div>
  );
}