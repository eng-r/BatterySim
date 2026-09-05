"""
CLI executable for BatteryRUL primary battery simulator.

Usage examples:
    # 1. Run using built-in industry presets
    python3 -m battery_engine.cli --battery-preset lisocl2_saft_ls14500 --load-preset nbiot_asset_tracker --summary

    # 2. Run with custom JSON configuration files
    python3 -m battery_engine.cli --battery battery_config.json --load load_profile.json --output results.json

    # 3. Quick CLI evaluation without creating files
    python3 -m battery_engine.cli --quick-eval --current-ma 25.0 --voltage 3.65 --capacity-mah 2600 --cutoff 2.0 --summary
"""

import sys
import os
import argparse
import json
from typing import Optional, Dict, Any

from .models import (
    BatterySpecification,
    ElectricalLoadProfile,
    LoadSegment,
    LoadType,
    BatteryChemistry,
)
from .simulator import BatterySimulatorEngine
from .presets import BATTERY_PRESETS, LOAD_PRESETS, get_battery_preset, get_load_preset


def print_ascii_summary_report(report: Any):
    """Prints a beautiful, publication-grade ASCII engineering report to stdout."""
    border = "=" * 76
    sub_border = "-" * 76
    
    print(border)
    print("               BATTERY RUL & ELECTROCHEMICAL SIMULATION REPORT             ")
    print(border)
    print(f" Battery ID:            {report.battery_id:<25} Name: {report.battery_name}")
    print(f" Chemistry:             {report.chemistry:<25} Nominal Cap: {report.nominal_capacity_mah:.1f} mAh")
    print(f" Termination Reason:    {report.termination_reason}")
    print(sub_border)
    print(" [1] ESTIMATED REMAINING USEFUL LIFE (RUL) & LONGEVITY")
    print(f"  • Total Operating Life:    {report.total_simulated_time_years:.3f} Years ({report.total_simulated_time_days:.1f} Days / {report.total_simulated_time_hours:.1f} Hours)")
    print(f"  • Duty Cycles Completed:   {report.total_cycles_completed:,} cycles")
    print(f"  • Remaining Useful Life:   {report.remaining_useful_life_years:.3f} Years ({report.remaining_useful_life_days:.1f} Days)")
    print(sub_border)
    print(" [2] CONSUMED ENERGY & CAPACITY METRICS")
    print(f"  • Total Capacity Consumed: {report.total_capacity_consumed_mah:.2f} mAh ({report.capacity_efficiency_pct:.1f}% nominal utilization)")
    print(f"  • Total Energy Delivered:  {report.total_energy_consumed_mwh:.2f} mWh")
    print(f"  • Average Continuous Drain:{report.average_current_ma * 1000.0:.2f} µA ({report.average_current_ma:.4f} mA)")
    print(f"  • Average Power Draw:      {report.average_power_mw:.4f} mW")
    print(sub_border)
    print(" [3] VOLTAGE DYNAMICS & TRANSIENT SAG")
    print(f"  • Minimum Terminal Voltage:{report.min_terminal_voltage_v:.4f} V")
    print(f"  • Maximum Voltage Sag/Dip: {report.max_voltage_dip_v:.4f} V")
    print(f"  • Final Battery SoC:       {report.final_soc_pct:.1f}%")
    print(f"  • Final Battery SoH:       {report.final_soh_pct:.1f}%")
    print(border)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="battery_engine.cli",
        description="BatteryRUL Simulator - Primary Battery Electrochemical Modeling & RUL Estimator"
    )

    # Battery specification options
    b_group = parser.add_argument_group("Battery Parameters")
    b_group.add_argument("--battery", type=str, help="Path to battery specification JSON file or raw JSON string")
    b_group.add_argument("--battery-preset", choices=list(BATTERY_PRESETS.keys()), help="Select a built-in battery model")

    # Load profile options
    l_group = parser.add_argument_group("Load Profile Parameters")
    l_group.add_argument("--load", type=str, help="Path to electrical load profile JSON file or raw JSON string")
    l_group.add_argument("--load-preset", choices=list(LOAD_PRESETS.keys()), help="Select a built-in IoT load profile")

    # Environmental & Execution options
    e_group = parser.add_argument_group("Environment & Control")
    e_group.add_argument("--temp", type=float, default=25.0, help="Ambient temperature in degrees Celsius (default: 25.0)")
    e_group.add_argument("--stdin", action="store_true", help="Read combined JSON payload from standard input")

    # Quick eval convenience
    q_group = parser.add_argument_group("Quick Evaluation Mode")
    q_group.add_argument("--quick-eval", action="store_true", help="Run quick single-load test using CLI flags")
    q_group.add_argument("--current-ma", type=float, default=10.0, help="Discharge current in mA (for quick-eval)")
    q_group.add_argument("--voltage", type=float, default=3.65, help="Nominal voltage in V (for quick-eval)")
    q_group.add_argument("--capacity-mah", type=float, default=2600.0, help="Nominal capacity in mAh (for quick-eval)")
    q_group.add_argument("--cutoff", type=float, default=2.0, help="Cutoff voltage in V (for quick-eval)")

    # Output options
    o_group = parser.add_argument_group("Output Options")
    o_group.add_argument("--output", type=str, help="Path to output file (.json or .csv)")
    o_group.add_argument("--format", choices=["json", "table", "csv"], default="table", help="Output format (default: table)")
    o_group.add_argument("--summary", action="store_true", help="Always print ASCII summary table to stdout")
    o_group.add_argument("--no-timeseries", action="store_true", help="Omit high-resolution time series in JSON output")

    return parser


