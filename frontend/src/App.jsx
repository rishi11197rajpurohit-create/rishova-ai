import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://rishova-ai-backend.onrender.com";

export default function App() {
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem("rishova_chat_sessions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [{ id: "1", title: "New Chat", messages: [] }];
  });

  const [currentId, setCurrentId] = useState(() => sessions[0]?.id || "1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  const currentSession = sessions.find((s) => s.id === currentId) || sessions[0];

  useEffect(() => {
    try {
      localStorage.setItem("rishova_chat_sessions", JSON.stringify(sessions));
    } catch (e) {}
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages, loading]);

  const handleNewChat = () => {
    const newId = String(Date.now());
    const newSession = { id: newId, title: "New Chat", messages: [] };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentId(newId);
  };

  const handleClearAll = () => {
    const initial = [{ id: "1", title: "New Chat", messages: [] }];
    setSessions(initial);
    setCurrentId("1");
    localStorage.removeItem("rishova_chat_sessions");
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const updatedMessages = [...currentSession.messages, userMsg];

    // Update title on first message
    const isFirst = currentSession.messages.length === 0;
    const newTitle = isFirst ? (text.slice(0, 24) + (text.length > 24 ? "..." : "")) : currentSession.title;

    setSessions((prev) =>
      prev.map((s) => (s.id === currentId ? { ...s, title: newTitle, messages: updatedMessages } : s))
    );
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/ai/universal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          model: "llama3-8b-8192",
          user_email: "Rishikesh"
        })
      });

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

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "#212121", color: "#ececec", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* ChatGPT Style Sidebar */}
      <div style={{ width: sidebarOpen ? "260px" : "0px", transition: "width 0.2s ease", background: "#171717", display: "flex", flexDirection: "column", overflow: "hidden", borderRight: sidebarOpen ? "1px solid #2f2f2f" : "none" }}>
        <div style={{ padding: "12px", display: "flex", gap: "8px" }}>
          <button
            onClick={handleNewChat}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", background: "#212121", border: "1px solid #383838", color: "#fff", padding: "10px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "0.88rem", fontWeight: 500 }}
          >
            <span style={{ fontSize: "1.1rem" }}>+</span> New chat
          </button>
        </div>

        {/* Chat History List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 10px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ fontSize: "0.75rem", color: "#8e8e8e", padding: "8px 6px", fontWeight: 600 }}>Recent Chats</div>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setCurrentId(s.id)}
              style={{
                padding: "9px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.86rem",
                background: s.id === currentId ? "#2f2f2f" : "transparent",
                color: s.id === currentId ? "#fff" : "#b4b4b4",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              💬 {s.title}
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div style={{ padding: "14px", borderTop: "1px solid #2f2f2f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", fontWeight: 600 }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#10a37f", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>R</div>
            <span>Rishikesh</span>
          </div>
          <button onClick={handleClearAll} title="Clear all chats" style={{ background: "transparent", border: "none", color: "#8e8e8e", cursor: "pointer", fontSize: "0.75rem" }}>Clear</button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
        {/* Top Minimal Bar */}
        <div style={{ height: "48px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: "1px solid #2f2f2f" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: "transparent", border: "none", color: "#b4b4b4", fontSize: "1.2rem", cursor: "pointer" }}
            >
              ☰
            </button>
            <span style={{ fontWeight: 700, fontSize: "1.05rem", letterSpacing: "0.3px", color: "#fff" }}>Rishova AI</span>
            <span style={{ fontSize: "0.72rem", background: "#2f2f2f", color: "#10a37f", padding: "2px 8px", borderRadius: "6px", fontWeight: 600 }}>Llama 3.3 70B</span>
          </div>
        </div>

        {/* Chat Feed */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {currentSession.messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", color: "#8e8e8e" }}>
              <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: "#10a37f", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "1.5rem", fontWeight: 700 }}>
                R
              </div>
              <h2 style={{ color: "#ececec", fontSize: "1.4rem", fontWeight: 600 }}>Rishova AI se aap kya poochna chahte hain?</h2>
              <p style={{ fontSize: "0.9rem" }}>Code, writing, Hindi/Hinglish analysis, questions — kuch bhi likhein.</p>
            </div>
          ) : (
            <div style={{ maxWidth: "768px", width: "100%", margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: "22px" }}>
              {currentSession.messages.map((m, idx) => (
                <div key={idx} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: m.role === "user" ? "#5436DA" : "#10a37f",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {m.role === "user" ? "U" : "R"}
                  </div>
                  <div style={{ flex: 1, fontSize: "0.95rem", lineHeight: "1.6", color: "#ececec", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", gap: "14px", alignItems: "center", color: "#8e8e8e", fontSize: "0.9rem" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#10a37f", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>R</div>
                  <span>Thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{ padding: "16px", background: "transparent" }}>
          <div style={{ maxWidth: "768px", margin: "0 auto", position: "relative", background: "#2f2f2f", borderRadius: "24px", border: "1px solid #3d3d3d", display: "flex", alignItems: "center", padding: "6px 14px" }}>
            <textarea
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
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: "0.95rem",
                padding: "8px 6px",
                resize: "none",
                fontFamily: "inherit"
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                background: input.trim() && !loading ? "#fff" : "#424242",
                color: input.trim() && !loading ? "#000" : "#8e8e8e",
                border: "none",
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "1.1rem"
              }}
            >
              ↑
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: "0.72rem", color: "#777", marginTop: "8px" }}>
            Rishova AI can make mistakes. Verify important information.
          </div>
        </div>
      </div>
    </div>
  );
}