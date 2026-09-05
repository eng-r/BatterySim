import React from "react";
import {
  Play,
  Thermometer,
  RotateCcw,
  CheckCircle2,
  Terminal,
  Activity,
  Layers,
} from "lucide-react";
import { BatterySpecification, ElectricalLoadProfile } from "../types";
import { BATTERY_PRESETS, LOAD_PRESETS } from "../data/presets";

interface HeaderProps {
  battery: BatterySpecification;
  setBattery: (b: BatterySpecification) => void;
  load: ElectricalLoadProfile;
  setLoad: (l: ElectricalLoadProfile) => void;
  ambientTempC: number;
  setAmbientTempC: (t: number) => void;
  onRunSimulation: () => void;
  isSimulating: boolean;
  usePythonBackend: boolean;
  setUsePythonBackend: (val: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  battery,
  setBattery,
  load,
  setLoad,
  ambientTempC,
  setAmbientTempC,
  onRunSimulation,
  isSimulating,
  usePythonBackend,
  setUsePythonBackend,
}) => {
  return (
    <header
      id="app-header"
      className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-8 py-3.5 sticky top-0 z-30 flex items-center justify-between shadow-2xs"
    >
      {/* Left side: Quick Preset Selectors */}
      <div className="flex items-center space-x-4">
        {/* Cell Preset dropdown */}
        <div className="flex items-center space-x-2">
          <label htmlFor="quick-cell-preset" className="text-xs font-semibold text-slate-700">
            Cell:
          </label>
          <select
            id="quick-cell-preset"
            value={battery.id}
            onChange={(e) => {
              const preset = BATTERY_PRESETS[e.target.value];
              if (preset) setBattery(preset);
            }}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500 focus:outline-none hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {Object.entries(BATTERY_PRESETS).map(([key, item]) => (
              <option key={key} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        {/* Load Preset dropdown */}
        <div className="flex items-center space-x-2">
          <label htmlFor="quick-load-preset" className="text-xs font-semibold text-slate-700">
            Load:
          </label>
          <select
            id="quick-load-preset"
            value={load.profile_id}
            onChange={(e) => {
              const preset = LOAD_PRESETS[e.target.value];
              if (preset) setLoad(preset);
            }}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-2 focus:ring-violet-500 focus:outline-none hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {Object.entries(LOAD_PRESETS).map(([key, item]) => (
              <option key={key} value={item.profile_id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        {/* Temperature Badge / Selector */}
        <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
          ambientTempC === 150 
            ? "bg-rose-50 border-rose-300 text-rose-800" 
            : "bg-slate-100 border-slate-200 text-slate-800"
        }`}>
          <Thermometer className={`w-3.5 h-3.5 ${ambientTempC === 150 ? "text-rose-600 animate-pulse" : "text-rose-500"}`} />
          <span className="text-slate-500 font-medium">Ambient:</span>
          <select
            id="quick-ambient-temp"
            value={ambientTempC}
            onChange={(e) => {
              const val = Number(e.target.value);
              setAmbientTempC(val);
            }}
            className="font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
          >
            <option value={-20}>-20 °C (Arctic / Cold)</option>
            <option value={0}>0 °C (Chilled)</option>
            <option value={25}>+25 °C (Standard Lab)</option>
            <option value={40}>+40 °C (Summer Hot)</option>
            <option value={60}>+60 °C (Industrial High)</option>
            {battery.chemistry === "LITHIUM_THIONYL_CHLORIDE" ? (
              <option value={150}>🔥 +150 °C (Downhole / Geothermal Li-SOCl2)</option>
            ) : (
              <option value={150} disabled>
                +150 °C (Restricted: Li-SOCl2 Only)
              </option>
            )}
          </select>
          {ambientTempC === 150 && (
            <span className="hidden md:inline-block ml-1 px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold text-[10px] uppercase tracking-wider">
              150°C Downhole
            </span>
          )}
        </div>
      </div>

      {/* Right side: Engine Mode & Run CTA */}
      <div className="flex items-center space-x-4">
        {/* Backend toggle */}
        <button
          id="toggle-python-backend"
          onClick={() => setUsePythonBackend(!usePythonBackend)}
          className={`flex items-center space-x-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
            usePythonBackend
              ? "bg-slate-900 border-slate-800 text-emerald-400 shadow-xs"
              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
          title="Toggle between instant client-side calculation and containerized Python CLI backend"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{usePythonBackend ? "Python Engine (Active)" : "Client Mode"}</span>
        </button>

        {/* Primary CTA Button */}
        <button
          id="btn-run-simulation"
          onClick={onRunSimulation}
          disabled={isSimulating}
          className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-98 text-white font-semibold text-xs tracking-wide shadow-md shadow-violet-200/80 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isSimulating ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              <span>Simulating...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Run Simulation</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
