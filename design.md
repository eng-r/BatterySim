# BatteryRUL Simulator: Technical Design Document 📘⚡

Welcome to the architectural and physics design guide for the **BatteryRUL Simulator**!

This document is crafted to explain the entire system in clear, intuitive terms—complete with real-world analogies that a high school physics or computer science student can understand—while preserving the mathematical rigor expected by professional hardware and battery engineers.

---

## 1. Executive Summary & The Core Problem

Imagine you are an engineer designing a **smart water meter** or a **wildlife GPS collar** for polar bears in the Arctic. 

- You cannot plug the device into a wall outlet.
- You cannot recharge it with solar panels (water meters are buried under concrete streets; polar bears wander during 6-month dark winter nights).
- You install a specialized **primary battery** (a high-energy, single-use, non-rechargeable battery like Lithium Thionyl Chloride, $\text{Li-SOCl}_2$) and expect it to survive for **10 to 15 years**.

### The Naive Math Trap (Why Simple Math Fails)
If you ask an introductory physics student how long the battery will last, they will use this simple equation:

$$\text{Lifespan (hours)} = \frac{\text{Nominal Capacity (mAh)}}{\text{Average Current Drain (mA)}}$$

If the battery is rated at **$2,600\text{ mAh}$** and your device has an average drain of **$0.03\text{ mA}$**, the formula predicts:

$$\text{Lifespan} = \frac{2,600}{0.03} = 86,666\text{ hours} \approx \mathbf{9.89\text{ Years}}$$

**In real life, that device might die in just 2.5 years!** Why?
1. **Pulsed Radio Demands**: The device sleeps at $0.003\text{ mA}$ ($3\ \mu\text{A}$), but once an hour it wakes up and fires an NB-IoT cellular transmitter at $75\text{ mA}$ to $200\text{ mA}$.
2. **Internal Resistance & Voltage Sag**: High currents drop voltage ($V = I \times R$). If the voltage dips below the device's microcontroller shutdown threshold (e.g., $2.0\text{ V}$), the device reboots or dies—even if 70% of the chemical energy remains trapped inside!
3. **The "Passivation" Crystal Layer**: In $\text{Li-SOCl}_2$ batteries, a microscopic insulating film of Lithium Chloride ($\text{LiCl}$) forms on the lithium anode. When the radio turns on, this film causes an extreme momentary voltage drop called **Voltage Delay**.
4. **Diffusion Bottlenecks (KiBaM)**: Ions inside the battery liquid cannot swim instantly. If you pull power too fast, the surface runs out of available ions, even though deep storage is full.
5. **Temperature Extremes**: Freezing cold makes the battery electrolyte viscous like cold honey, quadrupling internal resistance. Desert heat speeds up unwanted chemical self-discharge.

The **BatteryRUL Simulator** was engineered to model all these physical phenomena accurately and predict the true **Remaining Useful Life (RUL)**.

---

## 2. High-Level Architecture (The Three-Tier System)

The application follows a clean **Three-Tier Architecture**:

```text
┌────────────────────────────────────────────────────────┐
│               1. Modern SaaS Web Frontend              │
│       (React 19, TypeScript, Tailwind CSS, Vite)       │
│  - Parameter Editors (Battery specs & Multi-stage Load)│
│  - Live Interactive Vector Waveform Charts             │
│  - Animated State of Health (SoH) Decay Visualizer     │
│  - PDF Report Exporter & CSV/JSON Data Exporter        │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP JSON API / WebSocket
                            ▼
┌────────────────────────────────────────────────────────┐
│            2. Full-Stack Bridge Server (server.ts)     │
│             (Node.js, Express, Vite Middleware)        │
│  - Serves compiled SPA & static assets on Port 3000   │
│  - API Endpoints: /api/simulate, /api/cli-run, /health │
│  - Spawns & supervises native Python child processes   │
└───────────────────────────▲────────────────────────────┘
                            │ JSON Standard Input/Output (IPC)
                            ▼
┌────────────────────────────────────────────────────────┐
│             3. Python Simulation Engine Core           │
│                    (battery_engine/)                   │
│  - Pure Python 3.10+ Object-Oriented Architecture      │
│  - Dual-Polarization (2-RC) ECM Circuit Solver         │
│  - Kinetic Battery Model (KiBaM) Two-Well Diffusion    │
│  - LiCl Passivation Dynamic Growth & Breakdown Model   │
│  - CLI Tool (battery_engine.cli) & Adapter Class       │
└────────────────────────────────────────────────────────┘
```

