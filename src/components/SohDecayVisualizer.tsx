import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Battery,
  Activity,
  Zap,
  TrendingDown,
  Clock,
  ShieldCheck,
  AlertCircle,
  Flame,
} from "lucide-react";
import { BatterySpecification, SimulationReport } from "../types";

interface SohDecayVisualizerProps {
  report: SimulationReport;
  battery?: BatterySpecification;
  cutoffVoltageV?: number;
}

export const SohDecayVisualizer: React.FC<SohDecayVisualizerProps> = ({
  report,
  battery,
  cutoffVoltageV = 2.0,
}) => {
  // Animation progress: 0.0 (fresh battery) to 1.0 (end-of-life)
  const [progress, setProgress] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const nominalCapacity = battery?.nominal_capacity_mah || report.nominal_capacity_mah || 2600;
  const totalYears = report.total_simulated_time_years || 1;
  const totalDays = report.total_simulated_time_days || 365;

  // Extract time series points for interpolation
  const timeSeries = useMemo(() => report.time_series || [], [report]);

  // Compute interpolated metrics based on progress (0 to 1)
  const currentMetrics = useMemo(() => {
    if (timeSeries.length === 0) {
      const remainingSoH = 100 - progress * (100 - (report.final_soc_pct || 0));
      const consumedCap = progress * report.total_capacity_consumed_mah;
      return {
        currentTimeYears: progress * totalYears,
        currentTimeDays: progress * totalDays,
        sohPct: Math.max(0, remainingSoH),
        socPct: Math.max(0, remainingSoH),
        consumedMah: consumedCap,
        remainingMah: Math.max(0, nominalCapacity - consumedCap),
        terminalVoltage: battery?.nominal_voltage_v
          ? battery.nominal_voltage_v - progress * (battery.nominal_voltage_v - cutoffVoltageV)
          : 3.65 - progress * 1.65,
        impedanceOhm: (battery?.internal_resistance_ohm || 2.8) + progress * 8.5,
        phase:
          progress < 0.25
            ? "Phase I: Initial Plateau (Minimal Fade)"
            : progress < 0.65
            ? "Phase II: Active Material Consumption & Passivation"
            : progress < 0.9
            ? "Phase III: Deep Depletion & Diffusion Limitations"
            : "Phase IV: End-of-Life Knee Point (Cutoff Near)",
      };
    }

    // Find surrounding steps in time series
    const targetIdx = progress * (timeSeries.length - 1);
    const lowIdx = Math.floor(targetIdx);
    const highIdx = Math.min(timeSeries.length - 1, Math.ceil(targetIdx));
    const ratio = targetIdx - lowIdx;

    const pLow = timeSeries[lowIdx];
    const pHigh = timeSeries[highIdx];

    const time_s = pLow.time_s + (pHigh.time_s - pLow.time_s) * ratio;
    const soc_pct = pLow.soc_pct + (pHigh.soc_pct - pLow.soc_pct) * ratio;
    const consumed_mah = pLow.consumed_capacity_mah + (pHigh.consumed_capacity_mah - pLow.consumed_capacity_mah) * ratio;
    const v_term = pLow.terminal_voltage_v + (pHigh.terminal_voltage_v - pLow.terminal_voltage_v) * ratio;
    const r_pass = pLow.passivation_resistance_ohm + (pHigh.passivation_resistance_ohm - pLow.passivation_resistance_ohm) * ratio;

    // SoH calculation: incorporates delivered capacity fade and cell impedance degradation
    const capacitySoH = Math.max(0, 100 - (consumed_mah / nominalCapacity) * 100);
    // Real-world SoH metric reflects both available chemical capacity and power delivery capability
    const sohPct = Math.max(0, capacitySoH * 0.95 + (soc_pct / 100) * 5);

    const currentTimeDays = time_s / 86400;
    const currentTimeYears = time_s / (86400 * 365.25);

    return {
      currentTimeYears,
      currentTimeDays,
      sohPct: Math.max(0, Math.min(100, sohPct)),
      socPct: Math.max(0, Math.min(100, soc_pct)),
      consumedMah: consumed_mah,
      remainingMah: Math.max(0, nominalCapacity - consumed_mah),
      terminalVoltage: v_term,
      impedanceOhm: (battery?.internal_resistance_ohm || 2.8) + r_pass,
      phase:
        progress < 0.25
          ? "Phase I: Initial Plateau (Minimal Fade)"
          : progress < 0.65
          ? "Phase II: Active Material Consumption & Passivation"
          : progress < 0.9
          ? "Phase III: Deep Depletion & Diffusion Limitations"
          : "Phase IV: End-of-Life Knee Point (Cutoff Near)",
    };
  }, [progress, timeSeries, nominalCapacity, totalYears, totalDays, battery, cutoffVoltageV]);

  // Smooth animation frame loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    const animate = (time: number) => {
      if (lastTimeRef.current !== null) {
        const delta = (time - lastTimeRef.current) / 1000;
        // Total duration of a full 0 -> 100% sweep at 1x speed is ~10 seconds
        const step = (delta / 10) * speed;
        setProgress((prev) => {
          const next = prev + step;
          if (next >= 1.0) {
            setIsPlaying(false);
            return 1.0;
          }
          return next;
        });
      }
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, speed]);

  const handleTogglePlay = () => {
    if (progress >= 1.0) {
      setProgress(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  // Color dynamic logic based on SoH
  const getSohColor = (soh: number) => {
    if (soh > 65) return "text-emerald-600";
    if (soh > 30) return "text-amber-600";
    return "text-rose-600";
  };

  const getSohBgGradient = (soh: number) => {
    if (soh > 65) return "from-emerald-500 to-teal-600";
    if (soh > 30) return "from-amber-400 to-orange-500";
    return "from-rose-500 to-red-600";
  };

  const milestones = [
    { label: "Fresh (100%)", pct: 0 },
    { label: "25% Life", pct: 0.25 },
    { label: "50% Life", pct: 0.5 },
    { label: "75% Life", pct: 0.75 },
    { label: "Depleted", pct: 1.0 },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
      {/* Header with Title & Live Phase Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                State of Health (SoH) Lifecycle Decay
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                Interactive Animation
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulated capacity fade and electrochemical degradation over the projected {totalYears} year deployment.
            </p>
          </div>
        </div>

        {/* Phase Indicator Badge */}
        <div className="flex items-center space-x-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200/60 self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse" />
          <span>{currentMetrics.phase}</span>
        </div>
      </div>

      {/* Main Visualizer Stage: Progress Gauge + Battery Cutaway Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Side: Battery Cell Physical Depletion Graphic (3 cols) */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center p-5 bg-slate-50/80 rounded-2xl border border-slate-200/80">
          <div className="relative w-28 h-52 bg-white rounded-2xl border-4 border-slate-700 shadow-inner flex flex-col justify-end p-1.5 overflow-hidden">
            {/* Battery Positive Anode Terminal Cap */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-3 bg-slate-700 rounded-t-md shadow-xs" />

            {/* Electrolyte / Active Material Fill Level */}
            <div
              className={`w-full rounded-xl transition-all duration-150 bg-gradient-to-t ${getSohBgGradient(
                currentMetrics.sohPct
              )} shadow-sm relative overflow-hidden`}
              style={{ height: `${Math.max(4, currentMetrics.sohPct)}%` }}
            >
              {/* Shimmer light effect inside battery */}
              <div className="absolute inset-0 bg-white/20 opacity-40 animate-pulse" />
              {/* Internal meniscus line */}
              <div className="w-full h-1 bg-white/40 absolute top-0 left-0" />
            </div>

            {/* Overlay Percentage Text inside Cell */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-slate-900 drop-shadow-sm font-mono">
                {currentMetrics.sohPct.toFixed(1)}%
              </span>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                Remaining SoH
              </span>
            </div>
          </div>

          {/* Quick Battery Specs underneath */}
          <div className="mt-3 text-center">
            <span className="text-xs font-semibold text-slate-700">
              {battery?.name || report.battery_name}
            </span>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Nominal: {nominalCapacity} mAh ({battery?.nominal_voltage_v || 3.65}V)
            </p>
          </div>
        </div>

        {/* Right Side: Progress-Based Degradation Chart & Metrics (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Synchronized Live Telemetry Readouts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Clock className="w-3 h-3 text-violet-600" />
                <span>Simulated Age</span>
              </span>
              <p className="text-lg font-extrabold text-slate-900 mt-1 font-mono">
                {currentMetrics.currentTimeYears.toFixed(2)} yrs
              </p>
              <span className="text-[11px] text-slate-500">
                {Math.round(currentMetrics.currentTimeDays).toLocaleString()} days
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Battery className="w-3 h-3 text-emerald-600" />
                <span>Available Cap</span>
              </span>
              <p className="text-lg font-extrabold text-slate-900 mt-1 font-mono">
                {currentMetrics.remainingMah.toFixed(0)} mAh
              </p>
              <span className="text-[11px] text-slate-500">
                Fade: {currentMetrics.consumedMah.toFixed(0)} mAh
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Zap className="w-3 h-3 text-indigo-600" />
                <span>Terminal V</span>
              </span>
              <p className="text-lg font-extrabold text-indigo-700 mt-1 font-mono">
                {currentMetrics.terminalVoltage.toFixed(3)} V
              </p>
              <span className="text-[11px] text-slate-500">
                Cutoff: {cutoffVoltageV.toFixed(1)} V
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <TrendingDown className="w-3 h-3 text-amber-600" />
                <span>Impedance R</span>
              </span>
              <p className="text-lg font-extrabold text-slate-900 mt-1 font-mono">
                {currentMetrics.impedanceOhm.toFixed(2)} Ω
              </p>
              <span className="text-[11px] text-slate-500">
                R₀ + Passivation
              </span>
            </div>
          </div>

          {/* Primary Progress-Based Chart Element */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 flex items-center space-x-1.5">
                <span>Capacity Degradation Progress</span>
                <span className="text-slate-400 font-normal">
                  ({(progress * 100).toFixed(0)}% of Mission Completed)
                </span>
              </span>
              <span className={`font-mono font-bold ${getSohColor(currentMetrics.sohPct)}`}>
                SoH: {currentMetrics.sohPct.toFixed(1)}%
              </span>
            </div>

            {/* Custom Multi-Track Progress Bar */}
            <div className="relative w-full h-7 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-inner">
              {/* SoH Remaining Fill */}
              <div
                className={`h-full transition-all duration-100 bg-gradient-to-r ${getSohBgGradient(
                  currentMetrics.sohPct
                )} rounded-lg relative`}
                style={{ width: `${Math.max(1, currentMetrics.sohPct)}%` }}
              >
                {/* Visual hatch pattern */}
                <div
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, rgba(255, 255, 255, 0.4) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.4) 50%, rgba(255, 255, 255, 0.4) 75%, transparent 75%, transparent)",
                    backgroundSize: "16px 16px",
                  }}
                />
              </div>

              {/* Progress Cursor Marker */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-slate-900 shadow-md transition-all duration-100"
                style={{ left: `${progress * 100}%` }}
              />

              {/* Internal Threshold Guidelines */}
              <div className="absolute inset-0 flex justify-between px-3 pointer-events-none text-[9px] font-bold text-slate-600/70 items-center">
                <span>100% Fresh</span>
                <span className="ml-12">75%</span>
                <span>50% Mid-Life</span>
                <span className="mr-12">25%</span>
                <span className="text-rose-600 font-bold">Cutoff</span>
              </div>
            </div>

            {/* Interactive Timeline Scrubber Range */}
            <div className="pt-1">
              <input
                id="soh-lifecycle-scrubber"
                type="range"
                min="0"
                max="1"
                step="0.002"
                value={progress}
                onChange={(e) => {
                  setIsPlaying(false);
                  setProgress(parseFloat(e.target.value));
                }}
                className="w-full accent-violet-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                title="Drag to scrub through the battery lifecycle"
              />
            </div>
          </div>

          {/* Quick Lifecycle Milestones Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Quick Milestones:
            </span>
            <div className="flex items-center space-x-1.5">
              {milestones.map((m) => (
                <button
                  key={m.label}
                  onClick={() => {
                    setIsPlaying(false);
                    setProgress(m.pct);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    Math.abs(progress - m.pct) < 0.05
                      ? "bg-violet-600 text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Playback Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-2">
              <button
                id="btn-soh-play-pause"
                onClick={handleTogglePlay}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                  isPlaying
                    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200"
                    : "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200"
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-white" />
                    <span>Pause Animation</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{progress >= 1.0 ? "Replay Animation" : "Play SoH Decay"}</span>
                  </>
                )}
              </button>

              <button
                id="btn-soh-reset"
                onClick={handleReset}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                title="Reset animation to beginning"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* Playback Speed Toggles */}
            <div className="flex items-center space-x-1.5 text-xs font-semibold">
              <span className="text-slate-500 mr-1 text-[11px]">Speed:</span>
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                    speed === s
                      ? "bg-slate-900 text-white font-bold"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
