import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { BatteryConfigView } from "./components/BatteryConfigView";
import { LoadProfileView } from "./components/LoadProfileView";
import { ResultsView } from "./components/ResultsView";
import { CliStudioView } from "./components/CliStudioView";
import { SensitivityView } from "./components/SensitivityView";
import {
  ActiveTab,
  BatterySpecification,
  ElectricalLoadProfile,
  SimulationReport,
} from "./types";
import { BATTERY_PRESETS, LOAD_PRESETS } from "./data/presets";
import { runClientSimulation, runPythonSimulation } from "./lib/simulation";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("results");
  const [battery, setBattery] = useState<BatterySpecification>(
    BATTERY_PRESETS.lisocl2_saft_ls14500
  );
  const [load, setLoad] = useState<ElectricalLoadProfile>(
    LOAD_PRESETS.nbiot_asset_tracker
  );
  const [ambientTempC, setAmbientTempC] = useState<number>(25);
  const [report, setReport] = useState<SimulationReport | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [usePythonBackend, setUsePythonBackend] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Run initial simulation on mount
  useEffect(() => {
    try {
      const initialReport = runClientSimulation(battery, load, ambientTempC);
      setReport(initialReport);
    } catch (e) {
      console.error("Initial simulation failed:", e);
    }
  }, []);

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      let simReport: SimulationReport;
      if (usePythonBackend) {
        simReport = await runPythonSimulation(battery, load, ambientTempC);
      } else {
        simReport = runClientSimulation(battery, load, ambientTempC);
      }
      setReport(simReport);
      setActiveTab("results");
    } catch (err: any) {
      console.warn("Python backend returned error, falling back to client simulation:", err);
      setErrorMessage(`Backend Note: ${err.message || "Switching to client simulation engine"}`);
      // Fallback to client simulation
      const fallbackReport = runClientSimulation(battery, load, ambientTempC);
      setReport(fallbackReport);
      setActiveTab("results");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-violet-500 selection:text-white">
      <div className="flex flex-1">
        {/* Modern SaaS Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          report={report}
          batteryName={battery.name}
        />

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header Bar */}
          <Header
            battery={battery}
            setBattery={(b) => {
              setBattery(b);
              // Auto recalculate client-side
              const rep = runClientSimulation(b, load, ambientTempC);
              setReport(rep);
            }}
            load={load}
            setLoad={(l) => {
              setLoad(l);
              // Auto recalculate client-side
              const rep = runClientSimulation(battery, l, ambientTempC);
              setReport(rep);
            }}
            ambientTempC={ambientTempC}
            setAmbientTempC={(t) => {
              setAmbientTempC(t);
              const rep = runClientSimulation(battery, load, t);
              setReport(rep);
            }}
            onRunSimulation={handleRunSimulation}
            isSimulating={isSimulating}
            usePythonBackend={usePythonBackend}
            setUsePythonBackend={setUsePythonBackend}
          />

          {/* Error / Fallback Notification Banner if any */}
          {errorMessage && (
            <div className="mx-8 mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-amber-700 hover:text-amber-900 font-bold ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* View Content */}
          <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
            {activeTab === "battery" && (
              <BatteryConfigView
                battery={battery}
                setBattery={(b) => {
                  setBattery(b);
                  const rep = runClientSimulation(b, load, ambientTempC);
                  setReport(rep);
                }}
              />
            )}

            {activeTab === "load" && (
              <LoadProfileView
                load={load}
                setLoad={(l) => {
                  setLoad(l);
                  const rep = runClientSimulation(battery, l, ambientTempC);
                  setReport(rep);
                }}
                nominalVoltageV={battery.nominal_voltage_v}
              />
            )}

            {activeTab === "results" && (
              <ResultsView
                report={report}
                onRerun={handleRunSimulation}
                cutoffVoltageV={battery.cutoff_voltage_v}
                battery={battery}
                load={load}
                ambientTempC={ambientTempC}
              />
            )}

            {activeTab === "cli" && (
              <CliStudioView
                battery={battery}
                load={load}
                ambientTempC={ambientTempC}
              />
            )}

            {activeTab === "sensitivity" && (
              <SensitivityView
                battery={battery}
                load={load}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
