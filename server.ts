import express from "express";
import path from "path";
import { spawn, execSync } from "child_process";
import { createServer as createViteServer } from "vite";

let cachedPythonCmd: string | null = null;

function getPythonCommand(): string {
  if (cachedPythonCmd) return cachedPythonCmd;
  if (process.env.PYTHON_CMD) {
    cachedPythonCmd = process.env.PYTHON_CMD;
    return cachedPythonCmd;
  }

  // Windows installers install 'python.exe' and 'py.exe', not 'python3.exe'.
  // Linux/macOS typically provide 'python3'.
  const isWindows = process.platform === "win32";
  const candidates = isWindows
    ? ["python", "py", "python3"]
    : ["python3", "python", "py"];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore" });
      cachedPythonCmd = cmd;
      return cmd;
    } catch {
      // try next candidate
    }
  }

  // Fallback default if detection is uncertain
  cachedPythonCmd = isWindows ? "python" : "python3";
  return cachedPythonCmd;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    const pyCmd = getPythonCommand();
    res.json({
      status: "ok",
      service: "BatteryRUL Simulator API",
      pythonCommand: pyCmd,
      platform: process.platform,
      timestamp: new Date().toISOString(),
    });
  });

  // Run simulation via Python Backend Engine (CLI stdin)
  app.post("/api/simulate", (req, res) => {
    const { battery, load, temperature_c } = req.body;

    if (!battery || !load) {
      return res.status(400).json({ error: "Both 'battery' and 'load' configurations are required." });
    }

    const payload = JSON.stringify({
      battery,
      load,
      temperature_c: temperature_c ?? 25.0,
    });

    const pythonCmd = getPythonCommand();
    let hasSentResponse = false;

    const pyProcess = spawn(pythonCmd, ["-m", "battery_engine.cli", "--stdin", "--format", "json"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: process.cwd() },
    });

    let stdoutData = "";
    let stderrData = "";

    // Error handling on process spawn (e.g. ENOENT if executable missing)
    pyProcess.on("error", (err) => {
      console.error(`[Server] Failed to spawn Python process ('${pythonCmd}'):`, err);
      if (!hasSentResponse) {
        hasSentResponse = true;
        res.status(500).json({
          error: `Could not start Python engine with '${pythonCmd}'. Ensure Python 3 is installed and in your system PATH.`,
          details: err.message,
          code: (err as any).code,
        });
      }
    });

    try {
      pyProcess.stdin.write(payload);
      pyProcess.stdin.end();
    } catch (writeErr) {
      console.error("[Server] Error writing payload to Python stdin:", writeErr);
    }

    pyProcess.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    pyProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    pyProcess.on("close", (code) => {
      if (hasSentResponse) return;
      hasSentResponse = true;

      if (code !== 0) {
        console.error("[Server] Python CLI Error:", stderrData);
        return res.status(500).json({
          error: "Simulation execution failed in Python engine",
          details: stderrData || stdoutData,
          exitCode: code,
        });
      }

      try {
        const report = JSON.parse(stdoutData);
        res.json(report);
      } catch (err) {
        console.error("[Server] JSON Parse error:", err, "Raw stdout:", stdoutData);
        res.status(500).json({
          error: "Failed to parse simulation output JSON from Python backend",
          rawOutput: stdoutData,
          stderr: stderrData,
        });
      }
    });
  });

  // Run Python CLI with specific command arguments and return raw ASCII output
  app.post("/api/cli-run", (req, res) => {
    const { args = [], stdinData } = req.body;
    const startTime = Date.now();
    const pythonCmd = getPythonCommand();
    let hasSentResponse = false;

    const pyProcess = spawn(pythonCmd, ["-m", "battery_engine.cli", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: process.cwd() },
    });

    let stdoutData = "";
    let stderrData = "";

    pyProcess.on("error", (err) => {
      console.error(`[Server] Failed to spawn Python process ('${pythonCmd}'):`, err);
      if (!hasSentResponse) {
        hasSentResponse = true;
        res.status(500).json({
          error: `Could not start Python CLI with '${pythonCmd}'. Ensure Python 3 is installed and in your system PATH.`,
          details: err.message,
          code: (err as any).code,
        });
      }
    });

    try {
      if (stdinData) {
        pyProcess.stdin.write(typeof stdinData === "string" ? stdinData : JSON.stringify(stdinData));
        pyProcess.stdin.end();
      } else {
        pyProcess.stdin.end();
      }
    } catch (writeErr) {
      console.error("[Server] Error writing to Python stdin:", writeErr);
    }

    pyProcess.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    pyProcess.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    pyProcess.on("close", (code) => {
      if (hasSentResponse) return;
      hasSentResponse = true;

      const durationMs = Date.now() - startTime;
      res.json({
        exitCode: code,
        stdout: stdoutData,
        stderr: stderrData,
        executionTimeMs: durationMs,
      });
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BatteryRUL Simulator server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