### An Easy Analogy: The Restaurant
- **The Frontend (Waitstaff & Menu)**: Beautiful, intuitive, and lets the user choose battery ingredients and load profiles. When you press "Run Simulation", it neatly writes down your order in a standard JSON format.
- **The Bridge Server (Kitchen Expediter)**: Receives the order over HTTP, checks that all required fields are present, and passes the ticket to the master chef.
- **The Python Engine (Master Chef)**: Follows rigorous physical formulas to compute the electrochemical simulation step by step. When finished, it outputs a detailed report of voltage drops, energy usage, and battery life.

---

## 3. Battery Domain Knowledge & Physical Modeling

### A. Primary Batteries vs. Secondary Batteries
- **Secondary Batteries** (like Lithium-Ion in smartphones or Electric Vehicles) are designed to be recharged hundreds of times. They prioritize cycle life over long shelf life.
- **Primary Batteries** (like $\text{Li-SOCl}_2$, $\text{Li-MnO}_2$, Alkaline) **cannot be recharged**. Once their chemical reactants are consumed, they are spent. However, they boast:
  - Unmatched energy density (up to $650\ \text{Wh/kg}$).
  - Ultralow self-discharge ($<1\%$ per year at room temperature).
  - Ability to survive for 10 to 20 years without human intervention.

---

### B. Core Metrics: SoC, SoH, and RUL

| Term | Full Name | Everyday Analogy | Definition |
| :--- | :--- | :--- | :--- |
| **SoC** | **State of Charge** (%) | The fuel gauge in your car | The percentage of electrical charge currently stored in the battery relative to its rated capacity. $\text{SoC} = (Q_{\text{remaining}} / Q_{\text{nominal}}) \times 100$. |
| **SoH** | **State of Health** (%) | The age/wear of the car's engine | How much the battery has permanently degraded compared to a factory-fresh cell. As a battery ages, its internal resistance climbs and active material is lost to passivation and self-discharge. |
| **RUL** | **Remaining Useful Life** | Estimated miles left before breakdown | The total simulated calendar time (in years, days, or completed duty cycles) before the loaded battery voltage sags below the device's operational cutoff limit ($V_{\text{cutoff}}$). |

---

### C. Equivalent Circuit Model (ECM): Dual-Polarization (2-RC)

A real battery is not an ideal voltage source. It behaves like an ideal chemical voltage ($V_{\text{ocv}}$, Open-Circuit Voltage) connected in series with resistors and capacitors:

```text
    (+) Terminal
         │
         ├───[ R0 (Ohmic Resistance) ]───┐
         │                               │
         ├───[ R1 ]──────┐               │
         │     │         │ (Charge       │
         │   [ C1 ]──────┘  Transfer)    │
         │                               │
         ├───[ R2 ]──────┐               │
         │     │         │ (Mass         │
         │   [ C2 ]──────┘  Diffusion)   │
         │                               │
         ├───[ R_pass (Passivation) ]────┘
         │
        [+] 
       (Vocv)  Ideal Chemical Voltage
        [-]
         │
    (-) Terminal
```

#### 1. $R_0$ (Ohmic Internal Resistance)
- **What it is**: The natural resistance of the metal foils, leads, and the liquid electrolyte.
- **Behavior**: Causes an **instantaneous voltage drop** the microsecond current begins flowing ($V_{\text{drop}} = I \times R_0$). When the current stops, this voltage immediately bounces back.

#### 2. $R_1 \parallel C_1$ (Charge-Transfer Overpotential)
- **What it is**: The activation energy barrier required for electrons and ions to chemically detach from the anode and cathode surfaces.
- **Behavior**: It takes milliseconds for this reaction to speed up. The capacitor $C_1$ absorbs sudden shocks, creating an exponential curve over time.

#### 3. $R_2 \parallel C_2$ (Mass-Transport Diffusion Overpotential)
- **What it is**: The time it takes for ions to physically travel through the liquid electrolyte from the center of the battery to the electrodes.
- **Behavior**: Acts on a slower timescale (seconds to minutes).

