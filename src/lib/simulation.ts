import {
  BatterySpecification,
  ElectricalLoadProfile,
  LoadSegment,
  LoadType,
  SimulationStepResult,
  SimulationReport,
} from "../types";

// Helper functions matching the Python electrochemical model
function calculateOcv(spec: BatterySpecification, socNormalized: number): number {
  const soc = Math.max(0, Math.min(1, socNormalized));
  const vNom = spec.nominal_voltage_v;
  const chem = spec.chemistry;

  if (chem === "LITHIUM_THIONYL_CHLORIDE") {
    if (soc > 0.95) {
      return vNom + 0.02 * ((soc - 0.95) / 0.05);
    } else if (soc >= 0.15) {
      return vNom - 0.03 * (1.0 - soc);
    } else if (soc >= 0.04) {
      const ratio = (0.15 - soc) / 0.11;
      return vNom - 0.03 - 0.55 * Math.pow(ratio, 1.4);
    } else {
      const ratio = Math.max(0, (0.04 - soc) / 0.04);
      return vNom - 0.58 - 1.2 * Math.pow(ratio, 1.2);
    }
  } else if (chem === "LITHIUM_MANGANESE_DIOXIDE") {
    if (soc > 0.9) {
      return 3.05 + 0.15 * ((soc - 0.9) / 0.1);
    } else if (soc >= 0.2) {
      return 2.7 + 0.35 * ((soc - 0.2) / 0.7);
    } else {
      return 2.0 + 0.7 * Math.pow(soc / 0.2, 1.3);
    }
  } else if (chem === "ALKALINE_ZN_MNO2") {
    return 0.88 + 0.65 * Math.pow(soc, 0.7) + 0.05 * Math.pow(soc, 3.0);
  } else {
    const vCut = spec.cutoff_voltage_v;
    const delta = vNom - vCut;
    return vCut + delta * (0.85 * Math.pow(soc, 0.45) + 0.15 * soc);
  }
}

function getTempResistanceMultiplier(spec: BatterySpecification, tempC: number): number {
  const deltaT = spec.reference_temperature_c - tempC;
  const factor = 1.0 + deltaT * (Math.abs(spec.temp_resistance_coeff_pct) / 100.0);
  return Math.max(0.2, factor);
}

function calculateSelfDischargeCurrentMa(spec: BatterySpecification, tempC: number): number {
  const tRefK = spec.reference_temperature_c + 273.15;
  const tCurK = tempC + 273.15;
  const rGas = 8.314;
  const exponent = (-spec.arrhenius_activation_energy_j_mol / rGas) * (1.0 / tCurK - 1.0 / tRefK);
  const arrhenius = Math.exp(Math.max(-10, Math.min(10, exponent)));
  const annualFraction = spec.self_discharge_annual_pct / 100.0;
  const baseCurrentMa = (spec.nominal_capacity_mah * annualFraction) / 8760.0;
  return baseCurrentMa * arrhenius;
}

function convertLoadToCurrentMa(type: LoadType, val: number, estV: number): number {
  const v = Math.max(0.1, estV);
  if (type === "CONSTANT_CURRENT") {
    return Math.max(0, val);
  } else if (type === "CONSTANT_POWER") {
    return Math.max(0, val / v);
  } else if (type === "CONSTANT_RESISTANCE") {
    const r = Math.max(0.01, val);
    return (v / r) * 1000.0;
  }
  return Math.max(0, val);
}

