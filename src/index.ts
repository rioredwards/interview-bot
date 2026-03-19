import "dotenv/config";
import { createApp } from "./app.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

const app = createApp();

const PORT = process.env.PORT || 3333;
const SHUTDOWN_GRACE_MS = parsePositiveInt(process.env.SHUTDOWN_GRACE_MS, 10000);
const server = app.listen(PORT, () =>
  console.log(`Interview bot listening on port ${PORT}`),
);

let isShuttingDown = false;

function shutdown(signal: "SIGTERM" | "SIGINT"): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`Received ${signal}. Starting graceful shutdown...`);

  server.close((error) => {
    if (error) {
      console.error("Error during server shutdown:", error);
      process.exit(1);
      return;
    }
    console.log("HTTP server closed. Shutdown complete.");
    process.exit(0);
  });

  if (typeof server.closeIdleConnections === "function") {
    server.closeIdleConnections();
  }

  const forceShutdownTimer = setTimeout(() => {
    console.error(
      `Graceful shutdown exceeded ${SHUTDOWN_GRACE_MS}ms. Forcing exit.`,
    );
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceShutdownTimer.unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