**Terminal Voltage Equation**:
$$V_{\text{terminal}}(t) = V_{\text{ocv}}(\text{SoC}) - I(t) \cdot \left[ R_0(T) + R_{\text{pass}}(t) \right] - V_{RC1}(t) - V_{RC2}(t)$$

Where the polarization voltages update via differential equations:
$$\frac{dV_{RC1}}{dt} = \frac{I(t)}{C_1} - \frac{V_{RC1}}{R_1 C_1}$$

---

### D. The Kinetic Battery Model (KiBaM) & The Two-Tank Analogy

Why does a battery give you less total energy when you drain it fast versus slow? This is called the **Rate Capacity Effect** or **Peukert Effect**.

The **Kinetic Battery Model (KiBaM)** explains this using two connected water tanks:

```text
   AVAILABLE CHARGE WELL (q1)          BOUND CHARGE WELL (q2)
      (Fraction c of total)           (Fraction 1-c of total)
       ┌─────────────────┐             ┌─────────────────┐
       │   Water Level   │             │   Water Level   │
       │       h1        │             │       h2        │
       │                 │   Narrow    │                 │
       │                 │    Pipe     │                 │
       │                 │◄──(rate k)─►│                 │
       │                 │             │                 │
       └────────┬────────┘             └─────────────────┘
                │
                ▼ To External Device (Current I)
```

1. **The Available Well ($q_1$)**: Contains charge immediately available to power the device. Its capacity ratio is $c$ (e.g., $0.85$ or $85\%$).
2. **The Bound Well ($q_2$)**: Contains chemically bound charge that cannot be drawn directly. It must first flow into Tank 1 through a narrow pipe with flow conductance rate $k$.
3. **What happens during a massive radio transmission pulse ($75\text{ mA}$)**:
   - Current is sucked rapidly from Tank 1 ($h_1$ drops fast).
   - Tank 2 ($h_2$) cannot transfer charge fast enough through the narrow pipe $k$.
   - The water level $h_1$ drops to zero, and the battery appears empty—even though Tank 2 is still $80\%$ full!
4. **What happens during Sleep ($3.5\ \mu\text{A}$)**:
   - When the load drops, charge trickles slowly from Tank 2 back into Tank 1 until levels equalize ($h_1 = h_2$). This is the **charge recovery effect**.

---

### E. Passivation Layer ($\text{LiCl}$) Dynamics & Voltage Delay

Lithium Thionyl Chloride ($\text{Li-SOCl}_2$) has the highest energy density of any commercial primary chemistry. Why doesn't the lithium anode spontaneously dissolve in the liquid thionyl chloride?

Because as soon as it is manufactured, a protective, paper-thin crystalline film of **Lithium Chloride ($\text{LiCl}$)** forms over the lithium metal anode:
- **The Good**: It acts like a suit of armor, sealing the lithium and reducing self-discharge to less than $1\%$ per year.
- **The Bad**: $\text{LiCl}$ crystals are electrical insulators! When the battery sits in a warehouse or in a sleeping device for months, the film thickens (growing resistance up to $25\ \Omega$).
- **The Voltage Delay**: When an NB-IoT radio wakes up and pulls $100\text{ mA}$, the initial resistance causes a severe voltage drop:

$$\Delta V = I \times R_{\text{pass}} = 0.100\text{ A} \times 25\ \Omega = \mathbf{2.5\text{ Volts Drop!}}$$

A $3.65\text{ V}$ battery drops instantly to $1.15\text{ V}$, plunging far below the $2.0\text{ V}$ cutoff!
- **Breakdown & Regrowth**: As current flows, the intense electric field mechanically cracks and dissolves the $\text{LiCl}$ crystals (depassivation). Once the radio goes back to sleep, the crystals slowly regrow over hours and days. The simulator explicitly tracks this dynamic resistance:

$$\frac{dR_{\text{pass}}}{dt} = -k_{\text{breakdown}} \cdot I(t) \cdot (R_{\text{pass}} - R_{\text{min}}) + k_{\text{regrowth}} \cdot (R_{\text{max}} - R_{\text{pass}})$$

---

### F. Temperature Dependence (The Arrhenius Law)

Temperature influences both the chemistry and physics of the battery:

1. **Freezing Temperatures (Winter / Arctic)**:
   - Ion mobility in the liquid electrolyte slows down dramatically.
   - Internal resistance increases according to temperature coefficient $\alpha_T$:
     $$R_0(T) = R_{0, \text{ref}} \cdot \left[ 1 + \alpha_T \cdot (T - T_{\text{ref}}) \right]$$
     At $-20^\circ\text{C}$, resistance can double or triple, making pulse sags catastrophic.
