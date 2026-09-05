import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  RotateCcw,
  Zap,
  Activity,
  Flame,
  Gauge,
  Layers,
  ChevronRight,
  TrendingDown,
  Battery,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Info,
} from "lucide-react";
import { BatterySpecification, ElectricalLoadProfile } from "../types";
import { BATTERY_PRESETS } from "../data/presets";

interface MotorSpinSimulatorProps {
  battery: BatterySpecification;
  setBattery?: (b: BatterySpecification) => void;
  ambientTempC: number;
  setAmbientTempC?: (t: number) => void;
  cutoffVoltageV?: number;
}

type MotorPhase = "idle" | "accel" | "cruise" | "decel" | "dwell";

interface SpinHistoryPoint {
  spinIndex: number;
  socPct: number;
  sohPct: number;
  terminalVoltageV: number;
  minSagV: number;
  cumulativeMah: number;
}

export const MotorSpinSimulator: React.FC<MotorSpinSimulatorProps> = ({
  battery,
  setBattery,
  ambientTempC,
  setAmbientTempC,
  cutoffVoltageV = 2.0,
}) => {
  const isLiSocl2 = battery.chemistry === "LITHIUM_THIONYL_CHLORIDE";

  // Motor state
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [currentPhase, setCurrentPhase] = useState<MotorPhase>("idle");
  const [currentRpm, setCurrentRpm] = useState<number>(0);
  const [instantCurrentMa, setInstantCurrentMa] = useState<number>(2.0);
  const [phaseProgress, setPhaseProgress] = useState<number>(0); // 0 to 1 inside current phase

  // Cumulative degradation tracking
  const nominalCap = battery.nominal_capacity_mah || 13500;
  const [completedSpins, setCompletedSpins] = useState<number>(0);
  const [consumedMah, setConsumedMah] = useState<number>(0);
  const [thermalLossMah, setThermalLossMah] = useState<number>(0);
  const [instantTerminalV, setInstantTerminalV] = useState<number>(battery.nominal_voltage_v);
  const [lowestSagV, setLowestSagV] = useState<number>(battery.nominal_voltage_v);
  const [history, setHistory] = useState<SpinHistoryPoint[]>([
    {
      spinIndex: 0,
      socPct: 100,
      sohPct: 100,
      terminalVoltageV: battery.nominal_voltage_v,
      minSagV: battery.nominal_voltage_v,
      cumulativeMah: 0,
    },
  ]);

  // Scaled Motor Trapezoidal Profile definition
  // Real motor spins for ~60-120 seconds. In simulation, we scale the display animation to ~2.5s for rich responsiveness
  // but calculate the true physical electrochemical consumption of a 60s high-torque actuation!
  const MOTOR_SPEC = {
    standbyCurrentMa: 2.0,
    accelCurrentMa: 1200.0, // 1.2A inrush
    cruiseCurrentMa: 650.0,  // 650mA sustained torque
    decelCurrentMa: 250.0,   // 250mA dynamic braking
    // Physical duration of each phase in real deployment (seconds):
    realDurations: {
      accel: 4.0,
      cruise: 45.0,
      decel: 6.0,
      dwell: 15.0,
    },
    // mAh drawn per full motor actuation:
    // (1200*4 + 650*45 + 250*6 + 2*15)/3600 = (4800 + 29250 + 1500 + 30)/3600 = 35580 / 3600 ~= 9.88 mAh
    mahPerSpin: 9.88,
  };

  // Remaining battery metrics
  const totalDrawn = consumedMah + thermalLossMah;
  const currentSocPct = Math.max(0, ((nominalCap - totalDrawn) / nominalCap) * 100);
  const capacityFade = Math.max(0, (totalDrawn / nominalCap) * 100);
  // SoH includes capacity loss plus accelerated thermal degradation factor
  const thermalAgingFactor = ambientTempC > 100 ? 1.05 : 1.0;
  const currentSohPct = Math.max(0, Math.min(100, 100 - capacityFade * thermalAgingFactor));
  const isDepleted = currentSocPct <= 0.5 || instantTerminalV <= cutoffVoltageV;

  // Estimated remaining spins before hitting cutoff
  const remainingSpins = isDepleted
    ? 0
    : Math.max(0, Math.floor((nominalCap - totalDrawn) / MOTOR_SPEC.mahPerSpin));

  // Electrochemical voltage calculation based on SoC and load current
  const computeTerminalVoltage = (drawCurrentMa: number, socNormalized: number) => {
    const soc = Math.max(0, Math.min(1, socNormalized));
    const vNom = battery.nominal_voltage_v;
    const vCut = cutoffVoltageV;

    // OCV curve for Li-SOCl2
    let ocv = vNom;
    if (soc > 0.95) {
      ocv = vNom + 0.02 * ((soc - 0.95) / 0.05);
    } else if (soc >= 0.15) {
      ocv = vNom - 0.03 * (1.0 - soc);
    } else if (soc >= 0.04) {
      const ratio = (0.15 - soc) / 0.11;
      ocv = vNom - 0.03 - 0.55 * Math.pow(ratio, 1.4);
    } else {
      const ratio = Math.max(0, (0.04 - soc) / 0.04);
      ocv = vNom - 0.58 - 1.2 * Math.pow(ratio, 1.2);
    }

    // Temperature resistance scaling
    const deltaT = battery.reference_temperature_c - ambientTempC;
    const tempMult = Math.max(0.2, 1.0 + deltaT * (Math.abs(battery.temp_resistance_coeff_pct) / 100.0));
    const rTotal = (battery.internal_resistance_ohm + (battery.initial_passivation_resistance_ohm || 0.5)) * tempMult;

    // Ohmic voltage drop under motor current
    const vDrop = (drawCurrentMa / 1000.0) * rTotal;
    return Math.max(0, ocv - vDrop);
  };

  // Perform single spin step calculation
  const applySingleSpinDegradation = () => {
    setCompletedSpins((prev) => {
      const nextSpins = prev + 1;
      const nextConsumed = consumedMah + MOTOR_SPEC.mahPerSpin;
      
      // Calculate 150°C thermal loss: Arrhenius self-discharge for the dwell interval between actuations
      const tRefK = battery.reference_temperature_c + 273.15;
      const tCurK = ambientTempC + 273.15;
      const rGas = 8.314;
      const exponent = (-battery.arrhenius_activation_energy_j_mol / rGas) * (1.0 / tCurK - 1.0 / tRefK);
      const arrhenius = Math.exp(Math.max(-10, Math.min(10, exponent)));
      const baseHourlySd = (battery.nominal_capacity_mah * (battery.self_discharge_annual_pct / 100.0)) / 8760.0;
      const dwellHours = 0.5; // Assume 30 min dwell between operations in downhole tool
      const additionalThermalMah = baseHourlySd * arrhenius * dwellHours;

      const nextThermal = thermalLossMah + additionalThermalMah;
      const nextTotalDrawn = nextConsumed + nextThermal;
      const nextSocPct = Math.max(0, ((nominalCap - nextTotalDrawn) / nominalCap) * 100);
      const nextSohPct = Math.max(0, Math.min(100, 100 - (nextTotalDrawn / nominalCap) * 100 * thermalAgingFactor));

      // Inrush terminal voltage
      const sagV = computeTerminalVoltage(MOTOR_SPEC.accelCurrentMa, nextSocPct / 100);
      const dwellV = computeTerminalVoltage(MOTOR_SPEC.standbyCurrentMa, nextSocPct / 100);

      setConsumedMah(nextConsumed);
      setThermalLossMah(nextThermal);
      setInstantTerminalV(dwellV);
      if (sagV < lowestSagV) setLowestSagV(sagV);

      setHistory((prevHist) => [
        ...prevHist.slice(-40), // Keep last 40 for clean rendering
        {
          spinIndex: nextSpins,
          socPct: Number(nextSocPct.toFixed(2)),
          sohPct: Number(nextSohPct.toFixed(2)),
          terminalVoltageV: Number(dwellV.toFixed(3)),
          minSagV: Number(sagV.toFixed(3)),
          cumulativeMah: Number(nextTotalDrawn.toFixed(2)),
        },
      ]);

      return nextSpins;
    });
  };

  // Run animated single spin
  const triggerAnimatedSpin = async () => {
    if (isSpinning || isDepleted) return;
    setIsSpinning(true);

    // 1. Accel phase (400ms display)
    setCurrentPhase("accel");
    setInstantCurrentMa(MOTOR_SPEC.accelCurrentMa);
    setCurrentRpm(1800);
    const sagV = computeTerminalVoltage(MOTOR_SPEC.accelCurrentMa, currentSocPct / 100);
    setInstantTerminalV(sagV);
    if (sagV < lowestSagV) setLowestSagV(sagV);
    await new Promise((r) => setTimeout(r, 450));

    // 2. Cruise phase (1100ms display)
    setCurrentPhase("cruise");
    setInstantCurrentMa(MOTOR_SPEC.cruiseCurrentMa);
    setCurrentRpm(3600);
    const cruiseV = computeTerminalVoltage(MOTOR_SPEC.cruiseCurrentMa, currentSocPct / 100);
    setInstantTerminalV(cruiseV);
    await new Promise((r) => setTimeout(r, 1100));

    // 3. Decel phase (450ms display)
    setCurrentPhase("decel");
    setInstantCurrentMa(MOTOR_SPEC.decelCurrentMa);
    setCurrentRpm(900);
    const decelV = computeTerminalVoltage(MOTOR_SPEC.decelCurrentMa, currentSocPct / 100);
    setInstantTerminalV(decelV);
    await new Promise((r) => setTimeout(r, 450));

    // 4. Dwell / Cooldown
    setCurrentPhase("dwell");
    setInstantCurrentMa(MOTOR_SPEC.standbyCurrentMa);
    setCurrentRpm(0);
    applySingleSpinDegradation();
    await new Promise((r) => setTimeout(r, 300));

    setCurrentPhase("idle");
    setIsSpinning(false);
  };

  // Fast multi-spin batch (e.g. 5x, 20x)
  const runMultiSpins = (count: number) => {
    if (isSpinning || isDepleted) return;
    setIsSpinning(true);
    setCurrentPhase("cruise");
    setCurrentRpm(3600);
    setInstantCurrentMa(MOTOR_SPEC.cruiseCurrentMa);

    let spinsDone = 0;
    const interval = setInterval(() => {
      applySingleSpinDegradation();
      spinsDone++;
      if (spinsDone >= count || currentSocPct <= 0.5) {
        clearInterval(interval);
        setCurrentPhase("idle");
        setCurrentRpm(0);
        setInstantCurrentMa(MOTOR_SPEC.standbyCurrentMa);
        setIsSpinning(false);
      }
    }, 120);
  };

  // Reset simulator
  const handleReset = () => {
    setIsSpinning(false);
    setCurrentPhase("idle");
    setCurrentRpm(0);
    setInstantCurrentMa(MOTOR_SPEC.standbyCurrentMa);
    setCompletedSpins(0);
    setConsumedMah(0);
    setThermalLossMah(0);
    setInstantTerminalV(battery.nominal_voltage_v);
    setLowestSagV(battery.nominal_voltage_v);
    setHistory([
      {
        spinIndex: 0,
        socPct: 100,
        sohPct: 100,
        terminalVoltageV: battery.nominal_voltage_v,
        minSagV: battery.nominal_voltage_v,
        cumulativeMah: 0,
      },
    ]);
  };

  // Switch to high temp Li-SOCl2 preset convenience button
  const handleSwitchToHighTempCell = () => {
    const highTempPreset = BATTERY_PRESETS["lisocl2_downhole_hitemp_150c"];
    if (highTempPreset && setBattery) {
      setBattery(highTempPreset);
    }
    if (setAmbientTempC) {
      setAmbientTempC(150);
    }
    handleReset();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
      {/* Module Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                High-Torque DC Motor Trapezoidal Degradation Lab
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Trapezoidal Drive
              </span>
              {ambientTempC >= 100 && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center space-x-1">
                  <Flame className="w-3 h-3 text-rose-600" />
                  <span>{ambientTempC}°C Downhole Thermal</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulates multi-minute high-torque actuation cycles (1.2A inrush acceleration, 650mA cruise, 250mA braking).
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          <button
            id="btn-spin-motor-1x"
            onClick={triggerAnimatedSpin}
            disabled={isSpinning || isDepleted}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-semibold text-xs tracking-wide shadow-sm shadow-amber-200 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Spin Motor (1x)</span>
          </button>

          <button
            id="btn-spin-motor-5x"
            onClick={() => runMultiSpins(5)}
            disabled={isSpinning || isDepleted}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            +5 Spins
          </button>

          <button
            id="btn-spin-motor-20x"
            onClick={() => runMultiSpins(20)}
            disabled={isSpinning || isDepleted}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            +20 Spins
          </button>

          <button
            id="btn-reset-motor-test"
            onClick={handleReset}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Reset to Fresh Battery"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Non-LiSOCl2 Warning Banner */}
      {!isLiSocl2 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-900">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">
              Warning: {battery.name} is not rated for 150°C or 1.2A Motor Current
            </p>
            <p className="text-rose-700">
              High-torque motors drawing 1.2 Amperes and operating at 150°C require specialized spiral-wound{" "}
              <strong>Lithium Thionyl Chloride (Li-SOCl₂)</strong> cells. Standard alkaline or coin cells will experience
              instantaneous voltage collapse due to high impedance ($R_0 &gt; 25\,\Omega$).
            </p>
            {setBattery && (
              <button
                onClick={handleSwitchToHighTempCell}
                className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] shadow-xs cursor-pointer"
              >
                <span>Switch to 150°C Li-SOCl2 D-Cell Preset</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Interactive Main Stage: Motor Graphics + Trapezoidal Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Animated Physical DC Motor Visualizer (5 cols) */}
        <div className="lg:col-span-5 p-5 bg-slate-900 rounded-2xl text-white flex flex-col justify-between relative overflow-hidden border border-slate-800">
          {/* Subtle background electrical grid effect */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />

          {/* Top Status & Tachometer */}
          <div className="flex items-center justify-between z-10">
            <div>
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Actuator State</span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    currentPhase === "accel"
                      ? "bg-rose-500 animate-ping"
                      : currentPhase === "cruise"
                      ? "bg-amber-400 animate-pulse"
                      : currentPhase === "decel"
                      ? "bg-blue-400"
                      : "bg-emerald-400"
                  }`}
                />
                <span className="text-sm font-bold font-mono uppercase tracking-wide text-white">
                  {currentPhase === "accel"
                    ? "Inrush Acceleration"
                    : currentPhase === "cruise"
                    ? "High-Torque Cruise"
                    : currentPhase === "decel"
                    ? "Dynamic Braking"
                    : "Standby Dwell"}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Speed (RPM)</span>
              <div className="text-xl font-bold font-mono text-amber-400">
                {currentRpm.toLocaleString()} <span className="text-xs text-slate-400">RPM</span>
              </div>
            </div>
          </div>

          {/* Center: Spinning DC Motor Rotor Graphic */}
          <div className="my-6 flex flex-col items-center justify-center relative">
            <div className="relative w-44 h-44 flex items-center justify-center">
              {/* Outer Stator Casing with cooling fins */}
              <svg className="absolute inset-0 w-full h-full text-slate-700" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="72" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="14 6" />
                <circle cx="80" cy="80" r="62" fill="#0f172a" stroke="#334155" strokeWidth="2" />
                {/* 4 Stator Pole Windings */}
                <rect x="74" y="22" width="12" height="14" rx="3" fill="#b45309" />
                <rect x="74" y="124" width="12" height="14" rx="3" fill="#b45309" />
                <rect x="22" y="74" width="14" height="12" rx="3" fill="#b45309" />
                <rect x="124" y="74" width="14" height="12" rx="3" fill="#b45309" />
              </svg>

              {/* Electromagnetic flux glow when active */}
              {isSpinning && (
                <div className="absolute inset-4 rounded-full bg-amber-500/20 blur-md animate-pulse pointer-events-none" />
              )}

              {/* Spinning Rotor / Armature Core */}
              <div
                className="w-24 h-24 rounded-full border-4 border-amber-500/80 bg-gradient-to-br from-slate-700 to-slate-800 shadow-lg flex items-center justify-center transition-transform"
                style={{
                  transform: `rotate(${isSpinning ? (currentPhase === "accel" ? 720 : 1800) : 0}deg)`,
                  transitionDuration: isSpinning ? "1.5s" : "0.5s",
                  transitionTimingFunction: currentPhase === "accel" ? "ease-in" : "linear",
                }}
              >
                {/* 4-Blade Armature Graphic */}
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="absolute w-20 h-4 bg-amber-400/90 rounded-sm shadow-xs" />
                  <div className="absolute w-4 h-20 bg-amber-400/90 rounded-sm shadow-xs" />
                  <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-amber-300 z-10 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Live Current Draw Callout */}
            <div className="mt-3 flex items-center space-x-2 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-300">Instant Draw:</span>
              <span className="font-bold text-amber-400">{instantCurrentMa.toFixed(1)} mA</span>
              <span className="text-slate-500">({(instantCurrentMa / 1000).toFixed(2)} A)</span>
            </div>
          </div>

          {/* Bottom Telemetry Bar */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-xs font-mono z-10">
            <div>
              <span className="text-slate-400">Terminal Voltage:</span>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">
                {instantTerminalV.toFixed(3)} V
              </p>
            </div>
            <div className="text-right">
              <span className="text-slate-400">Min Inrush Sag:</span>
              <p className="text-sm font-bold text-rose-400 mt-0.5">
                {lowestSagV.toFixed(3)} V
              </p>
            </div>
          </div>
        </div>

        {/* Right: Trapezoidal Waveform Curve + Degradation Gauges (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          {/* Trapezoidal Current Waveform SVG Diagram */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                <span>Trapezoidal Motor Commutation Profile</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Peak: {MOTOR_SPEC.accelCurrentMa} mA | Cruise: {MOTOR_SPEC.cruiseCurrentMa} mA
              </span>
            </div>

            {/* Vector Waveform Graphic */}
            <div className="relative h-28 w-full bg-white rounded-xl border border-slate-200 p-2 overflow-hidden flex items-end">
              <svg className="w-full h-full" viewBox="0 0 400 80" preserveAspectRatio="none">
                {/* Horizontal grid lines */}
                <line x1="0" y1="20" x2="400" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="0" y1="45" x2="400" y2="45" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="0" y1="70" x2="400" y2="70" stroke="#f1f5f9" strokeWidth="1" />

                {/* Trapezoid Area Fill */}
                <polygon
                  points="20,75 50,75 75,10 260,35 320,75 380,75 380,78 20,78"
                  fill="rgba(245, 158, 11, 0.12)"
                />

                {/* Trapezoid Stroke Path */}
                <polyline
                  points="20,75 50,75 75,10 260,35 320,75 380,75"
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Cursor marker showing current phase */}
                {currentPhase === "accel" && (
                  <circle cx="75" cy="10" r="5" fill="#ef4444" className="animate-ping" />
                )}
                {currentPhase === "cruise" && (
                  <circle cx="165" cy="35" r="5" fill="#f59e0b" className="animate-pulse" />
                )}
                {currentPhase === "decel" && (
                  <circle cx="290" cy="55" r="5" fill="#3b82f6" />
                )}
                {currentPhase === "idle" && (
                  <circle cx="35" cy="75" r="4" fill="#10b981" />
                )}
              </svg>

              {/* Labels below chart */}
              <div className="absolute bottom-1 left-3 right-3 flex justify-between text-[9px] font-mono text-slate-400">
                <span>Dwell (2mA)</span>
                <span className="text-rose-600 font-bold">Accel (1.2A)</span>
                <span className="text-amber-600 font-bold">High Torque Cruise (650mA)</span>
                <span className="text-blue-600">Braking (250mA)</span>
                <span>Rest</span>
              </div>
            </div>
          </div>

          {/* Degradation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Metric 1: Completed Spins */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Actuations</span>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {completedSpins}
              </p>
              <span className="text-[10px] text-slate-500">spins completed</span>
            </div>

            {/* Metric 2: Remaining Spins (RUL) */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Remaining Spins</span>
              <p className={`text-2xl font-extrabold mt-0.5 ${remainingSpins < 50 ? "text-rose-600" : "text-indigo-600"}`}>
                {remainingSpins.toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-500">RUL to 2.0V cutoff</span>
            </div>

            {/* Metric 3: State of Charge (SoC) */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">State of Charge</span>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {currentSocPct.toFixed(1)}%
              </p>
              <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    currentSocPct > 40 ? "bg-emerald-500" : currentSocPct > 15 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${currentSocPct}%` }}
                />
              </div>
            </div>

            {/* Metric 4: State of Health (SoH) */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">State of Health</span>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {currentSohPct.toFixed(1)}%
              </p>
              <span className="text-[10px] text-slate-500">{ambientTempC}°C Aging Factor</span>
            </div>
          </div>

          {/* Gradual Multi-Spin Step Chart */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                <TrendingDown className="w-4 h-4 text-violet-600" />
                <span>Multi-Spin Degradation Stair-Step Curve (SoC % vs Spin Count)</span>
              </span>
              <span className="font-mono text-slate-500 text-[11px]">
                Drawn: {totalDrawn.toFixed(1)} / {nominalCap} mAh
              </span>
            </div>

            {/* Vector Step Chart */}
            <div className="relative h-20 w-full bg-white rounded-lg border border-slate-200 p-1 flex items-end">
              <svg className="w-full h-full" viewBox="0 0 300 60" preserveAspectRatio="none">
                {history.length > 1 ? (
                  <>
                    {/* Background fill */}
                    <polygon
                      points={`0,60 ${history
                        .map((p, idx) => {
                          const x = (idx / (history.length - 1)) * 300;
                          const y = 60 - (p.socPct / 100) * 55;
                          return `${x},${y}`;
                        })
                        .join(" ")} 300,60`}
                      fill="rgba(124, 58, 237, 0.08)"
                    />
                    {/* Line */}
                    <polyline
                      points={history
                        .map((p, idx) => {
                          const x = (idx / (history.length - 1)) * 300;
                          const y = 60 - (p.socPct / 100) * 55;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="2"
                    />
                  </>
                ) : (
                  <line x1="0" y1="5" x2="300" y2="5" stroke="#7c3aed" strokeWidth="2" />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
