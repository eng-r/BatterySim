import React, { useState } from "react";
import {
  Battery,
  Layers,
  ShieldAlert,
  Flame,
  Thermometer,
  Sliders,
  Download,
  Upload,
  Info,
  Check,
} from "lucide-react";
import { BatterySpecification, BatteryChemistry } from "../types";
import { BATTERY_PRESETS } from "../data/presets";

interface BatteryConfigViewProps {
  battery: BatterySpecification;
  setBattery: (b: BatterySpecification) => void;
}

export const BatteryConfigView: React.FC<BatteryConfigViewProps> = ({
  battery,
  setBattery,
}) => {
  const [activeSubSection, setActiveSubSection] = useState<"general" | "ecm" | "passivation" | "kibam">("general");

  const updateField = <K extends keyof BatterySpecification>(key: K, value: BatterySpecification[K]) => {
    setBattery({ ...battery, [key]: value });
  };

  const exportBatteryJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(battery, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${battery.id || "battery_spec"}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setBattery(parsed);
      } catch (err) {
        alert("Invalid JSON format in battery configuration file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2.5 py-1 rounded-md">
              Primary Cell Specification
            </span>
            <span className="text-xs font-mono text-slate-600">ID: {battery.id}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{battery.name}</h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Configure electrochemical parameters, Equivalent Circuit Model (ECM), surface passivation delay, and rate-capacity diffusion.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <label
            htmlFor="upload-battery-json"
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
            <input
              id="upload-battery-json"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleJsonUpload}
            />
          </label>
          <button
            id="btn-export-battery-json"
            onClick={exportBatteryJson}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Preset Chips */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Standard Industry Presets
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {Object.entries(BATTERY_PRESETS).map(([key, item]) => {
            const isSelected = battery.id === item.id;
            return (
              <button
                key={key}
                onClick={() => setBattery(item)}
                className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-violet-50/80 border-violet-400 text-violet-900 shadow-xs ring-1 ring-violet-400"
                    : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate">{item.name.split("(")[0]}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                  <span>{item.nominal_voltage_v} V</span>
                  <span>{item.nominal_capacity_mah} mAh</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Tabs Header */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        {[
          { id: "general", label: "General & Ratings", icon: <Battery className="w-4 h-4" /> },
          { id: "ecm", label: "Equivalent Circuit (ECM)", icon: <Layers className="w-4 h-4" /> },
          { id: "passivation", label: "Passivation Dynamics", icon: <ShieldAlert className="w-4 h-4" /> },
          { id: "kibam", label: "KiBaM & Rate Diffusion", icon: <Sliders className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubSection(tab.id as any)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubSection === tab.id
                ? "bg-violet-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: General Parameters */}
      {activeSubSection === "general" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Battery className="w-4 h-4 text-violet-600" />
              <span>Cell Ratings</span>
            </h3>

            <div>
              <label htmlFor="input-battery-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Cell Descriptive Name
              </label>
              <input
                id="input-battery-name"
                type="text"
                value={battery.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="select-battery-chemistry" className="block text-xs font-semibold text-slate-700 mb-1">
                Electrochemical Chemistry
              </label>
              <select
                id="select-battery-chemistry"
                value={battery.chemistry}
                onChange={(e) => updateField("chemistry", e.target.value as BatteryChemistry)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
              >
                <option value="LITHIUM_THIONYL_CHLORIDE">Lithium Thionyl Chloride (Li-SOCl2, 3.6V)</option>
                <option value="LITHIUM_MANGANESE_DIOXIDE">Lithium Manganese Dioxide (Li-MnO2, 3.0V)</option>
                <option value="ALKALINE_ZN_MNO2">Alkaline Zinc-Manganese (Zn-MnO2, 1.5V)</option>
                <option value="ZINC_AIR">Zinc-Air (Zn-O2, 1.4V)</option>
                <option value="CUSTOM">Custom Electrochemical Profile</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-nominal-voltage" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Voltage (V)
                </label>
                <input
                  id="input-nominal-voltage"
                  type="number"
                  step="0.05"
                  value={battery.nominal_voltage_v}
                  onChange={(e) => updateField("nominal_voltage_v", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="input-cutoff-voltage" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cutoff Voltage (V)
                </label>
                <input
                  id="input-cutoff-voltage"
                  type="number"
                  step="0.05"
                  value={battery.cutoff_voltage_v}
                  onChange={(e) => updateField("cutoff_voltage_v", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-nominal-capacity" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Capacity (mAh)
                </label>
                <input
                  id="input-nominal-capacity"
                  type="number"
                  step="10"
                  value={battery.nominal_capacity_mah}
                  onChange={(e) => updateField("nominal_capacity_mah", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="input-reference-current" className="block text-xs font-semibold text-slate-700 mb-1">
                  Ref Test Current (mA)
                </label>
                <input
                  id="input-reference-current"
                  type="number"
                  step="0.1"
                  value={battery.reference_discharge_current_ma}
                  onChange={(e) => updateField("reference_discharge_current_ma", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Thermometer className="w-4 h-4 text-rose-500" />
              <span>Environmental & Self-Discharge</span>
            </h3>

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                Self-discharge is modeled via the Arrhenius equation. In primary batteries operating at high ambient temperatures (+40°C to +60°C), shelf degradation accelerates significantly.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-self-discharge-annual" className="block text-xs font-semibold text-slate-700 mb-1">
                  Annual Self-Discharge (%/yr)
                </label>
                <input
                  id="input-self-discharge-annual"
                  type="number"
                  step="0.1"
                  value={battery.self_discharge_annual_pct}
                  onChange={(e) => updateField("self_discharge_annual_pct", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="input-ref-temp" className="block text-xs font-semibold text-slate-700 mb-1">
                  Ref Temperature (°C)
                </label>
                <input
                  id="input-ref-temp"
                  type="number"
                  step="1"
                  value={battery.reference_temperature_c}
                  onChange={(e) => updateField("reference_temperature_c", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="input-temp-resistance-coeff" className="block text-xs font-semibold text-slate-700 mb-1">
                  Cold ESR Increase (% / °C)
                </label>
                <input
                  id="input-temp-resistance-coeff"
                  type="number"
                  step="0.1"
                  value={Math.abs(battery.temp_resistance_coeff_pct)}
                  onChange={(e) => updateField("temp_resistance_coeff_pct", -Math.abs(parseFloat(e.target.value) || 0))}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="input-activation-energy" className="block text-xs font-semibold text-slate-700 mb-1">
                  Activation Energy (J/mol)
                </label>
                <input
                  id="input-activation-energy"
                  type="number"
                  step="1000"
                  value={battery.arrhenius_activation_energy_j_mol}
                  onChange={(e) => updateField("arrhenius_activation_energy_j_mol", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Equivalent Circuit Model (ECM) */}
      {activeSubSection === "ecm" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-violet-600" />
              <span>Dual-Polarization (2-RC) Thevenin Circuit Parameters</span>
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Models immediate Ohmic voltage drops, charge-transfer polarization ($R_1 \parallel C_1$), and slow mass diffusion ($R_2 \parallel C_2$).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* R0 Ohmic */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Ohmic Resistance (R₀)</span>
              <div>
                <label htmlFor="input-r0" className="block text-xs font-semibold text-slate-700 mb-1">
                  Series ESR R₀ (Ohms)
                </label>
                <input
                  id="input-r0"
                  type="number"
                  step="0.1"
                  value={battery.internal_resistance_ohm}
                  onChange={(e) => updateField("internal_resistance_ohm", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <p className="text-[11px] text-slate-500">Immediate step drop upon pulse activation.</p>
            </div>

            {/* RC 1 Pair */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Polarization Pair (R₁ || C₁)</span>
              <div>
                <label htmlFor="input-r1" className="block text-xs font-semibold text-slate-700 mb-1">
                  Charge Transfer R₁ (Ohms)
                </label>
                <input
                  id="input-r1"
                  type="number"
                  step="0.1"
                  value={battery.r1_polarization_ohm}
                  onChange={(e) => updateField("r1_polarization_ohm", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label htmlFor="input-c1" className="block text-xs font-semibold text-slate-700 mb-1">
                  Double-Layer C₁ (Farads)
                </label>
                <input
                  id="input-c1"
                  type="number"
                  step="0.1"
                  value={battery.c1_polarization_f}
                  onChange={(e) => updateField("c1_polarization_f", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <p className="text-[11px] text-slate-500">Time constant τ₁ ≈ {(battery.r1_polarization_ohm * battery.c1_polarization_f).toFixed(2)}s</p>
            </div>

            {/* RC 2 Pair */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Diffusion Pair (R₂ || C₂)</span>
              <div>
                <label htmlFor="input-r2" className="block text-xs font-semibold text-slate-700 mb-1">
                  Diffusion R₂ (Ohms)
                </label>
                <input
                  id="input-r2"
                  type="number"
                  step="0.1"
                  value={battery.r2_diffusion_ohm}
                  onChange={(e) => updateField("r2_diffusion_ohm", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label htmlFor="input-c2" className="block text-xs font-semibold text-slate-700 mb-1">
                  Diffusion C₂ (Farads)
                </label>
                <input
                  id="input-c2"
                  type="number"
                  step="1"
                  value={battery.c2_diffusion_f}
                  onChange={(e) => updateField("c2_diffusion_f", parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <p className="text-[11px] text-slate-500">Time constant τ₂ ≈ {(battery.r2_diffusion_ohm * battery.c2_diffusion_f).toFixed(2)}s</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Passivation Dynamics */}
      {activeSubSection === "passivation" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>Lithium Chloride (LiCl) Passivation Layer Modeling</span>
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Models initial voltage delay dips and exponential film depassivation under high-current radio pulses.
              </p>
            </div>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                id="checkbox-has-passivation"
                type="checkbox"
                checked={battery.has_passivation}
                onChange={(e) => updateField("has_passivation", e.target.checked)}
                className="w-4 h-4 text-violet-600 rounded-sm focus:ring-violet-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-800">Enable Passivation Dynamics</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="input-initial-passivation" className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Passivation Film Resistance (Ohms)
              </label>
              <input
                id="input-initial-passivation"
                type="number"
                step="0.5"
                disabled={!battery.has_passivation}
                value={battery.initial_passivation_resistance_ohm}
                onChange={(e) => updateField("initial_passivation_resistance_ohm", parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Initial resistance of stored cell before depassivating current pulse.
              </p>
            </div>

            <div>
              <label htmlFor="input-max-passivation" className="block text-xs font-semibold text-slate-700 mb-1">
                Maximum Deep Passivation Limit (Ohms)
              </label>
              <input
                id="input-max-passivation"
                type="number"
                step="1"
                disabled={!battery.has_passivation}
                value={battery.max_passivation_resistance_ohm}
                onChange={(e) => updateField("max_passivation_resistance_ohm", parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Upper asymptote after extended multi-month storage without load.
              </p>
            </div>

            <div>
              <label htmlFor="input-breakdown-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                Breakdown Sensitivity Factor
              </label>
              <input
                id="input-breakdown-rate"
                type="number"
                step="0.05"
                disabled={!battery.has_passivation}
                value={battery.passivation_breakdown_rate}
                onChange={(e) => updateField("passivation_breakdown_rate", parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              />
              <p className="text-[11px] text-slate-500 mt-1">Rate of film breakdown per mA current drawn.</p>
            </div>

            <div>
              <label htmlFor="input-regrowth-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                Regrowth Rate Factor (Ohms / s)
              </label>
              <input
                id="input-regrowth-rate"
                type="number"
                step="0.0001"
                disabled={!battery.has_passivation}
                value={battery.passivation_regrowth_rate}
                onChange={(e) => updateField("passivation_regrowth_rate", parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              />
              <p className="text-[11px] text-slate-500 mt-1">Regeneration rate during microamp sleep periods.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: KiBaM & Rate Diffusion */}
      {activeSubSection === "kibam" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-violet-600" />
              <span>Kinetic Battery Model (KiBaM) & Peukert Rate-Capacity</span>
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Two-well diffusion model: available charge well ($q_1$) directly delivers current, while bound well ($q_2$) replenishes available charge during sleep periods.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="input-peukert" className="block text-xs font-semibold text-slate-700 mb-1">
                Peukert Exponent (k_p)
              </label>
              <input
                id="input-peukert"
                type="number"
                step="0.01"
                value={battery.peukert_coefficient}
                onChange={(e) => updateField("peukert_coefficient", parseFloat(e.target.value) || 1.0)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">1.0 = Ideal linear capacity. &gt;1.0 = high current capacity derating.</p>
            </div>

            <div>
              <label htmlFor="input-c-ratio" className="block text-xs font-semibold text-slate-700 mb-1">
                Available Charge Fraction (c)
              </label>
              <input
                id="input-c-ratio"
                type="number"
                step="0.05"
                min="0.1"
                max="0.95"
                value={battery.kibam_c_ratio}
                onChange={(e) => updateField("kibam_c_ratio", parseFloat(e.target.value) || 0.8)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Fraction of total capacity immediately accessible in tank 1.</p>
            </div>

            <div>
              <label htmlFor="input-k-rate" className="block text-xs font-semibold text-slate-700 mb-1">
                Inter-Well Exchange Rate k (s⁻¹)
              </label>
              <input
                id="input-k-rate"
                type="number"
                step="0.00005"
                value={battery.kibam_k_rate}
                onChange={(e) => updateField("kibam_k_rate", parseFloat(e.target.value) || 0.0001)}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Rate of charge recovery during rest/sleep states.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
