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
  Sliders,
  Clock,
  Settings2,
  Thermometer,
  RefreshCw,
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

export interface MotorCommutationProfile {
  name: string;
  standbyCurrentMa: number;
  standbyDurationS: number;
  accelCurrentMa: number;
  accelDurationS: number;
  cruiseCurrentMa: number;
  cruiseDurationS: number;
  decelCurrentMa: number;
  decelDurationS: number;
  dwellCurrentMa: number;
  dwellDurationS: number;
}

const DEFAULT_PROFILE: MotorCommutationProfile = {
  name: "High-Torque Downhole Actuator (150°C)",
  standbyCurrentMa: 2.0,
  standbyDurationS: 60.0,
  accelCurrentMa: 1200.0, // 1.2 A inrush
  accelDurationS: 4.0,
  cruiseCurrentMa: 650.0, // 650 mA cruise
  cruiseDurationS: 45.0,
  decelCurrentMa: 250.0,  // 250 mA braking
  decelDurationS: 6.0,
  dwellCurrentMa: 5.0,    // 5 mA dwell
  dwellDurationS: 15.0,
};

const MOTOR_PRESETS: Record<string, MotorCommutationProfile> = {
  downhole_actuator: {
    name: "Downhole Valve Actuator (150°C)",
    standbyCurrentMa: 2.0,
    standbyDurationS: 60.0,
    accelCurrentMa: 1200.0,
    accelDurationS: 4.0,
    cruiseCurrentMa: 650.0,
    cruiseDurationS: 45.0,
    decelCurrentMa: 250.0,
    decelDurationS: 6.0,
    dwellCurrentMa: 5.0,
    dwellDurationS: 15.0,
  },
  valve_servo: {
    name: "Fast Flow-Control Servo",
    standbyCurrentMa: 0.5,
    standbyDurationS: 30.0,
    accelCurrentMa: 800.0,
    accelDurationS: 1.5,
    cruiseCurrentMa: 350.0,
    cruiseDurationS: 12.0,
    decelCurrentMa: 150.0,
    decelDurationS: 2.0,
    dwellCurrentMa: 1.0,
    dwellDurationS: 10.0,
  },
  heavy_drill_drive: {
    name: "Heavy Rotary Drill Motor (Extreme Torque)",
    standbyCurrentMa: 5.0,
    standbyDurationS: 120.0,
    accelCurrentMa: 1800.0,
    accelDurationS: 6.0,
    cruiseCurrentMa: 950.0,
    cruiseDurationS: 60.0,
    decelCurrentMa: 400.0,
    decelDurationS: 8.0,
    dwellCurrentMa: 10.0,
    dwellDurationS: 30.0,
  },
  micro_positioner: {
    name: "Micro-Positioning Stepper Pulse",
    standbyCurrentMa: 0.1,
    standbyDurationS: 15.0,
    accelCurrentMa: 400.0,
    accelDurationS: 0.8,
    cruiseCurrentMa: 180.0,
    cruiseDurationS: 4.0,
    decelCurrentMa: 80.0,
    decelDurationS: 1.0,
    dwellCurrentMa: 0.5,
    dwellDurationS: 5.0,
  },
};

