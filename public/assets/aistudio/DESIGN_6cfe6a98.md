---
name: Apex Scalper Terminal
colors:
  surface: '#0f141b'
  surface-dim: '#0f141b'
  surface-bright: '#343941'
  surface-container-lowest: '#090f15'
  surface-container-low: '#171c23'
  surface-container: '#1b2027'
  surface-container-high: '#252a32'
  surface-container-highest: '#30353d'
  on-surface: '#dee2ec'
  on-surface-variant: '#d7c3ac'
  inverse-surface: '#dee2ec'
  inverse-on-surface: '#2c3138'
  outline: '#9f8e79'
  outline-variant: '#524533'
  surface-tint: '#ffb94f'
  primary: '#ffc97d'
  on-primary: '#452b00'
  primary-container: '#f7a600'
  on-primary-container: '#644000'
  inverse-primary: '#825500'
  secondary: '#adc6ff'
  on-secondary: '#002e6a'
  secondary-container: '#0566d9'
  on-secondary-container: '#e6ecff'
  tertiary: '#4ced9f'
  on-tertiary: '#003920'
  tertiary-container: '#1dd085'
  on-tertiary-container: '#005332'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb2'
  primary-fixed-dim: '#ffb94f'
  on-primary-fixed: '#291800'
  on-primary-fixed-variant: '#624000'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#60feae'
  tertiary-fixed-dim: '#3be194'
  on-tertiary-fixed: '#002111'
  on-tertiary-fixed-variant: '#005231'
  background: '#0f141b'
  on-background: '#dee2ec'
  surface-variant: '#30353d'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  data-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  data-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.5rem
  gutter-desktop: 0.5rem
  gutter-mobile: 0.25rem
  margin: 0.75rem
  margin-mobile: 0.5rem
  space-xs: 0.125rem
  space-sm: 0.25rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style
This design system establishes a high-frequency trading interface rooted in precision execution, sensory restraint, and analytical clarity. Designed for seasoned crypto scalpers, algorithmic traders, and quantitative operators, the interface evokes the clinical focus of mission-control avionics fused with contemporary institutional fintech. 

The aesthetic is **Precision Technical Dark**: an ultra-dense, low-fatigue workspace optimized for 12+ hour trading sessions under volatile market conditions. Surfaces are engineered with deep obsidian tones that eliminate screen glare, while strategic luminescence—crisp micro-glows, directional edge highlights, and high-frequency color accents—instantly communicates directional trade telemetry (PnL, delta, liquidity shifts, liquidation cascades). Every element prioritizes data scannability, sub-millisecond status comprehension, and zero visual ambiguity.

## Colors
The palette leverages a calibrated dark spectrum engineered specifically for high-contrast multi-window workflows.

- **Background & Canvas:** Primary canvas rests at `#0B0E11` (Deep Space Obsidian), providing a zero-glare bedrock. Layered surfaces graduate through Card `#151A21`, Hover/Active Surface `#1C232D`, and Floating Overlay `#232A35`.
- **Structural Borders:** Subtle structural dividers sit at `#232A35`, stepping up to `#2E3746` for active input rings and container outlines.
- **Brand & System Accents:**
  - **Primary (Execution & Alert):** Amber Gold `#F7A600` denotes primary bot status, master triggers, and high-tier liquidity locks.
  - **Secondary (Telemetry & Systems):** Electric Sharp Blue `#3B82F6` flags informational states, charting tools, and algorithmic parameters.
- **Directional & State Semantics:**
  - **Long / Profit / Active:** Emerald `#0ECB81` with an ambient glow (`rgba(14, 203, 129, 0.15)`).
  - **Short / Loss / Critical:** Crimson `#F6465D` with an ambient glow (`rgba(246, 70, 93, 0.15)`).
  - **Warning / Paper-Trading:** Signal Amber/Yellow `#F0B90B` indicating testnet mode or volatility throttle warnings.
- **Typography Neutrals:** High-emphasis data `#F4F6F8`, muted labels `#848E9C`, secondary metrics `#B7BDC6`, and disabled/ghost nodes `#474F5D`.

## Typography
The system enforces a dual-typeface structural paradigm:

1. **Analytical UI & Headings (`Plus Jakarta Sans` / `Inter`):** Utilized for workspace headings, panel titles, modals, and explanatory UI elements. Font sizes stay compact to conserve spatial economy without sacrificing readability.
2. **Numeric Execution Layer (`JetBrains Mono`):** Applied mandatorily to every financial value—order books, live price ticks, slippage markers, PnL percentages, timestamps, and bot script outputs. All monospace numerals must be rendered with `font-variant-numeric: tabular-nums` to eliminate layout shift during millisecond-level tick updates.
3. **Hierarchy Rules:** 
   - Caps styling (`label-caps`) is enforced on metadata labels, table column headers, and status pill titles.
   - PnL metrics inherit semantic color classes alongside bold monospace weights to enable instantaneous visual scanning across multiple viewports.

## Layout & Spacing
The layout implements an information-dense, zero-waste CSS Grid architecture engineered to utilize 100% of the viewport viewport height without non-essential scrollbars.

