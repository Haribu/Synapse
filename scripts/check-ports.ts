#!/usr/bin/env bun
/**
 * Synapse Port Availability Check
 * Verifies that the host port configured in .env (default: 3000) is free.
 */
import { createServer } from "net";

const port = parseInt(process.env.HOST_PORT || "3000", 10);
const server = createServer();

server.once("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${port} is already in use by another process.`);
    console.error(`Set HOST_PORT in .env to an available port, e.g. HOST_PORT=3005`);
    process.exit(1);
  } else {
    console.error("Port check error:", err);
    process.exit(1);
  }
});

server.once("listening", () => {
  server.close(() => {
    console.log(`✓ Port ${port} is available for Synapse.`);
    process.exit(0);
  });
});

server.listen(port);
