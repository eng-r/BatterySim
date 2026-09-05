"""
Electrochemical state solver and simulation engine for primary batteries.
Simulates SoC, SoH, terminal voltage, energy consumption, and Remaining Useful Life (RUL).
"""

import math
from typing import List, Optional, Tuple, Dict, Any, Generator
from .models import (
    BatterySpecification,
    ElectricalLoadProfile,
    LoadType,
    TerminationReason,
    SimulationStepResult,
    SimulationReport,
)
from .cell import AbstractBatteryCell, create_cell_from_spec
from .loads import AbstractLoadProfile, DutyCycleProfile, convert_load_to_current_ma


class BatterySimulatorEngine:
    """
    High-fidelity state-space simulation engine implementing:
    1. Dual-Polarization Equivalent Circuit Model (ECM)
    2. Kinetic Battery Model (KiBaM) two-tank diffusion
    3. Passivation film breakdown & reformation
    4. Temperature-dependent Arrhenius kinetics
    5. High-resolution pulse transient and cycle-accelerated RUL extrapolation
    """

    def __init__(
        self,
        spec: BatterySpecification,
        ambient_temperature_c: Optional[float] = None
    ):
        self.spec = spec
        self.cell: AbstractBatteryCell = create_cell_from_spec(spec)
        self.ambient_temp_c = ambient_temperature_c if ambient_temperature_c is not None else spec.reference_temperature_c

        # State variables
        self.time_s: float = 0.0
        self.v_rc1: float = 0.0       # Polarization voltage across RC1 (V)
        self.v_rc2: float = 0.0       # Diffusion voltage across RC2 (V)
        
        # KiBaM charges in mAh
        c_ratio = max(0.1, min(0.95, spec.kibam_c_ratio))
        self.q_total_mah = spec.nominal_capacity_mah
        self.q1_available_mah = self.q_total_mah * c_ratio
        self.q2_bound_mah = self.q_total_mah * (1.0 - c_ratio)
        self.c_ratio = c_ratio
        self.k_rate = spec.kibam_k_rate

        # Historical tracking
        self.consumed_capacity_mah: float = 0.0
        self.consumed_energy_mwh: float = 0.0
        self.min_terminal_voltage_v: float = spec.nominal_voltage_v
        self.max_voltage_dip_v: float = 0.0
        self.is_cutoff_reached: bool = False
        self.termination_reason: TerminationReason = TerminationReason.PROFILE_COMPLETED

        # Peak tracking
        self.last_terminal_voltage_v: float = spec.nominal_voltage_v

    @property
    def current_soc(self) -> float:
        """Returns instantaneous SoC as a fraction (0.0 to 1.0)."""
        remaining = self.q1_available_mah + self.q2_bound_mah
        return max(0.0, min(1.0, remaining / max(1e-6, self.q_total_mah)))

    @property
    def current_soh(self) -> float:
        """
        Primary battery SoH is modeled as remaining usable capacity health
        penalized by irreversible passivation growth and internal impedance accumulation.
        """
        soc = self.current_soc
        # Capacity fade component
        capacity_health = soc
        # Impedance penalty (as cell approaches EOL, internal resistance increases)
        soh_pct = capacity_health * 100.0
        return max(0.0, min(100.0, soh_pct))

    def step(
        self,
        dt_s: float,
        load_type: LoadType,
        load_value: float,
        segment_name: str = "Step",
        temp_c: Optional[float] = None,
    ) -> SimulationStepResult:
        """
        Executes one discrete physics step of duration dt_s seconds.
        """
        if dt_s <= 0.0:
            dt_s = 0.001

        temperature = temp_c if temp_c is not None else self.ambient_temp_c

        # 1. Self-discharge current (background loss)
        i_self_discharge_ma = self.cell.calculate_self_discharge_current_ma(temperature)

        # 2. Determine instantaneous load current in mA
        # Estimate using prior terminal voltage
        load_current_ma = convert_load_to_current_ma(load_type, load_value, self.last_terminal_voltage_v)
        total_drawn_current_ma = load_current_ma + i_self_discharge_ma

        # 3. KiBaM rate-capacity effective current
        effective_current_ma = self.cell.calculate_peukert_effective_current(total_drawn_current_ma)

        # 4. Update Passivation Layer
        passivation_r = self.cell.update_passivation(total_drawn_current_ma, dt_s)

        # 5. Dual-polarization RC dynamics
        # dV_rc1/dt = (I_A / C1) - (V_rc1 / (R1 * C1))
        # Note: current is in mA, so convert to Amperes (divide by 1000)
        i_amps = total_drawn_current_ma / 1000.0
        
        # Temp resistance scaling
        temp_factor = self.cell.get_temperature_resistance_factor(temperature)
        r0 = self.spec.internal_resistance_ohm * temp_factor
        r1 = self.spec.r1_polarization_ohm * temp_factor
        c1 = max(0.001, self.spec.c1_polarization_f)
        r2 = self.spec.r2_diffusion_ohm * temp_factor
        c2 = max(0.01, self.spec.c2_diffusion_f)

        # Discrete exponential decay integration for RC circuits
        tau1 = r1 * c1
        alpha1 = math.exp(-dt_s / tau1) if tau1 > 0 else 0.0
        self.v_rc1 = self.v_rc1 * alpha1 + (r1 * i_amps) * (1.0 - alpha1)

        tau2 = r2 * c2
        alpha2 = math.exp(-dt_s / tau2) if tau2 > 0 else 0.0
        self.v_rc2 = self.v_rc2 * alpha2 + (r2 * i_amps) * (1.0 - alpha2)

        # 6. KiBaM Two-Well Charge Diffusion (Euler step)
        # Head heights
        h1 = self.q1_available_mah / self.c_ratio
        h2 = self.q2_bound_mah / (1.0 - self.c_ratio)
        # Flow from bound well to available well
        dq_exchange = self.k_rate * (h2 - h1) * dt_s  # in mAh

        # Drain from available well
        dq_drawn = (effective_current_ma * dt_s) / 3600.0  # mA * s -> mAh

        # Update charge wells
        self.q1_available_mah = max(0.0, self.q1_available_mah - dq_drawn + dq_exchange)
        self.q2_bound_mah = max(0.0, self.q2_bound_mah - dq_exchange)

        # 7. Open Circuit Voltage (OCV)
        soc_val = self.current_soc
        ocv_v = self.cell.calculate_ocv(soc_val)

        # 8. Terminal Voltage Calculation
        # V_term = V_ocv - I * (R0 + R_pass) - V_rc1 - V_rc2
        total_r_series = r0 + passivation_r
        ohmic_drop_v = i_amps * total_r_series
        terminal_voltage_v = ocv_v - ohmic_drop_v - self.v_rc1 - self.v_rc2

        # 9. Energy and Capacity tracking
        energy_step_mwh = (terminal_voltage_v * load_current_ma * dt_s) / 3600.0
        self.consumed_capacity_mah += (load_current_ma * dt_s) / 3600.0
        self.consumed_energy_mwh += max(0.0, energy_step_mwh)
        self.time_s += dt_s

        # Tracking minimums and dips
        voltage_dip = max(0.0, ocv_v - terminal_voltage_v)
        if voltage_dip > self.max_voltage_dip_v:
            self.max_voltage_dip_v = voltage_dip

        if terminal_voltage_v < self.min_terminal_voltage_v:
            self.min_terminal_voltage_v = terminal_voltage_v

        self.last_terminal_voltage_v = terminal_voltage_v

        # 10. Cutoff Check
        if terminal_voltage_v <= self.spec.cutoff_voltage_v or self.q1_available_mah <= 0.001:
            self.is_cutoff_reached = True
            self.termination_reason = TerminationReason.CUTOFF_VOLTAGE_REACHED

        return SimulationStepResult(
            time_s=round(self.time_s, 4),
            dt_s=dt_s,
            segment_name=segment_name,
            current_ma=round(load_current_ma, 3),
            terminal_voltage_v=round(max(0.0, terminal_voltage_v), 4),
            ocv_v=round(ocv_v, 4),
            total_internal_resistance_ohm=round(total_r_series + r1 + r2, 2),
            passivation_resistance_ohm=round(passivation_r, 2),
            consumed_capacity_mah=round(self.consumed_capacity_mah, 3),
            consumed_energy_mwh=round(self.consumed_energy_mwh, 3),
            soc_pct=round(self.current_soc * 100.0, 2),
            soh_pct=round(self.current_soh, 2),
            temperature_c=round(temperature, 1),
            cutoff_breached=self.is_cutoff_reached,
        )

    def run_simulation(
        self,
        profile: ElectricalLoadProfile,
        max_recorded_points: int = 500
    ) -> SimulationReport:
        """
        Executes a complete simulation of the load profile until:
        - Battery terminal voltage drops to cutoff_voltage_v
        - OR specified repeat count / max simulation time is reached
        Uses a hybrid precision + cycle extrapolation engine for fast execution.
        """
        load_handler = DutyCycleProfile(profile)
        cycle_duration_s = load_handler.get_cycle_duration_s()
        
        recorded_steps: List[Dict[str, Any]] = []
        cycles_completed = 0

        # Phase A: High-resolution cycle sampling (first 3 cycles to capture transients)
        initial_cycles_to_sample = min(5, 1000 if profile.repeat_count > 0 and profile.repeat_count <= 5 else 3)
        
        for _ in range(initial_cycles_to_sample):
            if self.is_cutoff_reached:
                break
            for seg in profile.segments:
                if self.is_cutoff_reached:
                    break
                # Subdivide segment if duration is long to capture RC curves
                sub_steps = max(1, min(10, int(math.ceil(seg.duration_s / 0.1)))) if seg.duration_s < 2.0 else max(1, min(20, int(math.ceil(seg.duration_s / 5.0))))
                dt_sub = seg.duration_s / sub_steps
                for step_idx in range(sub_steps):
                    step_res = self.step(
                        dt_s=dt_sub,
                        load_type=seg.load_type,
                        load_value=seg.value,
                        segment_name=seg.name,
                        temp_c=seg.temperature_c,
                    )
                    recorded_steps.append(step_res.to_dict())
                    if self.is_cutoff_reached:
                        break
            cycles_completed += 1

        # Check if already depleted or profile finished
        if self.is_cutoff_reached:
            return self._build_report(cycles_completed, recorded_steps)

        if profile.repeat_count > 0 and cycles_completed >= profile.repeat_count:
            self.termination_reason = TerminationReason.PROFILE_COMPLETED
            return self._build_report(cycles_completed, recorded_steps)

        # Phase B: Cycle-aggregated extrapolation with state updates
        # Compute baseline energy and capacity per cycle under nominal conditions
        cycle_cap_mah = sum((convert_load_to_current_ma(s.load_type, s.value, self.spec.nominal_voltage_v) * s.duration_s) / 3600.0 for s in profile.segments)
        # Add self-discharge for cycle
        cycle_sd_mah = (self.cell.calculate_self_discharge_current_ma(self.ambient_temp_c) * cycle_duration_s) / 3600.0
        total_cycle_mah = max(1e-6, cycle_cap_mah + cycle_sd_mah)

        # Find peak current across segments to monitor peak pulse voltage sag
        max_pulse_segment = max(profile.segments, key=lambda s: convert_load_to_current_ma(s.load_type, s.value, self.spec.nominal_voltage_v))
        peak_pulse_current_ma = convert_load_to_current_ma(max_pulse_segment.load_type, max_pulse_segment.value, self.spec.nominal_voltage_v)

        # Estimate remaining cycles before depletion
        remaining_cap = self.q1_available_mah + self.q2_bound_mah
        est_remaining_cycles = max(1, int(remaining_cap / total_cycle_mah))

        target_cycles = profile.repeat_count if profile.repeat_count > 0 else est_remaining_cycles * 2
        macro_steps = min(300, max(50, est_remaining_cycles))
        cycles_per_macro = max(1, int(math.ceil((target_cycles - cycles_completed) / macro_steps)))

        while cycles_completed < target_cycles and not self.is_cutoff_reached:
            # Advance macro cycles
            cycles_to_advance = min(cycles_per_macro, target_cycles - cycles_completed)
            dt_advance_s = cycles_to_advance * cycle_duration_s

            if (self.time_s + dt_advance_s) > profile.max_simulation_time_s:
                self.termination_reason = TerminationReason.MAX_SIM_TIME_REACHED
                break

            # Drain charge
            cap_drain_mah = cycles_to_advance * total_cycle_mah
            self.consumed_capacity_mah += cap_drain_mah
            self.q1_available_mah = max(0.0, self.q1_available_mah - cap_drain_mah * self.c_ratio)
            self.q2_bound_mah = max(0.0, self.q2_bound_mah - cap_drain_mah * (1.0 - self.c_ratio))
            self.time_s += dt_advance_s
            cycles_completed += cycles_to_advance

            # Calculate mid-point voltage and peak sag
            soc = self.current_soc
            ocv = self.cell.calculate_ocv(soc)
            temp_factor = self.cell.get_temperature_resistance_factor(self.ambient_temp_c)
            r_internal = (self.spec.internal_resistance_ohm + self.cell.current_passivation_r + self.spec.r1_polarization_ohm + self.spec.r2_diffusion_ohm) * temp_factor
            
            # Dynamic pulse impedance accounting for double-layer capacitor filtering
            # High-frequency pulse only experiences ohmic R0, partially charged RC1, and minimal RC2
            tau1 = max(0.01, self.spec.r1_polarization_ohm * max(0.001, self.spec.c1_polarization_f))
            tau2 = max(0.01, self.spec.r2_diffusion_ohm * max(0.01, self.spec.c2_diffusion_f))
            pulse_dur = max_pulse_segment.duration_s
            factor_rc1 = 1.0 - math.exp(-min(10.0, pulse_dur / tau1))
            factor_rc2 = 1.0 - math.exp(-min(10.0, pulse_dur / tau2))
            
            # Passivation under sustained pulses in active cycle is largely broken down
            r_pass_transient = self.cell.current_passivation_r * math.exp(-(peak_pulse_current_ma / 10.0) * 0.5)
            r_effective_pulse = (self.spec.internal_resistance_ohm + r_pass_transient + (self.spec.r1_polarization_ohm * factor_rc1) + (self.spec.r2_diffusion_ohm * factor_rc2)) * temp_factor

            # Terminal voltage under peak pulse
            peak_v_drop = (peak_pulse_current_ma / 1000.0) * r_effective_pulse
            v_term_at_pulse = ocv - peak_v_drop
            avg_v = (ocv + v_term_at_pulse) / 2.0
            self.consumed_energy_mwh += (cap_drain_mah * avg_v)

            if v_term_at_pulse < self.min_terminal_voltage_v:
                self.min_terminal_voltage_v = v_term_at_pulse

            # Record sample point
            macro_step_res = SimulationStepResult(
                time_s=round(self.time_s, 2),
                dt_s=dt_advance_s,
                segment_name=f"Cycle {cycles_completed}",
                current_ma=round(peak_pulse_current_ma, 2),
                terminal_voltage_v=round(max(0.0, v_term_at_pulse), 4),
                ocv_v=round(ocv, 4),
                total_internal_resistance_ohm=round(r_internal, 2),
                passivation_resistance_ohm=round(self.cell.current_passivation_r, 2),
                consumed_capacity_mah=round(self.consumed_capacity_mah, 2),
                consumed_energy_mwh=round(self.consumed_energy_mwh, 2),
                soc_pct=round(soc * 100.0, 2),
                soh_pct=round(self.current_soh, 2),
                temperature_c=round(self.ambient_temp_c, 1),
                cutoff_breached=(v_term_at_pulse <= self.spec.cutoff_voltage_v or soc <= 0.001)
            )
            recorded_steps.append(macro_step_res.to_dict())

            if v_term_at_pulse <= self.spec.cutoff_voltage_v or soc <= 0.001:
                self.is_cutoff_reached = True
                self.termination_reason = TerminationReason.CUTOFF_VOLTAGE_REACHED
                break

        # Downsample recorded steps if too large
        if len(recorded_steps) > max_recorded_points:
            stride = max(1, len(recorded_steps) // max_recorded_points)
            downsampled = recorded_steps[::stride]
            if recorded_steps[-1] not in downsampled:
                downsampled.append(recorded_steps[-1])
            recorded_steps = downsampled

        return self._build_report(cycles_completed, recorded_steps)

    def _build_report(
        self,
        cycles_completed: int,
        time_series: List[Dict[str, Any]]
    ) -> SimulationReport:
        total_time_s = max(0.001, self.time_s)
        total_hours = total_time_s / 3600.0
        total_days = total_hours / 24.0
        total_years = total_days / 365.25

        avg_current_ma = (self.consumed_capacity_mah / total_hours) if total_hours > 0 else 0.0
        avg_power_mw = (self.consumed_energy_mwh / total_hours) if total_hours > 0 else 0.0

        # Remaining useful life (RUL)
        # If simulation terminated at cutoff, RUL is 0 (it lived total_hours)
        if self.is_cutoff_reached or self.current_soc <= 0.005:
            rul_hours = 0.0
            rul_days = 0.0
            rul_years = 0.0
        else:
            # Extrapolate remaining from remaining available capacity
            remaining_cap = (self.q1_available_mah + self.q2_bound_mah)
            if avg_current_ma > 0:
                rul_hours = remaining_cap / avg_current_ma
                rul_days = rul_hours / 24.0
                rul_years = rul_days / 365.25
            else:
                rul_hours = 87600.0
                rul_days = 3650.0
                rul_years = 10.0

        efficiency = min(100.0, (self.consumed_capacity_mah / max(1e-6, self.spec.nominal_capacity_mah)) * 100.0)

        return SimulationReport(
            battery_id=self.spec.id,
            battery_name=self.spec.name,
            chemistry=self.spec.chemistry.value if hasattr(self.spec.chemistry, "value") else str(self.spec.chemistry),
            nominal_capacity_mah=self.spec.nominal_capacity_mah,
            termination_reason=self.termination_reason.value if hasattr(self.termination_reason, "value") else str(self.termination_reason),
            total_simulated_time_s=round(total_time_s, 2),
            total_simulated_time_hours=round(total_hours, 2),
            total_simulated_time_days=round(total_days, 2),
            total_simulated_time_years=round(total_years, 3),
            remaining_useful_life_hours=round(rul_hours, 2),
            remaining_useful_life_days=round(rul_days, 2),
            remaining_useful_life_years=round(rul_years, 3),
            total_cycles_completed=cycles_completed,
            total_capacity_consumed_mah=round(self.consumed_capacity_mah, 2),
            total_energy_consumed_mwh=round(self.consumed_energy_mwh, 2),
            capacity_efficiency_pct=round(efficiency, 2),
            min_terminal_voltage_v=round(self.min_terminal_voltage_v, 4),
            max_voltage_dip_v=round(self.max_voltage_dip_v, 4),
            final_soc_pct=round(self.current_soc * 100.0, 2),
            final_soh_pct=round(self.current_soh, 2),
            average_current_ma=round(avg_current_ma, 4),
            average_power_mw=round(avg_power_mw, 4),
            time_series=time_series,
        )
