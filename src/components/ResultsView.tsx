import React, { useState } from "react";
import {
  LineChart as LineChartIcon,
  Zap,
  Battery,
  AlertTriangle,
  Download,
  Calendar,
  Activity,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  FileText,
} from "lucide-react";
import { BatterySpecification, ElectricalLoadProfile, SimulationReport, SimulationStepResult } from "../types";
import { generateSimulationPdf } from "../lib/pdfReport";
import { SohDecayVisualizer } from "./SohDecayVisualizer";
import { MotorSpinSimulator } from "./MotorSpinSimulator";

interface ResultsViewProps {
  report: SimulationReport | null;
  onRerun: () => void;
  cutoffVoltageV: number;
  battery?: BatterySpecification;
  setBattery?: (b: BatterySpecification) => void;
  load?: ElectricalLoadProfile;
  ambientTempC?: number;
  setAmbientTempC?: (t: number) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  report,
  onRerun,
  cutoffVoltageV,
  battery,
  setBattery,
  load,
  ambientTempC = 25,
  setAmbientTempC,
}) => {
  const [activeChart, setActiveChart] = useState<"voltage" | "soc" | "passivation" | "energy">("voltage");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!report) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center shadow-xs">
        <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Activity className="w-8 h-8 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">No Simulation Data Yet</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
          Configure battery parameters and load profile, then click "Run Simulation" to generate electrochemical longevity forecasts and dynamic voltage sag curves.
        </p>
        <button
          onClick={onRerun}
          className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs shadow-md shadow-violet-200 transition-all cursor-pointer"
        >
          Run Simulation Now
        </button>
      </div>
    );
  }

  const exportReportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `battery_rul_report_${report.battery_id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportCsv = () => {
    if (!report.time_series || report.time_series.length === 0) return;
    const headers = [
      "time_s",
      "time_hours",
      "time_days",
      "segment_name",
      "current_ma",
      "terminal_voltage_v",
      "ocv_v",
      "passivation_resistance_ohm",
      "consumed_capacity_mah",
      "consumed_energy_mwh",
      "soc_pct",
      "cutoff_breached",
    ];
    const rows = report.time_series.map((s) => [
      s.time_s,
      (s.time_s / 3600).toFixed(2),
      (s.time_s / 86400).toFixed(2),
      `"${s.segment_name}"`,
      s.current_ma,
      s.terminal_voltage_v,
      s.ocv_v,
      s.passivation_resistance_ohm,
      s.consumed_capacity_mah,
      s.consumed_energy_mwh,
      s.soc_pct,
      s.cutoff_breached,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", encodeURI(csvContent));
    downloadAnchor.setAttribute("download", `battery_telemetry_${report.battery_id}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Prepare chart series data
  const data = report.time_series || [];
  const svgWidth = 800;
  const svgHeight = 280;
  const padLeft = 55;
  const padRight = 30;
  const padTop = 20;
  const padBottom = 40;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const minTime = data.length > 0 ? data[0].time_s : 0;
  const maxTime = data.length > 0 ? data[data.length - 1].time_s : 1;
  const timeSpan = Math.max(1, maxTime - minTime);

  const getX = (t: number) => padLeft + ((t - minTime) / timeSpan) * chartW;

  // Chart Y scaling
  let minY = 0;
  let maxY = 100;
  let yUnit = "";

  if (activeChart === "voltage") {
    minY = Math.max(0, Math.min(cutoffVoltageV - 0.2, ...data.map((d) => d.terminal_voltage_v)));
    maxY = Math.max(...data.map((d) => d.ocv_v)) + 0.15;
    yUnit = "V";
  } else if (activeChart === "soc") {
    minY = 0;
    maxY = 100;
    yUnit = "%";
  } else if (activeChart === "passivation") {
    minY = 0;
    maxY = Math.max(5, ...data.map((d) => d.passivation_resistance_ohm)) * 1.15;
    yUnit = "Ω";
  } else if (activeChart === "energy") {
    minY = 0;
    maxY = Math.max(10, ...data.map((d) => d.consumed_energy_mwh)) * 1.1;
    yUnit = "mWh";
  }

  const getY = (val: number) => {
    const range = Math.max(0.001, maxY - minY);
    return padTop + chartH - ((val - minY) / range) * chartH;
  };

  // Build SVG Paths
  const buildPath = (valFn: (d: SimulationStepResult) => number) => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const x = getX(d.time_s);
        const y = getY(valFn(d));
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const currentHoveredPoint = hoveredIndex !== null && data[hoveredIndex] ? data[hoveredIndex] : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Simulation Completed</span>
            </span>
            <span className="text-xs font-mono text-slate-500">Reason: {report.termination_reason}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            Longevity & RUL Analysis: {report.battery_name}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Simulated {report.total_cycles_completed.toLocaleString()} operational cycles over{" "}
            {report.total_simulated_time_years} years ({report.total_simulated_time_days.toLocaleString()} days).
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            id="btn-export-report"
            onClick={() => generateSimulationPdf(report, battery, load, ambientTempC)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 active:scale-98 text-white text-xs font-semibold transition-all shadow-md shadow-violet-200 cursor-pointer"
            title="Generate and download a formatted PDF summary report including input parameters and KPIs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
          <button
            id="btn-export-csv"
            onClick={exportCsv}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            id="btn-export-report-json"
            onClick={exportReportJson}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Full Report JSON</span>
          </button>
        </div>
      </div>

      {/* 4 High-Conversion Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Operating Longevity */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Projected Longevity</span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {report.total_simulated_time_years}
            </span>
            <span className="text-sm font-bold text-slate-500 ml-1.5">Years</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{report.total_simulated_time_days.toLocaleString()} Days</span>
            <span className="font-mono">{report.total_simulated_time_hours.toLocaleString()} hrs</span>
          </div>
        </div>

        {/* Card 2: Total Cycles Completed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Duty Cycles</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {report.total_cycles_completed.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-1.5">cycles</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Avg Drain: {(report.average_current_ma * 1000).toFixed(1)} µA</span>
            <span className="font-mono">{(report.average_power_mw * 1000).toFixed(1)} µW</span>
          </div>
        </div>

        {/* Card 3: Consumed Energy & Capacity Utilization */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Capacity Consumed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Battery className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {report.capacity_efficiency_pct}%
            </span>
            <span className="text-xs font-bold text-emerald-600 ml-1.5">utilized</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{report.total_capacity_consumed_mah.toFixed(1)} mAh</span>
            <span className="font-mono">{report.total_energy_consumed_mwh.toFixed(1)} mWh</span>
          </div>
        </div>

        {/* Card 4: Voltage Dip & Min Terminal Voltage */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Min Terminal Voltage</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {report.min_terminal_voltage_v.toFixed(3)}
            </span>
            <span className="text-sm font-bold text-slate-500 ml-1">V</span>
            <span className="text-xs font-semibold text-rose-600 ml-2">
              (Dip: {(report.max_voltage_dip_v * 1000).toFixed(0)} mV)
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Cutoff Limit: {cutoffVoltageV} V</span>
            <span className="font-semibold text-emerald-600">End SoC: {report.final_soc_pct}%</span>
          </div>
        </div>
      </div>

      {/* Visual SoH Decay & Capacity Degradation Animation Module */}
      <SohDecayVisualizer
        report={report}
        battery={battery}
        cutoffVoltageV={cutoffVoltageV}
      />

      {/* High-Torque DC Motor Trapezoidal Degradation Lab */}
      {battery && (
        <MotorSpinSimulator
          battery={battery}
          setBattery={setBattery}
          ambientTempC={ambientTempC}
          setAmbientTempC={setAmbientTempC}
          cutoffVoltageV={cutoffVoltageV}
        />
      )}

      {/* Interactive Multi-Waveform Vector Chart Container */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <LineChartIcon className="w-5 h-5 text-violet-600" />
            <h3 className="text-base font-bold text-slate-900">Electrochemical Waveform Dynamics</h3>
          </div>

          {/* Chart Selector Tabs */}
          <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { id: "voltage", label: "Voltage Dynamics (V)" },
              { id: "soc", label: "SoC & SoH (%)" },
              { id: "passivation", label: "Passivation Film (Ω)" },
              { id: "energy", label: "Delivered Energy (mWh)" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveChart(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeChart === tab.id
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hover Inspector Pill */}
        <div className="h-6 flex items-center justify-between text-xs px-2">
          {currentHoveredPoint ? (
            <div className="flex items-center space-x-4 font-mono text-slate-700">
              <span className="font-semibold text-violet-700">
                Time: {(currentHoveredPoint.time_s / (3600 * 24 * 365.25)).toFixed(3)} yrs (
                {(currentHoveredPoint.time_s / 86400).toFixed(1)} days)
              </span>
              <span>
                V_term: <strong className="text-slate-900">{currentHoveredPoint.terminal_voltage_v} V</strong>
              </span>
              <span>
                OCV: <strong>{currentHoveredPoint.ocv_v} V</strong>
              </span>
              <span>
                SoC: <strong>{currentHoveredPoint.soc_pct}%</strong>
              </span>
              <span>
                R_pass: <strong>{currentHoveredPoint.passivation_resistance_ohm} Ω</strong>
              </span>
              <span>
                Energy: <strong>{currentHoveredPoint.consumed_energy_mwh.toFixed(1)} mWh</strong>
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">Hover anywhere on the curve to inspect precise time values</span>
          )}
        </div>

        {/* SVG Canvas */}
        <div className="w-full overflow-x-auto select-none">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto overflow-visible cursor-crosshair"
            onMouseLeave={() => setHoveredIndex(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
              if (mouseX >= padLeft && mouseX <= padLeft + chartW) {
                const frac = (mouseX - padLeft) / chartW;
                const targetIdx = Math.min(data.length - 1, Math.max(0, Math.round(frac * (data.length - 1))));
                setHoveredIndex(targetIdx);
              }
            }}
          >
            {/* Background Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
              const y = padTop + chartH * frac;
              const val = maxY - frac * (maxY - minY);
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + chartW}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-[10px] font-mono fill-slate-400"
                  >
                    {val >= 10 ? val.toFixed(0) : val >= 1 ? val.toFixed(2) : val.toFixed(3)}
                    {yUnit}
                  </text>
                </g>
              );
            })}

            {/* X-Axis Ticks */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
              const x = padLeft + chartW * frac;
              const t = minTime + frac * timeSpan;
              const tYears = t / (3600 * 24 * 365.25);
              const label = tYears >= 1 ? `${tYears.toFixed(1)} yr` : `${(t / 86400).toFixed(0)} d`;
              return (
                <g key={idx}>
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + chartH}
                    stroke="#f8fafc"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={padTop + chartH + 18}
                    textAnchor="middle"
                    className="text-[10px] font-mono fill-slate-500 font-semibold"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Cutoff Voltage Threshold Line (When on Voltage tab) */}
            {activeChart === "voltage" && (
              <g>
                <line
                  x1={padLeft}
                  y1={getY(cutoffVoltageV)}
                  x2={padLeft + chartW}
                  y2={getY(cutoffVoltageV)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
                <text
                  x={padLeft + chartW - 5}
                  y={getY(cutoffVoltageV) - 6}
                  textAnchor="end"
                  className="text-[10px] font-bold fill-rose-600"
                >
                  Cutoff Limit: {cutoffVoltageV}V
                </text>
              </g>
            )}

            {/* Traces */}
            {activeChart === "voltage" && (
              <>
                {/* OCV Curve */}
                <path
                  d={buildPath((d) => d.ocv_v)}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {/* Terminal Voltage Curve */}
                <path
                  d={buildPath((d) => d.terminal_voltage_v)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </>
            )}

            {activeChart === "soc" && (
              <path
                d={buildPath((d) => d.soc_pct)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {activeChart === "passivation" && (
              <path
                d={buildPath((d) => d.passivation_resistance_ohm)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {activeChart === "energy" && (
              <path
                d={buildPath((d) => d.consumed_energy_mwh)}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {/* Hover Crosshair */}
            {hoveredIndex !== null && data[hoveredIndex] && (
              <g>
                <line
                  x1={getX(data[hoveredIndex].time_s)}
                  y1={padTop}
                  x2={getX(data[hoveredIndex].time_s)}
                  y2={padTop + chartH}
                  stroke="#6366f1"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={getX(data[hoveredIndex].time_s)}
                  cy={getY(
                    activeChart === "voltage"
                      ? data[hoveredIndex].terminal_voltage_v
                      : activeChart === "soc"
                      ? data[hoveredIndex].soc_pct
                      : activeChart === "passivation"
                      ? data[hoveredIndex].passivation_resistance_ohm
                      : data[hoveredIndex].consumed_energy_mwh
                  )}
                  r="5"
                  fill="#ffffff"
                  stroke="#6366f1"
                  strokeWidth="3"
                />
              </g>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center space-x-6 pt-2 text-xs font-medium text-slate-600 border-t border-slate-100">
          {activeChart === "voltage" && (
            <>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-1 bg-indigo-500 rounded-full" />
                <span>V_term (Terminal Voltage under Load)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-1 bg-slate-400 rounded-full border-dashed" />
                <span>V_ocv (Open-Circuit Voltage)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-1 bg-rose-500 rounded-full" />
                <span>V_cutoff ({cutoffVoltageV} V)</span>
              </div>
            </>
          )}
          {activeChart === "soc" && (
            <div className="flex items-center space-x-2">
              <span className="w-3 h-1 bg-emerald-500 rounded-full" />
              <span>State of Charge (% Remaining)</span>
            </div>
          )}
          {activeChart === "passivation" && (
            <div className="flex items-center space-x-2">
              <span className="w-3 h-1 bg-amber-500 rounded-full" />
              <span>LiCl Passivation Film Resistance (Ohms)</span>
            </div>
          )}
          {activeChart === "energy" && (
            <div className="flex items-center space-x-2">
              <span className="w-3 h-1 bg-violet-500 rounded-full" />
              <span>Cumulative Delivered Energy (mWh)</span>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Sample Points Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recorded Simulation Step Telemetry</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sample points from macro extrapolation showing voltage sags, internal impedance, and energy consumption.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
            {report.time_series.length} Data Points
          </span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Time (Days)</th>
                <th className="py-2.5 px-4">Segment / Cycle</th>
                <th className="py-2.5 px-4">Current (mA)</th>
                <th className="py-2.5 px-4">V_term (V)</th>
                <th className="py-2.5 px-4">OCV (V)</th>
                <th className="py-2.5 px-4">R_pass (Ω)</th>
                <th className="py-2.5 px-4">Capacity (mAh)</th>
                <th className="py-2.5 px-4">Energy (mWh)</th>
                <th className="py-2.5 px-4">SoC (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {report.time_series.slice(0, 100).map((step, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2 px-4 text-slate-700">{(step.time_s / 86400).toFixed(1)}</td>
                  <td className="py-2 px-4 font-sans text-slate-900">{step.segment_name}</td>
                  <td className="py-2 px-4 text-slate-700">{step.current_ma.toFixed(2)}</td>
                  <td className="py-2 px-4 font-bold text-indigo-700">{step.terminal_voltage_v.toFixed(4)}</td>
                  <td className="py-2 px-4 text-slate-600">{step.ocv_v.toFixed(4)}</td>
                  <td className="py-2 px-4 text-amber-700">{step.passivation_resistance_ohm.toFixed(2)}</td>
                  <td className="py-2 px-4 text-slate-700">{step.consumed_capacity_mah.toFixed(1)}</td>
                  <td className="py-2 px-4 text-slate-700">{step.consumed_energy_mwh.toFixed(1)}</td>
                  <td className="py-2 px-4 font-semibold text-emerald-700">{step.soc_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