export const MotorSpinSimulator: React.FC<MotorSpinSimulatorProps> = ({
  battery,
  setBattery,
  ambientTempC,
  setAmbientTempC,
  cutoffVoltageV = 2.0,
}) => {
  const isLiSocl2 = battery.chemistry === "LITHIUM_THIONYL_CHLORIDE";

  // Commutation Profile State
  const [profile, setProfile] = useState<MotorCommutationProfile>(DEFAULT_PROFILE);
  const [showProfileEditor, setShowProfileEditor] = useState<boolean>(true);

  // Local temperature state with syncing
  const [localTempC, setLocalTempC] = useState<number>(ambientTempC);

  useEffect(() => {
    setLocalTempC(ambientTempC);
  }, [ambientTempC]);

  const handleTempChange = (newTemp: number) => {
    setLocalTempC(newTemp);
    if (setAmbientTempC) {
      setAmbientTempC(newTemp);
    }
  };

  // Motor state
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [currentPhase, setCurrentPhase] = useState<MotorPhase>("idle");
  const [currentRpm, setCurrentRpm] = useState<number>(0);
  const [instantCurrentMa, setInstantCurrentMa] = useState<number>(profile.standbyCurrentMa);

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

  // Compute total duration and mAh drawn per actuation cycle from current profile
  const profileMetrics = useMemo(() => {
    const totalDurationS =
      profile.standbyDurationS +
      profile.accelDurationS +
      profile.cruiseDurationS +
      profile.decelDurationS +
      profile.dwellDurationS;

    const chargeAs =
      profile.standbyCurrentMa * profile.standbyDurationS +
      profile.accelCurrentMa * profile.accelDurationS +
      profile.cruiseCurrentMa * profile.cruiseDurationS +
      profile.decelCurrentMa * profile.decelDurationS +
      profile.dwellCurrentMa * profile.dwellDurationS;

    const mahPerSpin = Math.max(0.01, chargeAs / 3600.0);
    const avgCurrentMa = chargeAs / Math.max(0.1, totalDurationS);
    const peakCurrentMa = Math.max(
      profile.standbyCurrentMa,
      profile.accelCurrentMa,
      profile.cruiseCurrentMa,
      profile.decelCurrentMa,
      profile.dwellCurrentMa
    );

    return {
      totalDurationS,
      mahPerSpin: Number(mahPerSpin.toFixed(3)),
      avgCurrentMa: Number(avgCurrentMa.toFixed(1)),
      peakCurrentMa,
    };
  }, [profile]);

  // Remaining battery metrics
  const totalDrawn = consumedMah + thermalLossMah;
  const currentSocPct = Math.max(0, ((nominalCap - totalDrawn) / nominalCap) * 100);
  const capacityFade = Math.max(0, (totalDrawn / nominalCap) * 100);
  // SoH includes capacity loss plus accelerated thermal degradation factor
  const thermalAgingFactor = localTempC > 100 ? 1.05 : 1.0;
  const currentSohPct = Math.max(0, Math.min(100, 100 - capacityFade * thermalAgingFactor));
  const isDepleted = currentSocPct <= 0.5 || instantTerminalV <= cutoffVoltageV;

  // Estimated remaining spins before hitting cutoff
  const remainingSpins = isDepleted
    ? 0
    : Math.max(0, Math.floor((nominalCap - totalDrawn) / profileMetrics.mahPerSpin));

  // Temperature multiplier & Arrhenius acceleration
  const tempThermalStats = useMemo(() => {
    const tRefK = battery.reference_temperature_c + 273.15;
    const tCurK = localTempC + 273.15;
    const rGas = 8.314;
    const exponent =
      (-battery.arrhenius_activation_energy_j_mol / rGas) *
      (1.0 / tCurK - 1.0 / tRefK);
    const arrheniusMult = Math.exp(Math.max(-10, Math.min(10, exponent)));

    const deltaT = battery.reference_temperature_c - localTempC;
    const tempMult = Math.max(
      0.2,
      1.0 + deltaT * (Math.abs(battery.temp_resistance_coeff_pct) / 100.0)
    );
    const rTotal =
      (battery.internal_resistance_ohm +
        (battery.initial_passivation_resistance_ohm || 0.5)) *
      tempMult;

    return {
      arrheniusMult: Number(arrheniusMult.toFixed(1)),
      tempMult: Number(tempMult.toFixed(2)),
      rTotal: Number(rTotal.toFixed(3)),
    };
  }, [battery, localTempC]);

  // Electrochemical voltage calculation based on SoC and load current
  const computeTerminalVoltage = (drawCurrentMa: number, socNormalized: number) => {
    const soc = Math.max(0, Math.min(1, socNormalized));
    const vNom = battery.nominal_voltage_v;

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

    // Ohmic voltage drop under motor current
    const vDrop = (drawCurrentMa / 1000.0) * tempThermalStats.rTotal;
    return Math.max(0, ocv - vDrop);
  };

  // Perform single spin step calculation
  const applySingleSpinDegradation = () => {
    setCompletedSpins((prev) => {
      const nextSpins = prev + 1;
      const nextConsumed = consumedMah + profileMetrics.mahPerSpin;

      // Calculate thermal loss based on current temperature and dwell interval
      const baseHourlySd =
        (battery.nominal_capacity_mah *
          (battery.self_discharge_annual_pct / 100.0)) /
        8760.0;
      // Convert dwell time in seconds to hours
      const dwellHours = Math.max(0.001, profile.dwellDurationS / 3600.0);
      const additionalThermalMah =
        baseHourlySd * tempThermalStats.arrheniusMult * dwellHours;

      const nextThermal = thermalLossMah + additionalThermalMah;
      const nextTotalDrawn = nextConsumed + nextThermal;
      const nextSocPct = Math.max(
        0,
        ((nominalCap - nextTotalDrawn) / nominalCap) * 100
      );
      const nextSohPct = Math.max(
        0,
        Math.min(
          100,
          100 - (nextTotalDrawn / nominalCap) * 100 * thermalAgingFactor
        )
      );

      // Inrush terminal voltage
      const sagV = computeTerminalVoltage(
        profile.accelCurrentMa,
        nextSocPct / 100
      );
      const dwellV = computeTerminalVoltage(
        profile.dwellCurrentMa,
        nextSocPct / 100
      );

      setConsumedMah(nextConsumed);
      setThermalLossMah(nextThermal);
      setInstantTerminalV(dwellV);
      if (sagV < lowestSagV) setLowestSagV(sagV);

      setHistory((prevHist) => [
        ...prevHist.slice(-40),
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

  // Run animated single spin using current custom profile
  const triggerAnimatedSpin = async () => {
    if (isSpinning || isDepleted) return;
    setIsSpinning(true);

    // 1. Accel phase
    setCurrentPhase("accel");
    setInstantCurrentMa(profile.accelCurrentMa);
    setCurrentRpm(1800);
    const sagV = computeTerminalVoltage(
      profile.accelCurrentMa,
      currentSocPct / 100
    );
    setInstantTerminalV(sagV);
    if (sagV < lowestSagV) setLowestSagV(sagV);
    await new Promise((r) => setTimeout(r, 450));

    // 2. Cruise phase
    setCurrentPhase("cruise");
    setInstantCurrentMa(profile.cruiseCurrentMa);
    setCurrentRpm(3600);
    const cruiseV = computeTerminalVoltage(
      profile.cruiseCurrentMa,
      currentSocPct / 100
    );
    setInstantTerminalV(cruiseV);
    await new Promise((r) => setTimeout(r, 1100));

    // 3. Decel phase
    setCurrentPhase("decel");
    setInstantCurrentMa(profile.decelCurrentMa);
    setCurrentRpm(900);
    const decelV = computeTerminalVoltage(
      profile.decelCurrentMa,
      currentSocPct / 100
    );
    setInstantTerminalV(decelV);
    await new Promise((r) => setTimeout(r, 450));

    // 4. Dwell / Cooldown
    setCurrentPhase("dwell");
    setInstantCurrentMa(profile.dwellCurrentMa);
    setCurrentRpm(0);
    applySingleSpinDegradation();
    await new Promise((r) => setTimeout(r, 300));

    setCurrentPhase("idle");
    setInstantCurrentMa(profile.standbyCurrentMa);
    setIsSpinning(false);
  };

  // Fast multi-spin batch (e.g. 5x, 20x)
  const runMultiSpins = (count: number) => {
    if (isSpinning || isDepleted) return;
    setIsSpinning(true);
    setCurrentPhase("cruise");
    setCurrentRpm(3600);
    setInstantCurrentMa(profile.cruiseCurrentMa);

    let spinsDone = 0;
    const interval = setInterval(() => {
      applySingleSpinDegradation();
      spinsDone++;
      if (spinsDone >= count || currentSocPct <= 0.5) {
        clearInterval(interval);
        setCurrentPhase("idle");
        setCurrentRpm(0);
        setInstantCurrentMa(profile.standbyCurrentMa);
        setIsSpinning(false);
      }
    }, 120);
  };

  // Reset simulator
  const handleReset = () => {
    setIsSpinning(false);
    setCurrentPhase("idle");
    setCurrentRpm(0);
    setInstantCurrentMa(profile.standbyCurrentMa);
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
    handleTempChange(150);
    handleReset();
  };

  // Select a preset profile
  const handleSelectPreset = (key: string) => {
    const p = MOTOR_PRESETS[key];
    if (p) {
      setProfile({ ...p });
      setInstantCurrentMa(p.standbyCurrentMa);
    }
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
              {localTempC >= 100 && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center space-x-1">
                  <Flame className="w-3 h-3 text-rose-600" />
                  <span>{localTempC}°C Downhole Thermal</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulates multi-minute high-torque actuation cycles with customizable commutation profile and thermal kinetics.
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
              Warning: {battery.name} is not rated for 150°C or {profileMetrics.peakCurrentMa}mA Motor Current
            </p>
            <p className="text-rose-700">
              High-torque motors drawing high Amperes and operating at elevated temperatures require specialized spiral-wound{" "}
              <strong>Lithium Thionyl Chloride (Li-SOCl₂)</strong> cells. Standard alkaline or coin cells will experience
              rapid voltage collapse due to internal impedance.
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

      {/* NEW: TEMPERATURE & COMMUTATION PROFILE CONTROL CONSOLE */}
      <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Simulation Parameters & Commutation Profile Editor
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="btn-toggle-profile-editor"
              onClick={() => setShowProfileEditor(!showProfileEditor)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center space-x-1 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{showProfileEditor ? "Hide Profile Editor" : "Edit Profile"}</span>
            </button>
          </div>
        </div>

        {/* 1. Operating Temperature Input Controls */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Thermometer className={`w-4 h-4 ${localTempC >= 100 ? "text-rose-600" : "text-amber-600"}`} />
              <div>
                <span className="text-xs font-bold text-slate-800">
                  Target Operating Temperature (°C)
                </span>
                <p className="text-[11px] text-slate-500">
                  Directly sets cell thermal state, Arrhenius self-discharge rate, and impedance derating.
                </p>
              </div>
            </div>

            {/* Direct Number Input & Value Display */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                <input
                  id="input-motor-temperature"
                  type="number"
                  min="-40"
                  max={isLiSocl2 ? 160 : 70}
                  step="1"
                  value={localTempC}
                  onChange={(e) => handleTempChange(Number(e.target.value))}
                  className="w-20 px-2 py-1 bg-white font-mono font-bold text-sm text-slate-900 border border-slate-200 rounded-md text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-slate-600 px-2">°C</span>
              </div>

              {/* Arrhenius Factor Badge */}
              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Thermal Loss Mult</span>
                <span className={`text-xs font-mono font-bold ${tempThermalStats.arrheniusMult > 50 ? "text-rose-600" : "text-slate-800"}`}>
                  {tempThermalStats.arrheniusMult}× Arrhenius
                </span>
              </div>
            </div>
          </div>

          {/* Slider & Quick Temperature Preset Buttons */}
          <div className="space-y-2 pt-1">
            <input
              id="slider-motor-temperature"
              type="range"
              min="-20"
              max={isLiSocl2 ? 150 : 60}
              step="1"
              value={localTempC}
              onChange={(e) => handleTempChange(Number(e.target.value))}
              className="w-full accent-amber-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-slate-400 font-mono">-20°C Freezing</span>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => handleTempChange(-20)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    localTempC === -20 ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  -20°C (Cold)
                </button>
                <button
                  type="button"
                  onClick={() => handleTempChange(25)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    localTempC === 25 ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  25°C (Lab)
                </button>
                <button
                  type="button"
                  onClick={() => handleTempChange(60)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    localTempC === 60 ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  60°C (Industrial)
                </button>
                {isLiSocl2 ? (
                  <button
                    type="button"
                    onClick={() => handleTempChange(150)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer flex items-center space-x-1 ${
                      localTempC === 150
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-rose-100 hover:bg-rose-200 text-rose-800"
                    }`}
                  >
                    <Flame className="w-3 h-3 text-rose-500" />
                    <span>150°C (Downhole)</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">
                    (150°C reserved for Li-SOCl2)
                  </span>
                )}
              </div>

              <span className="text-[10px] text-slate-400 font-mono">
                {isLiSocl2 ? "150°C Geothermal" : "60°C Max"}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Commutation Profile Editor (Duration and Values) */}
        {showProfileEditor && (
          <div className="space-y-4">
            {/* Presets and Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-700">
                Adjust Commutation Waveform Values & Durations:
              </span>

              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-500">Presets:</span>
                <select
                  id="select-motor-profile-preset"
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a motor preset...
                  </option>
                  <option value="downhole_actuator">Downhole Actuator (150°C, 1.2A)</option>
                  <option value="valve_servo">Flow Control Servo (800mA)</option>
                  <option value="heavy_drill_drive">Heavy Rotary Drill (1.8A)</option>
                  <option value="micro_positioner">Micro-Positioner Pulse (400mA)</option>
                </select>

                <button
                  type="button"
                  onClick={() => setProfile(DEFAULT_PROFILE)}
                  className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Reset to Default Profile"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 5 Segment Bento Inputs: Standby, Accel, Cruise, Decel, Dwell */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Segment 1: Standby */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    1. Standby
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">Current (mA)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={profile.standbyCurrentMa}
                    onChange={(e) =>
                      setProfile({ ...profile, standbyCurrentMa: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">Duration (s)</label>
                  <input
                    type="number"
                    min="0.1"
                    max="3600"
                    step="1"
                    value={profile.standbyDurationS}
                    onChange={(e) =>
                      setProfile({ ...profile, standbyDurationS: Math.max(0.1, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Segment 2: Inrush Acceleration */}
              <div className="p-3.5 bg-white rounded-xl border border-rose-200/80 shadow-xs space-y-2 bg-gradient-to-b from-rose-50/20 to-white">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center space-x-1">
                    <Zap className="w-3 h-3 text-rose-500" />
                    <span>2. Inrush Accel</span>
                  </span>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                </div>
                <div>
                  <label className="text-[10px] text-rose-800 font-semibold block">Peak Surge (mA)</label>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    step="50"
                    value={profile.accelCurrentMa}
                    onChange={(e) =>
                      setProfile({ ...profile, accelCurrentMa: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-rose-50/50 border border-rose-200 rounded-md font-mono text-xs font-bold text-rose-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-rose-800 font-semibold block">Duration (s)</label>
                  <input
                    type="number"
                    min="0.1"
                    max="60"
                    step="0.5"
                    value={profile.accelDurationS}
                    onChange={(e) =>
                      setProfile({ ...profile, accelDurationS: Math.max(0.1, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-rose-50/50 border border-rose-200 rounded-md font-mono text-xs font-bold text-rose-900"
                  />
                </div>
              </div>

              {/* Segment 3: Continuous Cruise */}
              <div className="p-3.5 bg-white rounded-xl border border-amber-200/80 shadow-xs space-y-2 bg-gradient-to-b from-amber-50/20 to-white">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                    3. High-Torque Cruise
                  </span>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] text-amber-800 font-semibold block">Cruise Draw (mA)</label>
                  <input
                    type="number"
                    min="10"
                    max="3000"
                    step="25"
                    value={profile.cruiseCurrentMa}
                    onChange={(e) =>
                      setProfile({ ...profile, cruiseCurrentMa: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-amber-50/50 border border-amber-200 rounded-md font-mono text-xs font-bold text-amber-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-amber-800 font-semibold block">Duration (s)</label>
                  <input
                    type="number"
                    min="1"
                    max="600"
                    step="1"
                    value={profile.cruiseDurationS}
                    onChange={(e) =>
                      setProfile({ ...profile, cruiseDurationS: Math.max(0.5, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-amber-50/50 border border-amber-200 rounded-md font-mono text-xs font-bold text-amber-900"
                  />
                </div>
              </div>

              {/* Segment 4: Decel / Braking */}
              <div className="p-3.5 bg-white rounded-xl border border-blue-200/80 shadow-xs space-y-2 bg-gradient-to-b from-blue-50/20 to-white">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                    4. Dynamic Decel
                  </span>
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] text-blue-800 font-semibold block">Braking Draw (mA)</label>
                  <input
                    type="number"
                    min="0"
                    max="1500"
                    step="25"
                    value={profile.decelCurrentMa}
                    onChange={(e) =>
                      setProfile({ ...profile, decelCurrentMa: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-blue-50/50 border border-blue-200 rounded-md font-mono text-xs font-bold text-blue-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-800 font-semibold block">Duration (s)</label>
                  <input
                    type="number"
                    min="0.1"
                    max="60"
                    step="0.5"
                    value={profile.decelDurationS}
                    onChange={(e) =>
                      setProfile({ ...profile, decelDurationS: Math.max(0.1, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-blue-50/50 border border-blue-200 rounded-md font-mono text-xs font-bold text-blue-900"
                  />
                </div>
              </div>

              {/* Segment 5: Dwell / Recovery */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    5. Post-Spin Dwell
                  </span>
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">Dwell Draw (mA)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={profile.dwellCurrentMa}
                    onChange={(e) =>
                      setProfile({ ...profile, dwellCurrentMa: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-semibold block">Duration (s)</label>
                  <input
                    type="number"
                    min="0.5"
                    max="1800"
                    step="1"
                    value={profile.dwellDurationS}
                    onChange={(e) =>
                      setProfile({ ...profile, dwellDurationS: Math.max(0.5, Number(e.target.value)) })
                    }
                    className="w-full mt-0.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-xs font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Commutation Profile Summary Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-500/10 border border-amber-300/60 rounded-xl text-xs">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-700" />
                <span className="font-semibold text-amber-900">Total Cycle Duration:</span>
                <span className="font-mono font-bold text-amber-950">{profileMetrics.totalDurationS} s</span>
              </div>

              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-700" />
                <span className="font-semibold text-amber-900">Charge per Actuation:</span>
                <span className="font-mono font-bold text-amber-950">{profileMetrics.mahPerSpin} mAh</span>
              </div>

              <div className="flex items-center space-x-2">
                <Gauge className="w-4 h-4 text-amber-700" />
                <span className="font-semibold text-amber-900">Peak Current:</span>
                <span className="font-mono font-bold text-amber-950">{profileMetrics.peakCurrentMa} mA</span>
                <span className="text-slate-500">({(profileMetrics.peakCurrentMa / 1000).toFixed(2)} A)</span>
              </div>

              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-amber-700" />
                <span className="font-semibold text-amber-900">Average Current:</span>
                <span className="font-mono font-bold text-amber-950">{profileMetrics.avgCurrentMa} mA</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Main Stage: Motor Graphics + Dynamic Trapezoidal Telemetry */}
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

        {/* Right: Dynamic Trapezoidal Waveform Curve + Degradation Gauges (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
          {/* Dynamic Trapezoidal Current Waveform SVG Diagram */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                <span>Adjusted Trapezoidal Commutation Waveform</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Peak: {profile.accelCurrentMa} mA | Cruise: {profile.cruiseCurrentMa} mA | Total: {profileMetrics.totalDurationS}s
              </span>
            </div>

            {/* Dynamic Vector Waveform Graphic */}
            <div className="relative h-28 w-full bg-white rounded-xl border border-slate-200 p-2 overflow-hidden flex items-end">
              <svg className="w-full h-full" viewBox="0 0 400 80" preserveAspectRatio="none">
                {/* Horizontal grid lines */}
                <line x1="0" y1="20" x2="400" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="0" y1="45" x2="400" y2="45" stroke="#f1f5f9" strokeWidth="1" />
                <line x1="0" y1="70" x2="400" y2="70" stroke="#f1f5f9" strokeWidth="1" />

                {/* Calculate dynamic SVG coordinates based on user durations and currents */}
                {(() => {
                  const maxI = Math.max(100, profile.accelCurrentMa * 1.1);
                  const totalT = Math.max(1, profileMetrics.totalDurationS);

                  // Normalized x positions (total span 360, starting at x=20)
                  const xStandby = 20 + (profile.standbyDurationS / totalT) * 70;
                  const xAccel = xStandby + (profile.accelDurationS / totalT) * 110;
                  const xCruise = xAccel + (profile.cruiseDurationS / totalT) * 120;
                  const xDecel = xCruise + (profile.decelDurationS / totalT) * 40;
                  const xDwell = 380;

                  // Normalized y positions (0 is top y=10, 75 is bottom)
                  const yStandby = 75 - (profile.standbyCurrentMa / maxI) * 65;
                  const yAccel = 75 - (profile.accelCurrentMa / maxI) * 65;
                  const yCruise = 75 - (profile.cruiseCurrentMa / maxI) * 65;
                  const yDecel = 75 - (profile.decelCurrentMa / maxI) * 65;
                  const yDwell = 75 - (profile.dwellCurrentMa / maxI) * 65;

                  const polyPoints = `20,75 20,${yStandby} ${xStandby},${yStandby} ${xAccel},${yAccel} ${xCruise},${yCruise} ${xDecel},${yDecel} ${xDwell},${yDwell} ${xDwell},75`;
                  const strokePoints = `20,${yStandby} ${xStandby},${yStandby} ${xAccel},${yAccel} ${xCruise},${yCruise} ${xDecel},${yDecel} ${xDwell},${yDwell}`;

                  return (
                    <>
                      {/* Trapezoid Area Fill */}
                      <polygon points={polyPoints} fill="rgba(245, 158, 11, 0.12)" />

                      {/* Trapezoid Stroke Path */}
                      <polyline
                        points={strokePoints}
                        fill="none"
                        stroke="#d97706"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Cursor marker showing current phase */}
                      {currentPhase === "accel" && (
                        <circle cx={xAccel} cy={yAccel} r="5" fill="#ef4444" className="animate-ping" />
                      )}
                      {currentPhase === "cruise" && (
                        <circle cx={(xAccel + xCruise) / 2} cy={yCruise} r="5" fill="#f59e0b" className="animate-pulse" />
                      )}
                      {currentPhase === "decel" && (
                        <circle cx={xDecel} cy={yDecel} r="5" fill="#3b82f6" />
                      )}
                      {currentPhase === "idle" && (
                        <circle cx={25} cy={yStandby} r="4" fill="#10b981" />
                      )}
                    </>
                  );
                })()}
              </svg>

              {/* Labels below chart */}
              <div className="absolute bottom-1 left-3 right-3 flex justify-between text-[9px] font-mono text-slate-400">
                <span>Standby ({profile.standbyCurrentMa}mA)</span>
                <span className="text-rose-600 font-bold">Accel ({profile.accelCurrentMa}mA)</span>
                <span className="text-amber-600 font-bold">Cruise ({profile.cruiseCurrentMa}mA)</span>
                <span className="text-blue-600">Brake ({profile.decelCurrentMa}mA)</span>
                <span>Dwell</span>
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
              <span className="text-[10px] text-slate-500">{localTempC}°C Thermal Factor</span>
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
