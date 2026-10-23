import { db, sqlite } from "@/lib/db";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "SYNC";

export interface LogEntry {
  level: LogLevel;
  tag: string;
  message: string;
  details?: Record<string, any>;
}

// Ensure system_logs table exists
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      tag TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS system_logs_created_idx ON system_logs(created_at DESC);
  `);
} catch (err) {
  console.error("Failed to initialize system_logs table", err);
}

class SynapseLogger {
  private formatConsole(level: LogLevel, tag: string, message: string, details?: any) {
    const timestamp = new Date().toISOString();
    const colors = {
      INFO: "\x1b[36m", // Cyan
      WARN: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      SYNC: "\x1b[32m", // Green
      RESET: "\x1b[0m",
      GRAY: "\x1b[90m",
      BOLD: "\x1b[1m",
    };

    const color = colors[level] || colors.RESET;
    const prefix = `${colors.GRAY}[${timestamp}]${colors.RESET} ${color}${colors.BOLD}[${level}]${colors.RESET} \x1b[35m[${tag}]\x1b[0m ${message}`;

    if (details) {
      return `${prefix}\n  ${colors.GRAY}${JSON.stringify(details)}${colors.RESET}`;
    }
    return prefix;
  }

  log(level: LogLevel, tag: string, message: string, details?: Record<string, any>) {
    // 1. Output to console for docker logs
    const formatted = this.formatConsole(level, tag, message, details);
    if (level === "ERROR") {
      console.error(formatted);
    } else if (level === "WARN") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // 2. Persist to SQLite for UI audit log & diagnostics
    try {
      const stmt = sqlite.prepare(`
        INSERT INTO system_logs (level, tag, message, details, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);
      stmt.run(level, tag, message, details ? JSON.stringify(details) : null);

      // Keep only last 1,000 logs to prevent bloat
      sqlite.exec(`
        DELETE FROM system_logs WHERE id IN (
          SELECT id FROM system_logs ORDER BY id DESC LIMIT -1 OFFSET 1000
        )
      `);
    } catch {
      // Avoid recursive failure
    }
  }

  info(tag: string, message: string, details?: Record<string, any>) {
    this.log("INFO", tag, message, details);
  }

  warn(tag: string, message: string, details?: Record<string, any>) {
    this.log("WARN", tag, message, details);
  }

  error(tag: string, message: string, details?: Record<string, any>) {
    this.log("ERROR", tag, message, details);
  }

  sync(tag: string, message: string, details?: Record<string, any>) {
    this.log("SYNC", tag, message, details);
  }

  getRecentLogs(limit = 100): Array<{
    id: number;
    level: LogLevel;
    tag: string;
    message: string;
    details: any;
    createdAt: string;
  }> {
    try {
      const rows = sqlite
        .prepare(`SELECT * FROM system_logs ORDER BY id DESC LIMIT ?`)
        .all(limit) as any[];

      return rows.map((r) => ({
        ...r,
        details: r.details ? JSON.parse(r.details) : null,
      }));
    } catch {
      return [];
    }
  }
}

export const logger = new SynapseLogger();