- **Grid Discipline:** A 12-to-24 column dynamic CSS Grid paired with persistent dockable multi-panel zones: Header Ticker (36px fixed height), Sub-header Navigation/Bot Switcher (44px), Main Workspace (flexible split between Depth Chart/TradingView iframe, Order Book, Position Matrix, and Execution Engine), and System Status Bar (24px fixed footer).
- **Spatial Rhythm:** Tight, mathematical 4px/8px rhythm. Panel gutters sit locked at `0.5rem` (8px) on desktop to prioritize screen real estate for charts and ladder depth, dropping to `0.25rem` (4px) on mobile tabs.
- **Responsiveness:**
  - **Desktop (≥1440px):** Multi-column concurrent workspace: 4-pane simultaneous view (Chart + Ladder/Order Book + Bot Log Matrix + Scalp Execution Controls).
  - **Laptop/Tablet (768px - 1439px):** Split-view 2-panel arrangement with collapsible fly-out sidebars for terminal telemetry.
  - **Mobile (<768px):** Single-column stacked mode with segmented sticky navigation tabs for Price/Book/Orders/Positions and pinned bottom one-click execution triggers.

## Elevation & Depth
Depth is created through strict tonal layering, physical-like border demarcations, and precise directional glow rather than heavy drop shadows:

- **Base Elevation (Floor):** Canvas background `#0B0E11`.
- **Level 1 (Card & Module Shells):** `#151A21` bounded by an inner 1px border `rgba(255, 255, 255, 0.05)` and outer stroke `#232A35`. 
- **Level 2 (Active Modules & Row Highlights):** `#1C232D` with razor-sharp borders `#2E3746`.
- **Level 3 (Modals, Context Menus, Tooltips):** `#151A21` combined with backdrop blur (`backdrop-filter: blur(12px)`) and subtle outer directional drop shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.6)`.
- **Luminescent Telemetry:** Floating actions, kill-switches, and buy/sell buttons use restrained edge-glows:
  - Long/Active: `0 0 12px rgba(14, 203, 129, 0.25)`
  - Short/Panic: `0 0 12px rgba(246, 70, 93, 0.25)`
  - Active Bot/Warning: `0 0 12px rgba(247, 166, 0, 0.25)`

## Shapes
A unified soft-geometric silhouette standardizes the interface, countering the clinical rigidity of trading tables:

- **Core Elements (Inputs, Buttons, Micro-Badges):** Standardized at `0.5rem` (8px, `rounded-md`/`rounded-lg`).
- **Main Terminal Panels & Chart Containers:** Set to `0.75rem` (12px, `rounded-lg`) to create defined visual pockets across the dark canvas.
- **Flyout Modals & Overlay Windows:** Set to `1rem` (16px, `rounded-xl`).
- **Micro-Indicators & Pill Toggles:** Fully rounded pill shapes (`9999px`) are reserved exclusively for live connection states, bot mode tags (e.g., `PAPER`, `LIVE`, `GRID`, `DCA`), and sub-second ping monitors.

## Components

### Buttons & Quick-Action Triggers
- **Primary Execution (Buy/Long & Sell/Short):** Height 36px or 40px, bold monospace uppercase labels. Long button uses `#0ECB81` background with deep obsidian text; Short button uses `#F6465D` with pure white text. Active states trigger 0.98 scale transforms and focused edge glows.
- **Terminal System Controls:** Ghost buttons with 1px border `#232A35`, hover fill `#1C232D`, active text `#F7A600`.
- **Emergency Panic/Kill Switch:** Compact button with high-contrast crimson outline, pulsating micro-dot, and immediate confirmation modal.

### Status Indicators & Micro-Badges
- **Bot Mode Badge:** Ultra-compact pill badges (padding: `2px 6px`, font size: `10px`). Gold-tinted `rgba(247, 166, 0, 0.15)` for `LIVE BOT`, Blue-tinted for `PAPER TRADING`, Crimson for `HALTED`.
- **Heartbeat & Latency Meter:** Displays real-time WebSocket connection state with an animated pulsing dot (`#0ECB81` < 30ms latency, `#F0B90B` 30-100ms, `#F6465D` > 100ms) paired with numeric latency in `JetBrains Mono`.

### Order Books & Depth Ladders
- **Visual Depth Bars:** Horizontal percentage fill-bars aligned right (Bids `#0ECB81` with 12% opacity) and left (Asks `#F6465D` with 12% opacity).
- **Price Precision:** Numeric values rendered at `12px` JetBrains Mono, perfectly vertically centered with row heights strictly locked at 20px for dense vertical scanning.

### Input Fields & Steppers
- **Financial Inputs (Size, Price, Leverage Slider):** Height 32px or 36px, background `#0B0E11`, border 1px solid `#232A35`, focus ring 1px solid `#F7A600`. Embedded currency markers (`USDT`, `BTC`) locked in muted uppercase monospace on the right edge. Quick-percentage selectors (`25%`, `50%`, `75%`, `100%`) embedded directly beneath or within the input frame.

### Data Tables & Position Matrix
- **Headers:** Sticky 24px height headers, uppercase `label-caps` in `#848E9C`, 1px bottom divider `#232A35`.
- **Cells:** Zero-padding side alignment, compact vertical padding (6px). Dynamic PnL text shifts color instantly (`#0ECB81` positive, `#F6465D` negative) paired with `+` or `-` monospace prefixes. Hover state triggers a subtle `#1C232D` background fill across the entire row.

### Parameter Cards & Scalper Bot Tiles
- Modular grid cards displaying active bot telemetry: Run time, Win Rate %, Total Realized PnL, Trailing Stop Distance, and Quick-Halt triggers. Features a top accent border (1.5px solid) reflecting current bot status (Amber for running, Gray for idle).