2. **High Temperatures (Summer / Industrial)**:
   - Electrolyte stays thin and resistance drops, but chemical self-discharge accelerates exponentially following the **Arrhenius equation**:
     $$k_{\text{self-discharge}}(T) = k_{\text{ref}} \cdot \exp\left( \frac{-E_a}{R \cdot (T + 273.15)} \right)$$
   - At $+55^\circ\text{C}$, a battery that normally loses $1\%$ per year might lose $5\%$ to $8\%$ per year to internal self-discharge!

---

## 4. Frontend Architecture & User Interface Design

The frontend is designed around a **Modern SaaS Archetype** prioritizing visual clarity, immediate feedback, and dense technical legibility without cognitive overload.

### Key Components

```text
src/
├── App.tsx                     # Main application orchestrator & state container
├── types.ts                    # Strict TypeScript interfaces matching Python schemas
├── data/
│   └── presets.ts              # Pre-calibrated battery specs and load profiles
├── lib/
│   ├── simulation.ts           # Client-side mirror simulation engine & API client
│   └── pdfReport.ts            # jsPDF procedural vector document builder
└── components/
    ├── Sidebar.tsx             # Sticky vertical navigation with live telemetry badges
    ├── Header.tsx              # Quick preset selectors, temperature slider, simulation trigger
    ├── BatteryConfigView.tsx   # Interactive parameter editor for ECM, KiBaM, and Passivation
    ├── LoadProfileView.tsx     # Multi-stage duty cycle editor with timeline visualization
    ├── ResultsView.tsx         # Analytical dashboard with metrics and vector charts
    ├── SohDecayVisualizer.tsx  # Animated capacity degradation playback widget
    ├── CliStudioView.tsx       # Live command-line builder, in-browser terminal, & Python snippet
    └── SensitivityView.tsx     # Thermal sweep (-20°C to +60°C) longevity curve
```

### Highlights of Frontend Implementation
1. **Interactive SoH Decay Animation (`SohDecayVisualizer.tsx`)**:
   - Uses `requestAnimationFrame` to scrub through the 10-year simulated battery life.
   - Live 3D-styled cutaway battery graphic with electrolyte fill level, meniscus line, and dynamic color transitions (Emerald $\to$ Amber $\to$ Rose).
   - Synchronized telemetry dials tracking age in years, available vs. consumed mAh, loaded voltage, and growing internal impedance.
2. **Vector Multi-Waveform Charts (`ResultsView.tsx`)**:
   - Fully interactive responsive SVG charts with hover crosshairs, milestone ticks, and critical voltage threshold lines.
   - Waveform modes:
     - *Terminal Voltage vs. OCV*: Displays loaded pulse drops against the cutoff threshold.
     - *SoC & SoH Trajectory*: Tracks chemical fuel vs. active material fade over years.
     - *Passivation Film Resistance*: Reveals $\text{LiCl}$ breakdown during pulses and regrowth during sleep.
     - *Cumulative Energy Delivered*: Area chart of total milliWatt-hours consumed.
3. **One-Click Executive PDF Exporter (`pdfReport.ts`)**:
   - Uses `jspdf` to dynamically compile a publication-grade A4 technical report.
   - Includes company header, executive KPI cards, cell ECM parameters table, load profile stages breakdown, and 5-point trajectory milestone audit.

---

## 5. Backend Architecture & Object-Oriented Design

The backend is built in pure Python 3.10+ using object-oriented principles, dataclass validation, and encapsulation.

### Class Diagram

