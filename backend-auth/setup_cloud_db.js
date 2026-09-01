import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 13227,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    });

    console.log("Connected to Aiven MySQL Cloud!");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✔ Users table created/verified.");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS diagrams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        prompt TEXT,
        mermaid_code LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    console.log("✔ Diagrams table created/verified.");

    await connection.end();
    console.log("Database setup successfully completed!");
  } catch (err) {
    console.error("Cloud DB Setup Error:", err.message);
  }
}

initDB();