export function runClientSimulation(
  spec: BatterySpecification,
  profile: ElectricalLoadProfile,
  ambientTempC: number = 25.0,
  maxPoints: number = 400
): SimulationReport {
  const cRatio = Math.max(0.1, Math.min(0.95, spec.kibam_c_ratio));
  let qAvailable = spec.nominal_capacity_mah * cRatio;
  let qBound = spec.nominal_capacity_mah * (1.0 - cRatio);
  const qTotal = spec.nominal_capacity_mah;

  let timeS = 0.0;
  let consumedCapacityMah = 0.0;
  let consumedEnergyMwh = 0.0;
  let currentPassivationR = spec.has_passivation ? spec.initial_passivation_resistance_ohm : 0.0;
  let minTerminalVoltage = spec.nominal_voltage_v;
  let maxVoltageDip = 0.0;
  let isCutoffReached = false;
  let terminationReason = "PROFILE_COMPLETED";

  const recordedSteps: SimulationStepResult[] = [];
  const cycleDuration = profile.segments.reduce((acc, s) => acc + s.duration_s, 0) || 1.0;

  // Phase A: First 3 cycles high-res sampling
  const initialCycles = Math.min(3, profile.repeat_count > 0 && profile.repeat_count <= 3 ? profile.repeat_count : 3);
  let cyclesCompleted = 0;

  for (let c = 0; c < initialCycles; c++) {
    if (isCutoffReached) break;

    for (const seg of profile.segments) {
      if (isCutoffReached) break;

      const subSteps = seg.duration_s < 2.0 ? Math.min(10, Math.max(1, Math.ceil(seg.duration_s / 0.1))) : Math.min(15, Math.max(1, Math.ceil(seg.duration_s / 5.0)));
      const dtSub = seg.duration_s / subSteps;

      for (let sIdx = 0; sIdx < subSteps; sIdx++) {
        const segTemp = seg.temperature_c ?? ambientTempC;
        const iSd = calculateSelfDischargeCurrentMa(spec, segTemp);
        const iLoad = convertLoadToCurrentMa(seg.load_type, seg.value, spec.nominal_voltage_v);
        const iTotal = iLoad + iSd;

        // Passivation update
        if (spec.has_passivation) {
          if (iTotal > 0.2) {
            const decay = Math.exp(-((iTotal / 10.0) * spec.passivation_breakdown_rate * 15.0) * dtSub);
            currentPassivationR = Math.max(0, currentPassivationR * decay);
          } else {
            const regrowth = spec.passivation_regrowth_rate * dtSub;
            const deficit = Math.max(0, spec.max_passivation_resistance_ohm - currentPassivationR);
            currentPassivationR = Math.min(
              spec.max_passivation_resistance_ohm,
              currentPassivationR + regrowth * (deficit / Math.max(1, spec.max_passivation_resistance_ohm))
            );
          }
        }

        // KiBaM exchange
        const h1 = qAvailable / cRatio;
        const h2 = qBound / (1.0 - cRatio);
        const dqEx = spec.kibam_k_rate * (h2 - h1) * dtSub;
        const dqDrain = (iTotal * dtSub) / 3600.0;

        qAvailable = Math.max(0, qAvailable - dqDrain + dqEx);
        qBound = Math.max(0, qBound - dqEx);

        const currentSoc = Math.max(0, Math.min(1, (qAvailable + qBound) / qTotal));
        const ocv = calculateOcv(spec, currentSoc);

        const tempMult = getTempResistanceMultiplier(spec, segTemp);
        const rSeries = (spec.internal_resistance_ohm + currentPassivationR) * tempMult;
        const ohmicDrop = (iTotal / 1000.0) * rSeries;
        const vTerm = Math.max(0, ocv - ohmicDrop);

        consumedCapacityMah += (iLoad * dtSub) / 3600.0;
        consumedEnergyMwh += Math.max(0, (vTerm * iLoad * dtSub) / 3600.0);
        timeS += dtSub;

        const dip = Math.max(0, ocv - vTerm);
        if (dip > maxVoltageDip) maxVoltageDip = dip;
        if (vTerm < minTerminalVoltage) minTerminalVoltage = vTerm;

        if (vTerm <= spec.cutoff_voltage_v || qAvailable <= 0.001) {
          isCutoffReached = true;
          terminationReason = "CUTOFF_VOLTAGE_REACHED";
        }

        recordedSteps.push({
          time_s: Number(timeS.toFixed(2)),
          dt_s: dtSub,
          segment_name: seg.name,
          current_ma: Number(iLoad.toFixed(2)),
          terminal_voltage_v: Number(vTerm.toFixed(4)),
          ocv_v: Number(ocv.toFixed(4)),
          total_internal_resistance_ohm: Number((rSeries + spec.r1_polarization_ohm + spec.r2_diffusion_ohm).toFixed(2)),
          passivation_resistance_ohm: Number(currentPassivationR.toFixed(2)),
          consumed_capacity_mah: Number(consumedCapacityMah.toFixed(3)),
          consumed_energy_mwh: Number(consumedEnergyMwh.toFixed(3)),
          soc_pct: Number((currentSoc * 100).toFixed(2)),
          soh_pct: Number((currentSoc * 100).toFixed(2)),
          temperature_c: segTemp,
          cutoff_breached: isCutoffReached,
        });

        if (isCutoffReached) break;
      }
    }
    cyclesCompleted++;
  }

  // Phase B: Cycle-Aggregated Extrapolation
  if (!isCutoffReached && (profile.repeat_count < 0 || cyclesCompleted < profile.repeat_count)) {
    const cycleCapMah = profile.segments.reduce(
      (acc, s) => acc + (convertLoadToCurrentMa(s.load_type, s.value, spec.nominal_voltage_v) * s.duration_s) / 3600.0,
      0
    );
    const cycleSdMah = (calculateSelfDischargeCurrentMa(spec, ambientTempC) * cycleDuration) / 3600.0;
    const totalCycleMah = Math.max(1e-6, cycleCapMah + cycleSdMah);

    const maxPulseSeg = profile.segments.reduce((max, s) => {
      const cur = convertLoadToCurrentMa(s.load_type, s.value, spec.nominal_voltage_v);
      const maxCur = convertLoadToCurrentMa(max.load_type, max.value, spec.nominal_voltage_v);
      return cur > maxCur ? s : max;
    }, profile.segments[0]);

    const peakPulseCurrentMa = convertLoadToCurrentMa(maxPulseSeg.load_type, maxPulseSeg.value, spec.nominal_voltage_v);

    const remainingCap = qAvailable + qBound;
    const estRemainingCycles = Math.max(1, Math.floor(remainingCap / totalCycleMah));
    const targetCycles = profile.repeat_count > 0 ? profile.repeat_count : estRemainingCycles * 2;

    const macroSteps = Math.min(250, Math.max(40, estRemainingCycles));
    const cyclesPerMacro = Math.max(1, Math.ceil((targetCycles - cyclesCompleted) / macroSteps));

    while (cyclesCompleted < targetCycles && !isCutoffReached) {
      const cyclesToAdvance = Math.min(cyclesPerMacro, targetCycles - cyclesCompleted);
      const dtAdvance = cyclesToAdvance * cycleDuration;

      if (timeS + dtAdvance > profile.max_simulation_time_s) {
        terminationReason = "MAX_SIM_TIME_REACHED";
        break;
      }

      const capDrain = cyclesToAdvance * totalCycleMah;
      consumedCapacityMah += capDrain;
      qAvailable = Math.max(0, qAvailable - capDrain * cRatio);
      qBound = Math.max(0, qBound - capDrain * (1.0 - cRatio));
      timeS += dtAdvance;
      cyclesCompleted += cyclesToAdvance;

      const soc = Math.max(0, Math.min(1, (qAvailable + qBound) / qTotal));
      const ocv = calculateOcv(spec, soc);
      const tempMult = getTempResistanceMultiplier(spec, ambientTempC);

      const tau1 = Math.max(0.01, spec.r1_polarization_ohm * Math.max(0.001, spec.c1_polarization_f));
      const tau2 = Math.max(0.01, spec.r2_diffusion_ohm * Math.max(0.01, spec.c2_diffusion_f));
      const pulseDur = maxPulseSeg.duration_s;
      const factorRc1 = 1.0 - Math.exp(-Math.min(10, pulseDur / tau1));
      const factorRc2 = 1.0 - Math.exp(-Math.min(10, pulseDur / tau2));

      const rPassTransient = currentPassivationR * Math.exp(-(peakPulseCurrentMa / 10.0) * 0.5);
      const rEffPulse =
        (spec.internal_resistance_ohm +
          rPassTransient +
          spec.r1_polarization_ohm * factorRc1 +
          spec.r2_diffusion_ohm * factorRc2) *
        tempMult;

      const peakVDrop = (peakPulseCurrentMa / 1000.0) * rEffPulse;
      const vTermAtPulse = ocv - peakVDrop;
      const avgV = (ocv + vTermAtPulse) / 2.0;
      consumedEnergyMwh += capDrain * avgV;

      if (vTermAtPulse < minTerminalVoltage) minTerminalVoltage = vTermAtPulse;

      const stepBreached = vTermAtPulse <= spec.cutoff_voltage_v || soc <= 0.005;

      recordedSteps.push({
        time_s: Number(timeS.toFixed(2)),
        dt_s: dtAdvance,
        segment_name: `Cycle ${cyclesCompleted}`,
        current_ma: Number(peakPulseCurrentMa.toFixed(2)),
        terminal_voltage_v: Number(Math.max(0, vTermAtPulse).toFixed(4)),
        ocv_v: Number(ocv.toFixed(4)),
        total_internal_resistance_ohm: Number(
          (spec.internal_resistance_ohm + spec.r1_polarization_ohm + spec.r2_diffusion_ohm).toFixed(2)
        ),
        passivation_resistance_ohm: Number(currentPassivationR.toFixed(2)),
        consumed_capacity_mah: Number(consumedCapacityMah.toFixed(2)),
        consumed_energy_mwh: Number(consumedEnergyMwh.toFixed(2)),
        soc_pct: Number((soc * 100).toFixed(2)),
        soh_pct: Number((soc * 100).toFixed(2)),
        temperature_c: ambientTempC,
        cutoff_breached: stepBreached,
      });

      if (stepBreached) {
        isCutoffReached = true;
        terminationReason = "CUTOFF_VOLTAGE_REACHED";
        break;
      }
    }
  }

  // Downsample time series if too many points for chart rendering performance
  let filteredSteps = recordedSteps;
  if (recordedSteps.length > maxPoints) {
    const stride = Math.ceil(recordedSteps.length / maxPoints);
    filteredSteps = recordedSteps.filter((_, idx) => idx % stride === 0);
    if (!filteredSteps.includes(recordedSteps[recordedSteps.length - 1])) {
      filteredSteps.push(recordedSteps[recordedSteps.length - 1]);
    }
  }

  const totalTimeS = Math.max(0.001, timeS);
  const totalHours = totalTimeS / 3600.0;
  const totalDays = totalHours / 24.0;
  const totalYears = totalDays / 365.25;

  const avgCurrentMa = totalHours > 0 ? consumedCapacityMah / totalHours : 0.0;
  const avgPowerMw = totalHours > 0 ? consumedEnergyMwh / totalHours : 0.0;

  let rulHours = 0.0;
  let rulDays = 0.0;
  let rulYears = 0.0;

  const finalSoc = Math.max(0, Math.min(1, (qAvailable + qBound) / qTotal));

  if (!isCutoffReached && finalSoc > 0.01) {
    const remCap = qAvailable + qBound;
    if (avgCurrentMa > 0) {
      rulHours = remCap / avgCurrentMa;
      rulDays = rulHours / 24.0;
      rulYears = rulDays / 365.25;
    }
  }

  const efficiency = Math.min(100.0, (consumedCapacityMah / Math.max(1e-6, spec.nominal_capacity_mah)) * 100.0);

  return {
    battery_id: spec.id,
    battery_name: spec.name,
    chemistry: spec.chemistry,
    nominal_capacity_mah: spec.nominal_capacity_mah,
    termination_reason: terminationReason,
    total_simulated_time_s: Number(totalTimeS.toFixed(2)),
    total_simulated_time_hours: Number(totalHours.toFixed(2)),
    total_simulated_time_days: Number(totalDays.toFixed(2)),
    total_simulated_time_years: Number(totalYears.toFixed(3)),
    remaining_useful_life_hours: Number(rulHours.toFixed(2)),
    remaining_useful_life_days: Number(rulDays.toFixed(2)),
    remaining_useful_life_years: Number(rulYears.toFixed(3)),
    total_cycles_completed: cyclesCompleted,
    total_capacity_consumed_mah: Number(consumedCapacityMah.toFixed(2)),
    total_energy_consumed_mwh: Number(consumedEnergyMwh.toFixed(2)),
    capacity_efficiency_pct: Number(efficiency.toFixed(2)),
    min_terminal_voltage_v: Number(minTerminalVoltage.toFixed(4)),
    max_voltage_dip_v: Number(maxVoltageDip.toFixed(4)),
    final_soc_pct: Number((finalSoc * 100).toFixed(2)),
    final_soh_pct: Number((finalSoc * 100).toFixed(2)),
    average_current_ma: Number(avgCurrentMa.toFixed(4)),
    average_power_mw: Number(avgPowerMw.toFixed(4)),
    time_series: filteredSteps,
  };
}

export async function runPythonSimulation(
  spec: BatterySpecification,
  profile: ElectricalLoadProfile,
  ambientTempC: number = 25.0
): Promise<SimulationReport> {
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      battery: spec,
      load: profile,
      temperature_c: ambientTempC,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with status ${response.status}`);
  }

  return await response.json();
}

export async function runPythonCliCommand(
  args: string[],
  stdinData?: any
): Promise<{ stdout: string; stderr: string; exitCode: number; executionTimeMs: number }> {
  const response = await fetch("/api/cli-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args, stdinData }),
  });

  if (!response.ok) {
    throw new Error(`CLI execution failed: HTTP ${response.status}`);
  }

  return await response.json();
}
