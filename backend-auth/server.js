import express from "express";
import mysql from "mysql2";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "defaultdb",
  ssl: process.env.DB_HOST !== "localhost" ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const generateToken = (payload) => {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

const parseToken = (token) => {
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
  } catch (e) {
    return null;
  }
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Malformed authorization header" });

  const decoded = parseToken(token);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.user = decoded;
  next();
};

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)";
    db.query(sql, [name, email, hash], (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({ error: "Email already exists." });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ message: "Registration successful!" });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results || results.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });

    res.json({
      message: "Login successful!",
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });
});

app.post("/api/diagrams/save", authenticate, (req, res) => {
  const { title, prompt, mermaid_code } = req.body;
  const sql = "INSERT INTO diagrams (user_id, title, prompt, mermaid_code) VALUES (?, ?, ?, ?)";
  db.query(sql, [req.user.id, title || "Untitled Diagram", prompt || "", mermaid_code || ""], (err, result) => {
    if (err) {
      console.error("Save Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Diagram saved successfully!", id: result.insertId });
  });
});

app.get("/api/diagrams/history", authenticate, (req, res) => {
  const sql = "SELECT id, title, prompt, mermaid_code, created_at FROM diagrams WHERE user_id = ? ORDER BY created_at DESC";
  db.query(sql, [req.user.id], (err, results) => {
    if (err) {
      console.error("Fetch History Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.delete("/api/diagrams/:id", authenticate, (req, res) => {
  const sql = "DELETE FROM diagrams WHERE id = ? AND user_id = ?";
  db.query(sql, [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Diagram deleted." });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Node Auth & Storage running on port ${PORT}`));