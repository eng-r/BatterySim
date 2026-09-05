import React, { useState } from "react";
import {
  Terminal,
  Play,
  Copy,
  Check,
  Code,
  Download,
  FileCode,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { BatterySpecification, ElectricalLoadProfile } from "../types";
import { runPythonCliCommand } from "../lib/simulation";

interface CliStudioViewProps {
  battery: BatterySpecification;
  load: ElectricalLoadProfile;
  ambientTempC: number;
}

export const CliStudioView: React.FC<CliStudioViewProps> = ({
  battery,
  load,
  ambientTempC,
}) => {
  const [outputFormat, setOutputFormat] = useState<"table" | "json">("table");
  const [includeSummary, setIncludeSummary] = useState<boolean>(true);
  const isWindowsHost = typeof navigator !== "undefined" && /win/i.test(navigator.userAgent);
  const [pyExecutable, setPyExecutable] = useState<"python" | "python3">(isWindowsHost ? "python" : "python3");
  const [cliOutput, setCliOutput] = useState<string | null>(null);
  const [cliExitCode, setCliExitCode] = useState<number | null>(null);
  const [cliDurationMs, setCliDurationMs] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Build the CLI command string
  const cliArgs = [
    "--battery-preset",
    battery.id || "lisocl2_saft_ls14500",
    "--load-preset",
    load.profile_id || "nbiot_asset_tracker",
    "--temp",
    ambientTempC.toString(),
    "--format",
    outputFormat,
  ];
  if (includeSummary) cliArgs.push("--summary");

  const fullCommandLine = `${pyExecutable} -m battery_engine.cli ${cliArgs.join(" ")}`;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(fullCommandLine);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleRunCli = async () => {
    setIsRunning(true);
    try {
      // Pass the current active configs via stdin or presets
      const res = await runPythonCliCommand(
        ["--stdin", "--format", outputFormat, ...(includeSummary ? ["--summary"] : [])],
        { battery, load, temperature_c: ambientTempC }
      );
      setCliOutput(res.stdout || res.stderr);
      setCliExitCode(res.exitCode);
      setCliDurationMs(res.executionTimeMs);
    } catch (err: any) {
      setCliOutput(`Execution Error: ${err.message}`);
      setCliExitCode(1);
    } finally {
      setIsRunning(false);
    }
  };

  const pythonAdapterSnippet = `#!/usr/bin/env python3
"""
Integration Example: Plug BatteryRUL Engine into your Python Application
"""
from battery_engine.adapters import BatterySimulatorAdapter
from battery_engine.models import LoadType, LoadSegment, ElectricalLoadProfile

# 1. Instantiate the Battery Adapter using preset or custom config
battery = BatterySimulatorAdapter.from_preset(
    "${battery.id}",
    ambient_temperature_c=${ambientTempC}.0
)

# 2. Interactive Real-time Step Injection (Firmware State Machine)
# Simulate MCU sleep state:
res_sleep = battery.step(dt_seconds=10.0, current_ma=0.0035, segment_name="Sleep")
print(f"Sleep State: V_term={res_sleep.terminal_voltage_v:.4f}V, SoC={res_sleep.soc_pct:.2f}%")

# Simulate High-Power Radio TX Pulse (e.g. NB-IoT / LoRaWAN uplink):
res_tx = battery.step(dt_seconds=1.5, current_ma=75.0, segment_name="RadioTX")
print(f"Radio TX:    V_term={res_tx.terminal_voltage_v:.4f}V (Sag: {(res_tx.ocv_v - res_tx.terminal_voltage_v)*1000:.1f}mV)")
print(f"Passivation Film Resistance: {res_tx.passivation_resistance_ohm:.2f} Ohms")

# 3. Simulate Full Multi-Year Duty Cycle & Predict End-of-Life (RUL)
from battery_engine.presets import LOAD_PRESETS
load_profile = LOAD_PRESETS["${load.profile_id}"]

report = battery.simulate_profile(load_profile)
print(f"Total Projected Life: {report.total_simulated_time_years:.2f} Years")
print(f"Duty Cycles Before Depletion: {report.total_cycles_completed:,} cycles")
print(f"Total Energy Delivered:       {report.total_energy_consumed_mwh:.1f} mWh")
print(f"Termination Reason:           {report.termination_reason}")

# Export full report JSON:
battery.export_results_json("sim_results.json", report)
`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(pythonAdapterSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const downloadPythonClientApp = () => {
    const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(pythonAdapterSnippet);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "iot_battery_monitor.py");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md">
              Developer & Integration Studio
            </span>
            <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
              Python 3.10+ Native OOP
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">CLI & Adapter Architecture</h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Execute the simulator via command-line arguments or import <code className="font-mono text-violet-600 font-semibold">BatterySimulatorAdapter</code> into other Python applications.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            onClick={downloadPythonClientApp}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .PY Script</span>
          </button>
        </div>
      </div>

      {/* CLI Section */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-900">Live CLI Command Generator</h3>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={(e) => setIncludeSummary(e.target.checked)}
                className="w-3.5 h-3.5 text-violet-600 rounded-sm"
              />
              <span className="font-semibold text-slate-700">Include --summary</span>
            </label>

            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPyExecutable("python")}
                className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-colors ${
                  pyExecutable === "python" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
                title="Use 'python' (Standard for Windows)"
              >
                python (Windows)
              </button>
              <button
                type="button"
                onClick={() => setPyExecutable("python3")}
                className={`px-2 py-0.5 rounded-md font-medium text-[11px] transition-colors ${
                  pyExecutable === "python3" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
                title="Use 'python3' (Standard for macOS / Linux)"
              >
                python3 (Unix)
              </button>
            </div>

            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 font-semibold focus:outline-none"
            >
              <option value="table">Output: ASCII Table</option>
              <option value="json">Output: Raw JSON</option>
            </select>
          </div>
        </div>

        {/* Command Line Box */}
        <div className="relative bg-slate-900 rounded-xl p-4 font-mono text-xs text-emerald-400 flex items-center justify-between shadow-inner">
          <span className="truncate mr-4">$ {fullCommandLine}</span>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCopyCmd}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Copy command to clipboard"
            >
              {copiedCmd ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              id="btn-run-cli-container"
              onClick={handleRunCli}
              disabled={isRunning}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isRunning ? "Executing..." : "Run in Python"}</span>
            </button>
          </div>
        </div>

        {/* Live Output Terminal Window */}
        {cliOutput && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-slate-200 overflow-x-auto shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 text-[11px] text-slate-400">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Process Output: {pyExecutable} -m battery_engine.cli</span>
              </span>
              <div className="space-x-3">
                {cliExitCode !== null && <span>Exit: {cliExitCode}</span>}
                {cliDurationMs !== null && <span>Duration: {cliDurationMs} ms</span>}
              </div>
            </div>
            <pre className="whitespace-pre overflow-x-auto leading-relaxed text-slate-300">
              {cliOutput}
            </pre>
          </div>
        )}
      </div>

      {/* Python Adaptor Integration Guide */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Object-Oriented Python Adaptor Pattern (Integration Snippet)
            </h3>
          </div>

          <button
            onClick={handleCopyCode}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? "Copied" : "Copy Code"}</span>
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Drop this code into your external IoT firmware simulator, telemetry pipeline, or hardware test harness. The <code className="text-violet-600 font-semibold">BatterySimulatorAdapter</code> maintains real-time charge balance, passivation layer dynamics, and transient voltage sags across continuous calls.
        </p>

        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
          <pre className="font-mono text-xs text-slate-300 leading-relaxed">
            {pythonAdapterSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};
