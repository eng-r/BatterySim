"""
Adaptor layer providing plug-and-play integration for external Python applications.

Example usage in another .py app:
    from battery_engine.adapters import BatterySimulatorAdapter

    # Initialize adapter with battery config (dict or json file)
    battery = BatterySimulatorAdapter.from_json("configs/lisocl2_saft_ls14500.json")

    # Step-by-step interactive load injection
    result = battery.step(dt_seconds=0.25, current_ma=120.0)
    print(f"Voltage: {result.terminal_voltage_v} V, SoC: {result.soc_pct}%")

    # Or simulate an entire profile to calculate RUL
    report = battery.simulate_profile("configs/nbiot_pulse_profile.json")
    print(f"Remaining Useful Life: {report.total_simulated_time_years} Years")
"""

import json
import csv
from typing import Union, Dict, Any, Optional, Generator, List
from .models import (
    BatterySpecification,
    ElectricalLoadProfile,
    LoadSegment,
    LoadType,
    SimulationStepResult,
    SimulationReport,
)
from .simulator import BatterySimulatorEngine


class BatterySimulatorAdapter:
    """
    Standard integration adapter for external Python applications.
    Exposes unified methods for:
    - Dynamic cycle-by-cycle or time-step simulation
    - Batch load profile evaluation
    - RUL and voltage sag prediction
    - File export (JSON & CSV)
    """

    def __init__(
        self,
        battery_spec: Union[BatterySpecification, Dict[str, Any], str],
        ambient_temperature_c: float = 25.0
    ):
        if isinstance(battery_spec, BatterySpecification):
            self.spec = battery_spec
        elif isinstance(battery_spec, dict):
            self.spec = BatterySpecification.from_dict(battery_spec)
        elif isinstance(battery_spec, str):
            # Try parsing as JSON string or file path
            try:
                data = json.loads(battery_spec)
                self.spec = BatterySpecification.from_dict(data)
            except (json.JSONDecodeError, ValueError):
                with open(battery_spec, "r", encoding="utf-8") as f:
                    self.spec = BatterySpecification.from_dict(json.load(f))
        else:
            raise ValueError(f"Unsupported battery_spec type: {type(battery_spec)}")

        self.ambient_temp_c = ambient_temperature_c
        self.engine = BatterySimulatorEngine(self.spec, self.ambient_temp_c)
        self.last_result: Optional[SimulationStepResult] = None
        self.history: List[SimulationStepResult] = []

    @classmethod
    def from_json(cls, filepath_or_str: str, ambient_temperature_c: float = 25.0) -> "BatterySimulatorAdapter":
        """Convenience factory method to instantiate from a JSON file path or string."""
        return cls(filepath_or_str, ambient_temperature_c)

    @classmethod
    def from_preset(cls, preset_name: str, ambient_temperature_c: float = 25.0) -> "BatterySimulatorAdapter":
        """Factory method to load standard cell presets."""
        from .presets import get_battery_preset
        spec = get_battery_preset(preset_name)
        return cls(spec, ambient_temperature_c)

    def reset(self):
        """Resets the simulator engine to fresh initial battery state."""
        self.engine = BatterySimulatorEngine(self.spec, self.ambient_temp_c)
        self.last_result = None
        self.history.clear()

    def set_temperature(self, temp_c: float):
        """Dynamically update ambient temperature."""
        self.ambient_temp_c = temp_c
        self.engine.ambient_temp_c = temp_c

    def step(
        self,
        dt_seconds: float,
        current_ma: Optional[float] = None,
        power_mw: Optional[float] = None,
        resistance_ohm: Optional[float] = None,
        temperature_c: Optional[float] = None,
        segment_name: str = "ExternalStep"
    ) -> SimulationStepResult:
        """
        Injects an electrical load for a time duration dt_seconds.
        Specify one of: current_ma, power_mw, or resistance_ohm.
        """
        if current_ma is not None:
            l_type = LoadType.CONSTANT_CURRENT
            val = current_ma
        elif power_mw is not None:
            l_type = LoadType.CONSTANT_POWER
            val = power_mw
        elif resistance_ohm is not None:
            l_type = LoadType.CONSTANT_RESISTANCE
            val = resistance_ohm
        else:
            # Default zero/idle load
            l_type = LoadType.CONSTANT_CURRENT
            val = 0.0

        res = self.engine.step(
            dt_s=dt_seconds,
            load_type=l_type,
            load_value=val,
            segment_name=segment_name,
            temp_c=temperature_c
        )
        self.last_result = res
        self.history.append(res)
        return res

    def simulate_profile(
        self,
        load_profile: Union[ElectricalLoadProfile, Dict[str, Any], str],
        max_recorded_points: int = 500
    ) -> SimulationReport:
        """
        Runs an entire electrical load profile to completion or battery cutoff.
        Returns a comprehensive SimulationReport with RUL, consumed energy, and telemetry.
        """
        if isinstance(load_profile, ElectricalLoadProfile):
            profile = load_profile
        elif isinstance(load_profile, dict):
            profile = ElectricalLoadProfile.from_dict(load_profile)
        elif isinstance(load_profile, str):
            try:
                data = json.loads(load_profile)
                profile = ElectricalLoadProfile.from_dict(data)
            except (json.JSONDecodeError, ValueError):
                with open(load_profile, "r", encoding="utf-8") as f:
                    profile = ElectricalLoadProfile.from_dict(json.load(f))
        else:
            raise ValueError(f"Unsupported load_profile type: {type(load_profile)}")

        report = self.engine.run_simulation(profile, max_recorded_points=max_recorded_points)
        return report

    def stream_profile(
        self,
        load_profile: Union[ElectricalLoadProfile, Dict[str, Any], str],
        repeat_cycles: int = 1
    ) -> Generator[SimulationStepResult, None, None]:
        """
        Generator streaming real-time simulation step results for each segment in the profile.
        Useful for continuous plotting and external control loops.
        """
        if isinstance(load_profile, ElectricalLoadProfile):
            profile = load_profile
        elif isinstance(load_profile, dict):
            profile = ElectricalLoadProfile.from_dict(load_profile)
        elif isinstance(load_profile, str):
            with open(load_profile, "r", encoding="utf-8") as f:
                profile = ElectricalLoadProfile.from_dict(json.load(f))
        else:
            profile = load_profile

        for _ in range(repeat_cycles):
            if self.engine.is_cutoff_reached:
                break
            for seg in profile.segments:
                if self.engine.is_cutoff_reached:
                    break
                step_res = self.step(
                    dt_seconds=seg.duration_s,
                    current_ma=seg.value if seg.load_type == LoadType.CONSTANT_CURRENT else None,
                    power_mw=seg.value if seg.load_type == LoadType.CONSTANT_POWER else None,
                    resistance_ohm=seg.value if seg.load_type == LoadType.CONSTANT_RESISTANCE else None,
                    temperature_c=seg.temperature_c,
                    segment_name=seg.name,
                )
                yield step_res

    def get_state(self) -> Dict[str, Any]:
        """Returns the current state dictionary of the battery."""
        soc = self.engine.current_soc
        soh = self.engine.current_soh
        ocv = self.engine.cell.calculate_ocv(soc)
        return {
            "battery_id": self.spec.id,
            "chemistry": self.spec.chemistry.value if hasattr(self.spec.chemistry, "value") else str(self.spec.chemistry),
            "time_s": self.engine.time_s,
            "soc_pct": round(soc * 100.0, 2),
            "soh_pct": round(soh, 2),
            "ocv_v": round(ocv, 4),
            "last_terminal_voltage_v": round(self.engine.last_terminal_voltage_v, 4),
            "cutoff_voltage_v": self.spec.cutoff_voltage_v,
            "is_cutoff_reached": self.engine.is_cutoff_reached,
            "passivation_resistance_ohm": round(self.engine.cell.current_passivation_r, 2),
            "consumed_capacity_mah": round(self.engine.consumed_capacity_mah, 2),
            "consumed_energy_mwh": round(self.engine.consumed_energy_mwh, 2),
            "temperature_c": self.ambient_temp_c,
        }

    def export_results_json(self, filepath: str, report: Optional[SimulationReport] = None):
        """Exports report or historical steps to a JSON file."""
        with open(filepath, "w", encoding="utf-8") as f:
            if report is not None:
                json.dump(report.to_dict(include_timeseries=True), f, indent=2)
            else:
                steps_data = [s.to_dict() for s in self.history]
                json.dump({"history": steps_data, "state": self.get_state()}, f, indent=2)

    def export_results_csv(self, filepath: str, report: Optional[SimulationReport] = None):
        """Exports time series to a standard CSV file."""
        steps = report.time_series if (report and report.time_series) else [s.to_dict() for s in self.history]
        if not steps:
            return

        fieldnames = list(steps[0].keys())
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in steps:
                writer.writerow(row)
