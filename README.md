# BatteryRUL Simulator 🔋⚡

An advanced, full-stack electrochemical modeling simulator and Remaining Useful Life (RUL) estimation engine for primary batteries ($\text{Li-SOCl}_2$, $\text{Li-MnO}_2$, Alkaline) under dynamic pulsed electrical workloads (such as NB-IoT, LoRaWAN, BLE beacons, and satellite radios).

---

## 🌟 Architecture Overview

1. **Frontend (Browser UI)**: High-conversion modern SaaS web application built with **React 19**, **TypeScript**, **Tailwind CSS**, and **Vite**. Features multi-waveform vector charts, interactive State of Health (SoH) decay animation, thermal sweeps, and one-click PDF/CSV/JSON report generation.
2. **Full-Stack Server (`server.ts`)**: An **Express** backend integrated with **Vite SPA middleware** that serves both the frontend web app and backend REST API endpoints (`/api/simulate`, `/api/cli-run`, `/api/health`) over a single port (`3000`).
3. **Simulation Engine (`battery_engine/`)**: A pure, object-oriented **Python 3.10+** backend implementing:
   - **Dual-Polarization (2-RC) Equivalent Circuit Model (ECM)** for ohmic and diffusion voltage dynamics.
   - **Kinetic Battery Model (KiBaM)** for available vs. bound charge diffusion and rate capacity effects.
   - **Passivation Growth and Breakdown Modeling** for $\text{LiCl}$ crystal film voltage delays.
   - **Arrhenius Thermal Derating** for temperature-dependent self-discharge and internal resistance.
   - **Object-Oriented Adaptor (`BatterySimulatorAdapter`)** allowing external Python apps or test harnesses to plug the simulator in with two lines of code.

---

## 💻 Running the Web Application on a Clean Windows Machine

Follow these step-by-step instructions assuming a **clean, freshly installed Windows 10 or Windows 11 machine**.

### Step 1: Install Prerequisites (One-time setup)