```text
┌──────────────────────────────────────────────────────────┐
│                   BatterySpecification                   │
│  - id: str, name: str, chemistry: BatteryChemistry       │
│  - nominal_voltage_v, nominal_capacity_mah, cutoff_v     │
│  - internal_resistance_ohm (R0), r1, c1, r2, c2          │
│  - kibam_c_ratio, kibam_k_rate, peukert_coefficient      │
│  - has_passivation, initial_r_pass, max_r_pass           │
│  - arrhenius_activation_energy, temp_resistance_coeff    │
└────────────────────────────▲─────────────────────────────┘
                             │ Has-a (Configures)
┌────────────────────────────┴─────────────────────────────┐
│                DualPolarizationKiBaMEngine               │
│  - state: BatteryState (q1, q2, v_rc1, v_rc2, r_pass)    │
│  - step(dt_seconds, current_ma) -> SimulationStepResult   │
│  - compute_terminal_voltage(current_ma)                  │
│  - update_diffusion(dt_seconds, current_ma)              │
│  - update_passivation(dt_seconds, current_ma)            │
│  - apply_thermal_derating(temp_c)                        │
└────────────────────────────▲─────────────────────────────┘
                             │ Uses
┌────────────────────────────┴─────────────────────────────┐
│                 BatterySimulatorAdapter                  │
│  - from_preset(preset_id, temp_c)                        │
│  - from_json(filepath, temp_c)                           │
│  - step(dt_seconds, current_ma, segment_name)            │
│  - simulate_profile(load_profile) -> SimulationReport    │
│  - export_results_json(filepath, report)                 │
└──────────────────────────────────────────────────────────┘
```

### Module Breakdown
- `battery_engine/models.py`: Defines immutable, type-hinted dataclasses (`BatterySpecification`, `ElectricalLoadProfile`, `LoadSegment`, `SimulationStepResult`, `SimulationReport`).
- `battery_engine/simulator.py`: Contains the `DualPolarizationKiBaMEngine` and macro-stepping simulation loop. To simulate a 15-year lifecycle in milliseconds, the engine simulates high-resolution transient pulses, calculates cycle-aggregated metrics, and projects long-term state evolution with adaptive mathematical stability.
- `battery_engine/adapters.py`: Provides the **Adapter Pattern** facade (`BatterySimulatorAdapter`). Any external Python application can import this class and use the simulator like a physical hardware sensor.
- `battery_engine/cli.py`: The command-line interface. Supports `--battery-preset`, `--load-preset`, `--battery file.json`, `--load file.json`, `--temp`, `--format [table|json]`, and `--stdin`.
- `battery_engine/presets.py`: Pre-calibrated library of real-world cells (Saft LS14500, LSH14, Tadiran TL-5903, CR2032, CR123A, Alkaline AA) and workloads (NB-IoT, LoRaWAN, BLE, Search & Rescue).

---

## 6. Verification and Testing Strategy

1. **Conservation of Energy & Charge Audit**:
   - Total capacity delivered ($mAh$) plus self-discharge capacity equals initial available capacity minus remaining bound charge.
2. **Terminal Voltage Monotonicity Check**:
   - Under constant load, loaded voltage must decrease predictably until cutoff.
3. **Passivation Voltage Delay Verification**:
   - Verifies that an unexercised cell experiencing a sudden $100\text{ mA}$ pulse exhibits immediate voltage sag due to $R_{\text{pass}}$, followed by a recovery inflection as the film breaks down.
4. **Thermal Derating Invariance**:
   - Cold simulations ($-20^\circ\text{C}$) must terminate earlier due to voltage sag hitting $V_{\text{cutoff}}$ before full chemical exhaustion.
   - Warm simulations ($+50^\circ\text{C}$) must terminate with higher capacity efficiency but shorter total years due to accelerated Arrhenius self-discharge.

---

## 7. Glossary for Students

- **Ampere-Hour (Ah / mAh)**: A measure of battery electric charge. $1\text{ mAh}$ means the battery can deliver $1\text{ milliampere}$ of current for $1\text{ hour}$.
- **Anode**: The negative electrode of the battery during discharge (where lithium atoms give up electrons to become lithium ions).
- **Cathode**: The positive electrode of the battery during discharge.
- **Electrolyte**: The liquid medium inside the battery that allows lithium ions to travel between electrodes.
- **Passivation**: A chemical reaction between the lithium metal and the electrolyte that forms a thin protective barrier of salt crystals ($\text{LiCl}$), preventing spontaneous explosion or rapid degradation.
- **Cutoff Voltage ($V_{\text{cutoff}}$)**: The minimum voltage at which the device's electronics can stay powered on (typically $2.0\text{ V}$ to $2.5\text{ V}$). If the battery drops below this, the device turns off.
- **OCV (Open-Circuit Voltage)**: The resting voltage of the battery when zero current is flowing.
- **Terminal Voltage ($V_{\text{terminal}}$)**: The actual voltage measured between the (+) and (-) battery terminals while power is being drawn.