def load_battery_spec(args: argparse.Namespace, stdin_data: Optional[Dict[str, Any]]) -> BatterySpecification:
    if stdin_data and "battery" in stdin_data:
        return BatterySpecification.from_dict(stdin_data["battery"])

    if args.battery_preset:
        return get_battery_preset(args.battery_preset)

    if args.battery:
        # Check if raw JSON string or file
        if args.battery.strip().startswith("{"):
            data = json.loads(args.battery)
            return BatterySpecification.from_dict(data)
        elif os.path.isfile(args.battery):
            with open(args.battery, "r", encoding="utf-8") as f:
                return BatterySpecification.from_dict(json.load(f))
        else:
            raise FileNotFoundError(f"Battery file not found: {args.battery}")

    if args.quick_eval:
        return BatterySpecification(
            id="cli_quick_eval_cell",
            name=f"Quick Eval ({args.voltage}V {args.capacity_mah}mAh)",
            chemistry=BatteryChemistry.LITHIUM_THIONYL_CHLORIDE if args.voltage > 3.2 else BatteryChemistry.ALKALINE_ZN_MNO2,
            nominal_voltage_v=args.voltage,
            nominal_capacity_mah=args.capacity_mah,
            cutoff_voltage_v=args.cutoff,
        )

    # Default fallback
    return get_battery_preset("lisocl2_saft_ls14500")


def load_profile(args: argparse.Namespace, stdin_data: Optional[Dict[str, Any]]) -> ElectricalLoadProfile:
    if stdin_data and "load" in stdin_data:
        return ElectricalLoadProfile.from_dict(stdin_data["load"])

    if args.load_preset:
        return get_load_preset(args.load_preset)

    if args.load:
        if args.load.strip().startswith("{"):
            data = json.loads(args.load)
            return ElectricalLoadProfile.from_dict(data)
        elif os.path.isfile(args.load):
            with open(args.load, "r", encoding="utf-8") as f:
                return ElectricalLoadProfile.from_dict(json.load(f))
        else:
            raise FileNotFoundError(f"Load file not found: {args.load}")

    if args.quick_eval:
        return ElectricalLoadProfile(
            profile_id="cli_quick_eval_load",
            name=f"Continuous {args.current_ma} mA Load",
            is_periodic=True,
            repeat_count=-1,
            segments=[
                LoadSegment("q1", "Constant Discharge", LoadType.CONSTANT_CURRENT, value=args.current_ma, duration_s=60.0)
            ]
        )

    # Default fallback
    return get_load_preset("nbiot_asset_tracker")


def main():
    parser = build_arg_parser()
    args = parser.parse_args()

    stdin_data = None
    if args.stdin:
        try:
            stdin_text = sys.stdin.read()
            if stdin_text.strip():
                stdin_data = json.loads(stdin_text)
        except Exception as e:
            sys.stderr.write(f"Error reading stdin: {e}\n")
            sys.exit(1)

    # Temperature override
    ambient_temp = args.temp
    if stdin_data and "temperature_c" in stdin_data:
        ambient_temp = float(stdin_data["temperature_c"])

    try:
        battery_spec = load_battery_spec(args, stdin_data)
        load_spec = load_profile(args, stdin_data)
    except Exception as e:
        sys.stderr.write(f"Configuration Error: {e}\n")
        sys.exit(1)

    # Run simulation
    engine = BatterySimulatorEngine(battery_spec, ambient_temperature_c=ambient_temp)
    report = engine.run_simulation(load_spec)

    # Output handling
    include_timeseries = not args.no_timeseries

    if args.output:
        if args.output.endswith(".csv"):
            import csv
            with open(args.output, "w", newline="", encoding="utf-8") as f:
                if report.time_series:
                    writer = csv.DictWriter(f, fieldnames=list(report.time_series[0].keys()))
                    writer.writeheader()
                    for row in report.time_series:
                        writer.writerow(row)
            print(f"[OK] CSV time series exported to: {args.output}")
        else:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(report.to_dict(include_timeseries=include_timeseries), f, indent=2)
            print(f"[OK] Simulation report exported to: {args.output}")

    if args.summary or args.format == "table":
        print_ascii_summary_report(report)

    if args.format == "json" and not args.output:
        print(json.dumps(report.to_dict(include_timeseries=include_timeseries), indent=2))


if __name__ == "__main__":
    main()
