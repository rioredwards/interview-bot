import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp();

const server = app.listen(config.PORT, () =>
  console.log(`Interview bot listening on port ${config.PORT}`),
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
      `Graceful shutdown exceeded ${config.SHUTDOWN_GRACE_MS}ms. Forcing exit.`,
    );
    process.exit(1);
  }, config.SHUTDOWN_GRACE_MS);
  forceShutdownTimer.unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
