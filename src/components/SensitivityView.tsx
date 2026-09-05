import React, { useMemo, useState } from "react";
import {
  Thermometer,
  Clock,
  TrendingDown,
  Info,
  ShieldAlert,
  Zap,
  RotateCcw,
} from "lucide-react";
import { BatterySpecification, ElectricalLoadProfile } from "../types";
import { runClientSimulation } from "../lib/simulation";

interface SensitivityViewProps {
  battery: BatterySpecification;
  load: ElectricalLoadProfile;
}

export const SensitivityView: React.FC<SensitivityViewProps> = ({
  battery,
  load,
}) => {
  const [testTemp, setTestTemp] = useState<number>(25);

  // Compute sensitivity data points across a temperature sweep (-20°C to +60°C)
  const tempSweep = useMemo(() => {
    const temps = [-20, -10, 0, 10, 20, 25, 30, 40, 50, 60];
    return temps.map((t) => {
      const rep = runClientSimulation(battery, load, t, 50);
      return {
        temp: t,
        years: rep.total_simulated_time_years,
        days: rep.total_simulated_time_days,
        minV: rep.min_terminal_voltage_v,
        dipMv: rep.max_voltage_dip_v * 1000,
        cycles: rep.total_cycles_completed,
      };
    });
  }, [battery, load]);

  // Active temperature simulation result
  const activeTempResult = useMemo(() => {
    return runClientSimulation(battery, load, testTemp, 100);
  }, [battery, load, testTemp]);

  const maxLifeYears = Math.max(...tempSweep.map((p) => p.years), 1);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-md">
              Environmental & Duty Sensitivity Analysis
            </span>
            <span className="text-xs font-mono text-slate-500">Arrhenius & ESR Derating</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">Thermal Impact on Battery Longevity</h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Evaluate how extreme low temperatures cause deep voltage sags and high temperatures accelerate chemical self-discharge.
          </p>
        </div>
      </div>

      {/* Interactive Temperature Slider Widget */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Thermometer className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-900">Interactive Ambient Temperature Explorer</h3>
          </div>
          <div className="text-xs font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg">
            Current: <span className="text-violet-600">{testTemp > 0 ? `+${testTemp}` : testTemp} °C</span>
          </div>
        </div>

        <div>
          <input
            id="slider-test-temp"
            type="range"
            min="-20"
            max="60"
            step="1"
            value={testTemp}
            onChange={(e) => setTestTemp(parseInt(e.target.value))}
            className="w-full accent-violet-600 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-1">
            <span>-20 °C (Arctic / Freezing)</span>
            <span>0 °C</span>
            <span>+25 °C (Nominal Lab)</span>
            <span>+40 °C (Hot Desert)</span>
            <span>+60 °C (Industrial Engine)</span>
          </div>
        </div>

        {/* Real-time calculated outcomes for this temperature */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Projected Longevity</span>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {activeTempResult.total_simulated_time_years} Years
            </p>
            <span className="text-[11px] text-slate-500">{activeTempResult.total_simulated_time_days.toLocaleString()} Days</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Min Terminal V</span>
            <p className="text-xl font-bold text-indigo-600 mt-0.5">
              {activeTempResult.min_terminal_voltage_v.toFixed(3)} V
            </p>
            <span className="text-[11px] text-slate-500">Sag: {(activeTempResult.max_voltage_dip_v * 1000).toFixed(0)} mV</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Duty Cycles</span>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {activeTempResult.total_cycles_completed.toLocaleString()}
            </p>
            <span className="text-[11px] text-slate-500">{load.name.split("(")[0]}</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Depletion Cause</span>
            <p className="text-sm font-bold text-slate-800 truncate mt-1">
              {activeTempResult.termination_reason}
            </p>
            <span className="text-[11px] text-slate-500">{activeTempResult.capacity_efficiency_pct}% capacity delivered</span>
          </div>
        </div>
      </div>

      {/* Temperature Sweep Visual Comparison Table & Bars */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <TrendingDown className="w-4 h-4 text-violet-600" />
          <span>Longevity vs Operating Temperature Curve</span>
        </h3>

        <div className="space-y-3 pt-2">
          {tempSweep.map((point) => {
            const barPct = Math.max(5, (point.years / maxLifeYears) * 100);
            const isSelected = point.temp === testTemp;

            return (
              <div
                key={point.temp}
                onClick={() => setTestTemp(point.temp)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-violet-50/80 border-violet-400 ring-1 ring-violet-400"
                    : "bg-slate-50/70 border-slate-200 hover:bg-slate-100/70"
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                  <span className="font-bold text-slate-800 w-24">
                    {point.temp > 0 ? `+${point.temp}` : point.temp} °C
                  </span>
                  <span className="font-semibold text-violet-700">{point.years} Years</span>
                  <span className="text-slate-500 font-mono">Min: {point.minV.toFixed(2)} V</span>
                  <span className="text-slate-500 font-mono">Dip: {point.dipMv.toFixed(0)} mV</span>
                  <span className="text-slate-500 font-mono">{point.cycles.toLocaleString()} cycles</span>
                </div>

                {/* Bar */}
                <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${barPct}%` }}
                    className={`h-full rounded-full transition-all ${
                      point.temp <= -10
                        ? "bg-sky-500"
                        : point.temp >= 40
                        ? "bg-amber-500"
                        : "bg-violet-600"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