1. **Install Node.js (v18 or v20 LTS)**:
   - Download the Windows Installer (`.msi`) from [https://nodejs.org](https://nodejs.org) (choose LTS).
   - Run the installer and click **Next** through the setup wizard (ensure *"Add to PATH"* remains checked).
   - *Alternative via Windows Terminal/PowerShell*:
     ```powershell
     winget install OpenJS.NodeJS.LTS
     ```

2. **Install Python (v3.10 or higher)**:
   - Download the Windows installer from [https://www.python.org/downloads/](https://www.python.org/downloads/).
   - ⚠️ **CRITICAL STEP**: On the first installer screen, **check the box: "Add python.exe to PATH"** before clicking *Install Now*.
   - *Alternative via Windows Terminal/PowerShell*:
     ```powershell
     winget install Python.Python.3.11
     ```

3. **Verify Installations**:
   - Open a fresh **PowerShell** or **Command Prompt (CMD)** and run:
     ```powershell
     node -v
     npm -v
     python --version
     ```
   - All three commands should output their installed versions without errors.

---

### Step 2: Open Project Directory & Enable Script Execution

1. Open **Windows Terminal**, **PowerShell**, or **Command Prompt (CMD)**.
2. Navigate (`cd`) to the project folder where this repository was extracted or cloned:
   ```powershell
   cd C:\path\to\BatteryRUL-Simulator
   ```
3. If using PowerShell, ensure script execution is permitted for your session:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

---

### Step 3: Install Project Dependencies

Run `npm install` to install all necessary packages (Vite, React, Express, tsx, jsPDF, Lucide icons):

```powershell
npm install
```

*(Note: The Python engine uses only Python standard library modules `dataclasses`, `math`, `json`, `argparse`, `sys`, and `typing`, so no separate `pip install` is required!)*

---

### Step 4: Launch the Server

Start the integrated development server:

```powershell
npm run dev
```

*(Under the hood, this executes `tsx server.ts`).*

When the server successfully boots, you will see output similar to:

```text
BatteryRUL Simulator server running at http://0.0.0.0:3000
```

---

### Step 5: Open and Use the Web Side in Your Browser

Once `tsx server.ts` has started, **Express and Vite are actively serving both the frontend client and the backend API on port 3000**.

1. Open your web browser of choice (**Google Chrome**, **Microsoft Edge**, **Brave**, or **Mozilla Firefox**).
2. In the address bar at the top, navigate to:
   ```text
   http://localhost:3000
   ```
   *(or `http://127.0.0.1:3000`)*

3. **Shortcut from Windows Terminal**:
   - In **PowerShell**, you can automatically launch your default browser by running:
     ```powershell
     Start-Process "http://localhost:3000"
     ```
   - In **Command Prompt (CMD)**:
     ```cmd
     start http://localhost:3000
     ```

4. You will immediately see the **BatteryRUL Simulator** dashboard with pre-loaded Saft $\text{Li-SOCl}_2$ parameters and an NB-IoT duty cycle.

---

## 🛠️ Windows Troubleshooting Guide

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **`spawn python3 ENOENT` or `NetworkError when attempting to fetch resource`** | On Windows, the official Python installer registers `python.exe` and `py.exe`, but **not** `python3.exe`. The server previously defaulted to `python3`, causing an unhandled child process error. | **Resolved in `server.ts`**: The server now automatically detects whether your system uses `python`, `py`, or `python3` across Windows, macOS, and Linux. If you want to force a specific Python executable or virtual environment, set the environment variable: `$env:PYTHON_CMD="python"` or `$env:PYTHON_CMD="C:\Path\To\python.exe"`. |
| **Port 3000 is already in use (`EADDRINUSE`)** | Another process (e.g. previous server instance or Docker) is occupying port 3000. | In PowerShell: `netstat -ano \| findstr :3000`<br>Then kill the process: `taskkill /PID <PID_NUMBER> /F`. |
| **`npm` or `node` is not recognized** | Node.js was installed while the terminal window was already open. | Close all PowerShell/CMD windows and open a new one so Windows reloads the system `PATH`. |
| **PowerShell script execution disabled** | Windows security policy restricts running scripts like `tsx.ps1`. | Run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in PowerShell. |

---

## 🐍 Running the Python CLI Directly on Windows

You can also run the Python simulation engine completely independent of the web UI via Windows PowerShell or Command Prompt.

### 1. Run using built-in presets (ASCII Table output):
```powershell
python -m battery_engine.cli --battery-preset lisocl2_saft_ls14500 --load-preset nbiot_asset_tracker --temp 25 --summary
```

### 2. Output Raw JSON (ideal for piping to other tools or files):
```powershell
python -m battery_engine.cli --battery-preset limno2_cr2032 --load-preset ble_beacon --format json > sim_output.json
```

### 3. Run using custom JSON files:
```powershell
python -m battery_engine.cli --battery configs/lisocl2_saft_ls14500.json --load configs/nbiot_pulse_profile.json --format table
```

### 4. Run the Python Adapter Example Script:
```powershell
python battery_engine/example_client_app.py
```

---

## 🔌 Using the Python Adapter in External Applications

You can plug the battery simulator into any external Python program (such as an IoT firmware emulator, sensor network simulator, or hardware test harness) using `BatterySimulatorAdapter`:

```python
from battery_engine.adapters import BatterySimulatorAdapter
from battery_engine.models import ElectricalLoadProfile, LoadSegment, LoadType

# 1. Instantiate battery adapter
battery = BatterySimulatorAdapter.from_preset("lisocl2_saft_ls14500", ambient_temperature_c=25.0)

# 2. Step through time interactively (e.g. inside a firmware state machine)
# Simulate 10 seconds of microcontroller deep sleep (3.5 uA):
step_sleep = battery.step(dt_seconds=10.0, current_ma=0.0035, segment_name="DeepSleep")
print(f"Voltage: {step_sleep.terminal_voltage_v:.4f}V | SoC: {step_sleep.soc_pct:.2f}%")

# Simulate a 1.5-second radio transmission pulse (75 mA):
step_tx = battery.step(dt_seconds=1.5, current_ma=75.0, segment_name="RadioTX")
print(f"Loaded Voltage: {step_tx.terminal_voltage_v:.4f}V (Sag: {(step_tx.ocv_v - step_tx.terminal_voltage_v)*1000:.1f}mV)")
print(f"Passivation Film Resistance: {step_tx.passivation_resistance_ohm:.2f} Ohms")

# 3. Simulate an entire multi-year mission profile:
from battery_engine.presets import LOAD_PRESETS
report = battery.simulate_profile(LOAD_PRESETS["nbiot_asset_tracker"])
print(f"Total Projected Life: {report.total_simulated_time_years:.2f} Years")
print(f"Termination Reason:   {report.termination_reason}")
```

---

## 📦 Production Build Instructions

To build a standalone production bundle:

```powershell
# 1. Compile Vite frontend to dist/ and bundle Express server with esbuild
npm run build

# 2. Launch production server
npm start
```

Visit `http://localhost:3000` to interact with the high-performance compiled application.

---

## 📖 Additional Documentation

For an in-depth, accessible explanation of the electrochemical models, dual-polarization physics, passivation mechanics, KiBaM diffusion, and software architecture, please read [**design.md**](design.md).
