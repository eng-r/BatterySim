#!/usr/bin/env python3
"""
Example External Python Application: IoT Device Telemetry & Battery Monitor
Demonstrates how an external .PY application imports and drives BatteryRUL
simulator via its plug-and-play adapter (BatterySimulatorAdapter).
"""

import sys
import os
import time

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from battery_engine.adapters import BatterySimulatorAdapter
from battery_engine.presets import BATTERY_PRESETS, LOAD_PRESETS


def simulate_iot_device():
    print("=" * 70)
    print("  EXTERNAL IOT FIRMWARE SIMULATOR (Connected via BatterySimulatorAdapter)")
    print("=" * 70)

    # 1. Initialize the adapter using a built-in preset or custom JSON/dict
    print("[1] Initializing Battery Adapter for Saft LS14500 (Li-SOCl2 AA)...")
    battery = BatterySimulatorAdapter.from_preset("lisocl2_saft_ls14500", ambient_temperature_c=20.0)

    initial_state = battery.get_state()
    print(f"    Initial OCV:               {initial_state['ocv_v']} V")
    print(f"    Initial SoC:               {initial_state['soc_pct']}%")
    print(f"    Initial Passivation Film:  {initial_state['passivation_resistance_ohm']} Ohms")
    print()

    # 2. Interactive step-by-step load injection simulating device states
    print("[2] Executing firmware cycle states via battery.step():")

    # State A: Deep Sleep (3.5 uA for 10 seconds)
    res_sleep = battery.step(dt_seconds=10.0, current_ma=0.0035, segment_name="DeepSleep")
    print(f"    [Sleep 10s]: V_term = {res_sleep.terminal_voltage_v:.4f} V, SoC = {res_sleep.soc_pct:.3f}%, Passivation R = {res_sleep.passivation_resistance_ohm:.2f} Ohms")

    # State B: Microcontroller Wakeup & Sensor Sampling (4.5 mA for 0.1s)
    res_sensor = battery.step(dt_seconds=0.1, current_ma=4.5, segment_name="SensorSampling")
    print(f"    [Sensor 0.1s]: V_term = {res_sensor.terminal_voltage_v:.4f} V, Dip = {res_sensor.ocv_v - res_sensor.terminal_voltage_v:.4f} V")

    # State C: High-Power Radio Burst (NB-IoT Uplink, 75 mA for 1.2s)
    res_tx = battery.step(dt_seconds=1.2, current_ma=75.0, segment_name="RadioTransmit")
    print(f"    [Radio TX 1.2s]: V_term = {res_tx.terminal_voltage_v:.4f} V (Transitory Sag: {(res_tx.ocv_v - res_tx.terminal_voltage_v)*1000.0:.1f} mV)")
    print(f"      Passivation broke down to: {res_tx.passivation_resistance_ohm:.2f} Ohms")

    # State D: Radio RX Window (25 mA for 0.8s)
    res_rx = battery.step(dt_seconds=0.8, current_ma=25.0, segment_name="RadioReceive")
    print(f"    [Radio RX 0.8s]: V_term = {res_rx.terminal_voltage_v:.4f} V, SoC = {res_rx.soc_pct:.3f}%")
    print()

    # 3. Simulate entire multi-year profile to project End-of-Life (RUL)
    print("[3] Simulating full mission life with LoRaWAN Smart Meter duty cycle:")
    lorawan_profile = LOAD_PRESETS["lorawan_smart_meter"]
    
    report = battery.simulate_profile(lorawan_profile)
    print(f"    Total Projected Operating Life:  {report.total_simulated_time_years:.2f} Years")
    print(f"    Estimated Operating Days:        {report.total_simulated_time_days:.1f} Days")
    print(f"    Total Transmission Cycles:       {report.total_cycles_completed:,} cycles")
    print(f"    Total Delivered Energy:          {report.total_energy_consumed_mwh:.1f} mWh")
    print(f"    Final Battery SoC:               {report.final_soc_pct}%")
    print(f"    Termination Reason:              {report.termination_reason}")
    print()

    # 4. Exporting data
    export_json = "sample_simulation_output.json"
    battery.export_results_json(export_json, report)
    print(f"[4] Exported detailed telemetry report to '{export_json}'")
    print("=" * 70)
    print("  INTEGRATION SUCCESSFUL - Adaptor is ready for production use.")
    print("=" * 70)


if __name__ == "__main__":
    simulate_iot_device()
