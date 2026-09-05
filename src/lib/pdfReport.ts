import { jsPDF } from "jspdf";
import { BatterySpecification, ElectricalLoadProfile, SimulationReport } from "../types";

export function generateSimulationPdf(
  report: SimulationReport,
  battery?: BatterySpecification,
  load?: ElectricalLoadProfile,
  ambientTempC: number = 25
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182

  let y = margin;

  // 1. Decorative top accent bar (Violet / Indigo)
  doc.setFillColor(99, 102, 241); // #6366f1
  doc.rect(0, 0, pageWidth, 4, "F");

  // 2. Header Container
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("BatteryRUL Simulator", margin + 5, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("Electrochemical Primary Battery Longevity & Mission Assessment Report", margin + 5, y + 14);
  doc.text(`Generated on: ${new Date().toLocaleString()} | Ambient Temp: ${ambientTempC}°C`, margin + 5, y + 19);

  // Right side badge
  doc.setFillColor(238, 242, 255); // indigo-50
  doc.setDrawColor(199, 210, 254); // indigo-200
  doc.roundedRect(pageWidth - margin - 50, y + 5, 45, 14, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(67, 56, 202); // indigo-700
  doc.text("REPORT TYPE", pageWidth - margin - 48, y + 10);
  doc.setFontSize(7.5);
  doc.setTextColor(79, 70, 229);
  doc.text("Primary Cell RUL", pageWidth - margin - 48, y + 15);

  y += 28;

  // 3. Section Title: Executive Summary & KPIs
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("1. Executive Longevity & Key Performance Indicators", margin, y);
  y += 4;

  // 4 KPI Summary Grid Cards (2 rows x 3 columns)
  const cardW = (contentWidth - 6) / 3; // ~58.6mm
  const cardH = 17;

  const kpiData = [
    {
      title: "PROJECTED LONGEVITY",
      val: `${report.total_simulated_time_years} Years`,
      sub: `${report.total_simulated_time_days.toLocaleString()} Days (${report.total_simulated_time_hours.toLocaleString()} hrs)`,
      highlight: true,
    },
    {
      title: "DUTY CYCLES COMPLETED",
      val: `${report.total_cycles_completed.toLocaleString()}`,
      sub: `Cycles before cutoff voltage`,
      highlight: false,
    },
    {
      title: "CAPACITY DELIVERED",
      val: `${report.total_capacity_consumed_mah.toFixed(1)} mAh`,
      sub: `${report.capacity_efficiency_pct}% of ${report.nominal_capacity_mah} mAh`,
      highlight: false,
    },
    {
      title: "ENERGY DELIVERED",
      val: `${report.total_energy_consumed_mwh.toFixed(1)} mWh`,
      sub: `Avg Power: ${(report.average_power_mw * 1000).toFixed(1)} µW`,
      highlight: false,
    },
    {
      title: "MIN TERMINAL VOLTAGE",
      val: `${report.min_terminal_voltage_v.toFixed(3)} V`,
      sub: `Max Pulse Dip: ${(report.max_voltage_dip_v * 1000).toFixed(0)} mV`,
      highlight: false,
    },
    {
      title: "AVERAGE DRAIN CURRENT",
      val: report.average_current_ma < 1
        ? `${(report.average_current_ma * 1000).toFixed(1)} µA`
        : `${report.average_current_ma.toFixed(3)} mA`,
      sub: `Termination: ${report.termination_reason}`,
      highlight: false,
    },
  ];

  kpiData.forEach((kpi, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = margin + col * (cardW + 3);
    const cy = y + row * (cardH + 2.5);

    if (kpi.highlight) {
      doc.setFillColor(245, 243, 255); // violet-50
      doc.setDrawColor(196, 181, 253); // violet-300
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
    }
    doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, cx + 3, cy + 4.5);

    doc.setFontSize(10.5);
    doc.setTextColor(kpi.highlight ? 109 : 15, kpi.highlight ? 40 : 23, kpi.highlight ? 217 : 42); // violet-700 or slate-900
    doc.text(kpi.val, cx + 3, cy + 10.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, cx + 3, cy + 14.5);
  });

  y += cardH * 2 + 8;

  // 4. Section Title: Cell & Electrochemical Input Parameters
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("2. Battery Cell Specification & Equivalent Circuit Model (ECM)", margin, y);
  y += 4;

  const halfW = (contentWidth - 4) / 2;

  // Left Column: Physical & Electrochemical Ratings
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, halfW, 46, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("CELL RATINGS & THERMAL SPECIFICATION", margin + 3, y + 5);

  const cellParams = [
    ["Model Name:", battery?.name || report.battery_name],
    ["Chemistry:", battery?.chemistry || report.chemistry],
    ["Nominal Voltage:", `${battery?.nominal_voltage_v ?? 3.65} V`],
    ["Nominal Capacity:", `${battery?.nominal_capacity_mah ?? report.nominal_capacity_mah} mAh`],
    ["Cutoff Threshold:", `${battery?.cutoff_voltage_v ?? 2.0} V`],
    ["Ref Test Current:", `${battery?.reference_discharge_current_ma ?? 2.0} mA`],
    ["Annual Self-Discharge:", `${battery?.self_discharge_annual_pct ?? 1.0} %/year`],
    ["Cold Temp ESR Coeff:", `${battery?.temp_resistance_coeff_pct ?? -1.2} %/°C`],
  ];

  let py = y + 10;
  cellParams.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, margin + 4, py);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(val), margin + halfW - 4, py, { align: "right" });
    py += 4.2;
  });

  // Right Column: Equivalent Circuit Model & Dynamics
  const rx = margin + halfW + 4;
  doc.roundedRect(rx, y, halfW, 46, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("IMPEDANCE & PASSIVATION DYNAMICS", rx + 3, y + 5);

  const ecmParams = [
    ["Ohmic Resistance R₀:", `${battery?.internal_resistance_ohm ?? 2.8} Ω`],
    ["Polarization (R₁ || C₁):", `${battery?.r1_polarization_ohm ?? 1.8} Ω || ${battery?.c1_polarization_f ?? 1.5} F`],
    ["Diffusion (R₂ || C₂):", `${battery?.r2_diffusion_ohm ?? 2.2} Ω || ${battery?.c2_diffusion_f ?? 12.0} F`],
    ["Passivation Layer:", battery?.has_passivation ? "Enabled (LiCl film)" : "Disabled"],
    ["Initial Passivation R:", `${battery?.initial_passivation_resistance_ohm ?? 4.5} Ω (Max ${battery?.max_passivation_resistance_ohm ?? 25} Ω)`],
    ["KiBaM Available Ratio (c):", `${battery?.kibam_c_ratio ?? 0.85}`],
    ["KiBaM Exchange Rate (k):", `${battery?.kibam_k_rate ?? 0.00018} s⁻¹`],
    ["Peukert Exponent (k_p):", `${battery?.peukert_coefficient ?? 1.05}`],
  ];

  py = y + 10;
  ecmParams.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, rx + 4, py);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(String(val), rx + halfW - 4, py, { align: "right" });
    py += 4.2;
  });

  y += 51;

  // 5. Section Title: Electrical Load Profile Specification
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("3. Electrical Load & Duty Cycle Configuration", margin, y);
  y += 4;

  const cycleDuration = load?.segments.reduce((acc, s) => acc + s.duration_s, 0) ?? 3600;
  const cycleCapMah = load?.segments.reduce((acc, s) => {
    let cur = s.value;
    if (s.load_type === "CONSTANT_POWER") cur = s.value / (battery?.nominal_voltage_v ?? 3.65);
    return acc + (cur * s.duration_s) / 3600.0;
  }, 0) ?? 0.06;

  // Load Profile Header Info Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Profile: ${load?.name || "Custom Profile"} (${load?.profile_id || "profile"})`, margin + 4, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Cycle Period: ${cycleDuration >= 3600 ? (cycleDuration / 3600).toFixed(2) + " hrs" : cycleDuration + " s"} | Mode: ${load?.is_periodic ? "Periodic Loop" : "Single"} | Active Capacity/Cycle: ${cycleCapMah.toFixed(4)} mAh`,
    margin + 4,
    y + 9
  );

  y += 14;

  // Load Segments Table
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, y, contentWidth, 5.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("#", margin + 3, y + 4);
  doc.text("STAGE NAME", margin + 12, y + 4);
  doc.text("LOAD TYPE", margin + 70, y + 4);
  doc.text("VALUE", margin + 115, y + 4);
  doc.text("DURATION", margin + 145, y + 4);
  doc.text("CAPACITY/STAGE", margin + 175, y + 4, { align: "right" });

  y += 6;

  const segments = load?.segments || [];
  segments.forEach((seg, sIdx) => {
    doc.setFillColor(sIdx % 2 === 0 ? 255 : 248, sIdx % 2 === 0 ? 255 : 250, sIdx % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, 5, "F");

    let unit = "mA";
    if (seg.load_type === "CONSTANT_POWER") unit = "mW";
    else if (seg.load_type === "CONSTANT_RESISTANCE") unit = "Ω";

    let curMa = seg.value;
    if (seg.load_type === "CONSTANT_POWER") curMa = seg.value / (battery?.nominal_voltage_v ?? 3.65);
    else if (seg.load_type === "CONSTANT_RESISTANCE") curMa = ((battery?.nominal_voltage_v ?? 3.65) / seg.value) * 1000;
    const stageCapMah = (curMa * seg.duration_s) / 3600.0;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(String(sIdx + 1), margin + 3, y + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(seg.name, margin + 12, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(seg.load_type.replace("CONSTANT_", ""), margin + 70, y + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${seg.value} ${unit}`, margin + 115, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.text(`${seg.duration_s} s`, margin + 145, y + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text(`${stageCapMah < 0.001 ? (stageCapMah * 1000).toFixed(2) + " µAh" : stageCapMah.toFixed(4) + " mAh"}`, margin + 175, y + 3.5, { align: "right" });

    y += 5.2;
  });

  y += 4;

  // 6. Section Title: Electrochemical State Trajectory & Key Telemetry Samples
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text("4. Electrochemical Telemetry & Depletion Milestones", margin, y);
  y += 4;

  // Trajectory Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 5.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("TIME (DAYS)", margin + 3, y + 4);
  doc.text("CYCLE / STAGE", margin + 30, y + 4);
  doc.text("CURRENT", margin + 75, y + 4);
  doc.text("V_TERM", margin + 100, y + 4);
  doc.text("OCV", margin + 125, y + 4);
  doc.text("PASSIVATION", margin + 145, y + 4);
  doc.text("SOC (%)", margin + 178, y + 4, { align: "right" });

  y += 6;

  // Pick 5 representative milestone points (Start, 25%, 50%, 75%, End)
  const steps = report.time_series || [];
  const samplePoints: typeof steps = [];
  if (steps.length > 0) {
    samplePoints.push(steps[0]);
    if (steps.length > 4) {
      samplePoints.push(steps[Math.floor(steps.length * 0.25)]);
      samplePoints.push(steps[Math.floor(steps.length * 0.50)]);
      samplePoints.push(steps[Math.floor(steps.length * 0.75)]);
    }
    samplePoints.push(steps[steps.length - 1]);
  }

  samplePoints.forEach((pt, pIdx) => {
    doc.setFillColor(pIdx % 2 === 0 ? 255 : 248, pIdx % 2 === 0 ? 255 : 250, pIdx % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, 5, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${(pt.time_s / 86400).toFixed(1)} d`, margin + 3, y + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(pt.segment_name, margin + 30, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.text(`${pt.current_ma.toFixed(2)} mA`, margin + 75, y + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(pt.terminal_voltage_v <= (battery?.cutoff_voltage_v ?? 2.0) ? 220 : 79, pt.terminal_voltage_v <= (battery?.cutoff_voltage_v ?? 2.0) ? 38 : 70, pt.terminal_voltage_v <= (battery?.cutoff_voltage_v ?? 2.0) ? 38 : 229);
    doc.text(`${pt.terminal_voltage_v.toFixed(4)} V`, margin + 100, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${pt.ocv_v.toFixed(4)} V`, margin + 125, y + 3.5);
    doc.text(`${pt.passivation_resistance_ohm.toFixed(2)} Ω`, margin + 145, y + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(pt.soc_pct < 10 ? 220 : 16, pt.soc_pct < 10 ? 38 : 185, pt.soc_pct < 10 ? 38 : 129);
    doc.text(`${pt.soc_pct.toFixed(1)}%`, margin + 178, y + 3.5, { align: "right" });

    y += 5.2;
  });

  // 7. Footer
  const footerY = pageHeight - 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("BatteryRUL Simulator - Autonomous Electrochemical Longevity Engine", margin, footerY + 2);
  doc.text("Page 1 of 1 | Verified Technical Report", pageWidth - margin, footerY + 2, { align: "right" });

  // Save the PDF
  const filename = `BatteryRUL_Report_${report.battery_id}_${Math.round(report.total_simulated_time_years * 10) / 10}y.pdf`;
  doc.save(filename);
}
