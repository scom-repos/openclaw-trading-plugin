---
name: strategy-reference
description: Complete reference for strategy indicators, rules, risk management, and examples. Use when constructing a trading strategy JSON.
---

# Strategy Reference

## Indicators

### Common Structure

```json
{
  "type": "indicator_type",
  "name": "unique_name",
  "period": 14,
  "timeframe": "M1",
  "params": {}
}
```

- `type` (required): indicator type
- `name` (required): unique name used to reference this indicator in rules
- `period`: period/length (required for most types)
- `timeframe`: M1, M5, M15, M30, H1, H4, D1
- `params`: additional parameters (varies by type)

### Single-Value Indicators

**RSI** — outputs: `{name}` (0-100)
```json
{"type":"rsi","name":"rsi14","period":14,"timeframe":"M1"}
```

**SMA** — outputs: `{name}` (price value)
```json
{"type":"sma","name":"sma20","period":20,"timeframe":"M1"}
```

**EMA** — outputs: `{name}` (price value)
```json
{"type":"ema","name":"ema50","period":50,"timeframe":"M1"}
```

**ATR** — outputs: `{name}` (volatility value)
```json
{"type":"atr","name":"atr14","timeframe":"M1","params":{"period":14,"multiplier":1.0}}
```
Params: `period` (default 14), `multiplier` (default 1.0)

### Multi-Value Indicators

**MACD** — outputs: `{name}_macd`, `{name}_signal`, `{name}_histogram` (dot notation also works: `{name}.macd`)
```json
{"type":"macd","name":"macd","timeframe":"M1","params":{"fast_period":12,"slow_period":26,"signal_period":9}}
```

**StochRSI** — outputs: `{name}_k`, `{name}_d` (0-100)
```json
{"type":"stochrsi","name":"stochrsi","timeframe":"M1","params":{"rsi_period":14,"stoch_period":14,"k_period":3,"d_period":3}}
```

**Stochastic** — outputs: `{name}_k`, `{name}_d` (dot notation also works: `{name}.k`)
```json
{"type":"stochastic","name":"stoch","timeframe":"M1","params":{"k_period":14,"d_period":3,"smooth_k":3}}
```
Also accepts `"type":"stoch"`.

**Bollinger Bands** — outputs: `{name}_upper`, `{name}_middle`, `{name}_lower` (dot notation also works)
```json
{"type":"bollinger","name":"bb","timeframe":"M1","params":{"period":20,"std_dev":2.0}}
```

### Formation Indicators

**Renko** — fixed brick size
```json
{"type":"renko","name":"renko_10","period":1,"timeframe":"M1","params":{"brick_size":10.0}}
```
Outputs: `{name}.brick_high`, `{name}.brick_low`, `{name}.direction` (1=up, -1=down, 0=none), `{name}.brick_count`, `{name}.is_new_brick` (1/0), `{name}.brick_size`

**RenkoATR** — ATR-adaptive brick size
```json
{"type":"renko_atr","name":"renko_adaptive","period":14,"timeframe":"M1","params":{"atr_period":14,"atr_multiplier":1.5}}
```
Same outputs as Renko. Also accepts `"type":"renkoatr"`.

**OHLC** — candle data access
```json
{"type":"ohlc","name":"ohlc_m5","period":1,"timeframe":"M5","params":{}}
```
Outputs: `{name}.open`, `{name}.high`, `{name}.low`, `{name}.close`, `{name}.volume`
Both dot and underscore notation work: `ohlc_m5.close` = `ohlc_m5_close`

### Current Price

Use `"price"` (or `"current_price"`) in rules to reference the live tick price. No indicator definition needed.
```json
{"indicator":"price","op":"gt","other":"sma20"}
```

### Lookback Syntax

Access previous bar values with `[n]` (up to 10 bars back):
- `rsi14[1]` — RSI value 1 bar ago
- `ohlc_m1.high[1]` — previous bar's high
- `macd_signal[2]` — signal line 2 bars ago
- `bb_lower[1]` — lower band 1 bar ago

### Output Reference Table

| Type | Outputs |
|------|---------|
| rsi | `{name}` |
| sma | `{name}` |
| ema | `{name}` |
| atr | `{name}` |
| macd | `{name}_macd`, `{name}_signal`, `{name}_histogram` |
| stochrsi | `{name}_k`, `{name}_d` |
| stochastic | `{name}_k`, `{name}_d` |
| bollinger | `{name}_upper`, `{name}_middle`, `{name}_lower` |
| renko | `{name}.brick_high`, `.brick_low`, `.direction`, `.brick_count`, `.is_new_brick`, `.brick_size` |
| renko_atr | same as renko |
| ohlc | `{name}.open`, `.high`, `.low`, `.close`, `.volume` |

Multi-value indicators also support dot notation (e.g., `macd.macd`, `stoch.k`, `bb.upper`).

Do NOT use bare `"close"`, `"open"`, `"high"`, `"low"` — these are deprecated. Use `"price"` for live price or define an OHLC indicator.

## Rules

### Rule Structure

```json
{
  "id": "unique_rule_id",
  "intent": "open",
  "when": { ... },
  "order": { ... },
  "pyramiding": { ... }
}
```

- `id` (required): unique identifier
- `intent` (required): `"open"` (enter position) or `"close"` (exit position)
- `when` (required): condition object
- `order`: order specification
- `pyramiding`: scale-in config (open rules only)

### Condition Types

**1. Simple Comparison** — indicator vs fixed value
```json
{"indicator":"rsi14","op":"lt","value":30}
```

**2. Two-Indicator Comparison** — indicator vs another indicator
```json
{"indicator":"ema20","op":"gt","other":"ema50"}
```

**3. Cross Detection** — indicator crosses another
```json
{"indicator":"ema20","op":"crosses_above","other":"ema50"}
```

**4. Lookback** — reference previous bar values with `[n]`
```json
{"indicator":"rsi14","op":"gt","value":"rsi14[1]"}
```
`[0]` = current, `[1]` = 1 bar ago, up to `[10]`.

**5. Compound AND** — all conditions must be true
```json
{
  "all": [
    {"indicator":"rsi14","op":"lt","value":30},
    {"indicator":"price","op":"gt","other":"sma20"}
  ]
}
```

**6. Compound OR** — at least one must be true
```json
{
  "any": [
    {"indicator":"rsi14","op":"gt","value":80},
    {"indicator":"stoch_k","op":"gt","value":90}
  ]
}
```

**7. Profit Condition** — exit based on profit threshold
```json
{
  "profit": {
    "mode": "percent",
    "value": 5.0,
    "op": "ge"
  }
}
```
- `mode`: `"percent"` or `"absolute"`
- `op` (optional, default `"ge"`): gt, ge, lt, le, eq, ne
- `currency` (absolute mode only): `"quote"` (default) or `"asset"`

Can be nested inside `all`/`any` compounds.

**8. Position Age** — exit after duration
```json
{"position_age_secs":300}
```
Common values: 60 (1min), 300 (5min), 3600 (1hr), 86400 (1day).

### Operators

| Op | Meaning |
|----|---------|
| `lt` | < |
| `le` | <= |
| `gt` | > |
| `ge` | >= |
| `eq` | = |
| `ne` | != |
| `crosses_above` | was below, now above |
| `crosses_below` | was above, now below |

### Order Specification

```json
{
  "order": {
    "type": "market",
    "side": "long",
    "size": { "mode": "all" }
  }
}
```

- `side` — `"long"` or `"short"` (required for all rules, including close rules — must match the position side)

### Size Modes

| Mode | Value | Description |
|------|-------|-------------|
| `"all"` | — | All available capital (open) or entire position (close) |
| `"fixed_usd"` | number | Fixed USD amount (e.g., 1000) |
| `"percent"` | number | Percentage of capital (open) or position (close) |
| `"shares"` | number | Fixed asset quantity (e.g., 0.5 ETH). Also accepts `"fixed_asset"` |

Examples:
```json
{"mode":"all"}
{"mode":"fixed_usd","value":1000}
{"mode":"percent","value":50}
{"mode":"shares","value":0.1}
```

### Pyramiding (Scale-In)

Add to winning positions by allowing multiple entries on an open rule:
```json
{
  "pyramiding": {
    "enabled": true,
    "max_legs": 5
  }
}
```
- `enabled`: true/false
- `max_legs`: maximum number of position entries allowed

## Risk Manager

All fields are optional. Omit or set `"enabled": false` to disable.

```json
{
  "risk_manager": {
    "stop_loss": { ... },
    "take_profit": { ... },
    "trailing_stop": { ... },
    "cooldown": { ... },
    "per_bar_limits": [ ... ]
  }
}
```

### Leverage

Multiplier applied to position size for perpetual/margin trading.

```json
{"leverage": 20}
```

### Stop Loss

Exit when loss reaches a threshold.

**Percent** — exit when position loses N%:
```json
{"enabled":true,"mode":"percent","value":5.0}
```

**Absolute** — exit when loss reaches $N (quote currency):
```json
{"enabled":true,"mode":"absolute","value":100.0}
```

**ATR** — exit when loss exceeds N x ATR. Requires an ATR indicator defined in the strategy:
```json
{"enabled":true,"mode":"atr","value":1.5,"atr_indicator":"atr14"}
```

### Take Profit

Exit when profit reaches a target.

**Percent** — exit when position gains N%:
```json
{"enabled":true,"mode":"percent","value":10.0}
```

**Absolute** — exit when profit reaches $N (quote currency):
```json
{"enabled":true,"mode":"absolute","value":200.0}
```

**ATR** — exit when profit exceeds N x ATR:
```json
{"enabled":true,"mode":"atr","value":2.5,"atr_indicator":"atr14"}
```

### Trailing Stop

Lock in profits by moving stop loss as position becomes profitable.

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable trailing stop |
| `start_mode` | string | When to activate: `"atr"` or `"percent"` |
| `start_value` | number | Activation threshold (e.g., 1.0 = profit >= 1x ATR, or 5.0 = profit >= 5%) |
| `distance_mode` | string | How to trail: `"breakeven"`, `"atr"`, or `"percent"` |
| `distance_value` | number | Trail distance (0.0 for breakeven) |
| `atr_indicator` | string | ATR indicator name (default: `"atr"`) |

**Breakeven** — when profit >= 5%, move stop to entry price:
```json
{"enabled":true,"start_mode":"percent","start_value":5.0,"distance_mode":"breakeven","distance_value":0.0}
```

**ATR trailing** — when profit >= 1x ATR, trail at 0.5x ATR below price:
```json
{"enabled":true,"start_mode":"atr","start_value":1.0,"distance_mode":"atr","distance_value":0.5,"atr_indicator":"atr14"}
```

**Percent trailing** — when profit >= 10%, trail at 3% below price:
```json
{"enabled":true,"start_mode":"percent","start_value":10.0,"distance_mode":"percent","distance_value":3.0}
```

### Cooldown

Prevent rapid re-entry after closing a position.

```json
{"cooldown":{"entry_secs":300}}
```
Wait 300 seconds (5 min) before allowing new entry. Set to 0 to disable.

### Per-Bar Limits

Limit trades within specific timeframes. All configured limits are enforced with AND logic.

```json
{
  "per_bar_limits": [
    {"timeframe":"M1","max_trades":1},
    {"timeframe":"H1","max_trades":10}
  ]
}
```

Supported timeframes: M1, M5, M15, M30, H1, H4, D1

## Examples

### 1. Simple RSI Strategy

Buy when RSI oversold, sell when overbought, with percent-based risk management.

```json
{
  "name": "simple_rsi_strategy",
  "symbol": "ETH/USDC",
  "indicators": [
    {"type":"rsi","name":"rsi14","period":14,"timeframe":"M1"}
  ],
  "rules": [
    {
      "id": "buy_oversold",
      "intent": "open",
      "when": {"indicator":"rsi14","op":"lt","value":30},
      "order": {"type":"market","side":"long","size":{"mode":"all"}}
    },
    {
      "id": "sell_overbought",
      "intent": "close",
      "when": {"indicator":"rsi14","op":"gt","value":70},
      "order": {"type":"market","size":{"mode":"all"}}
    }
  ],
  "risk_manager": {
    "stop_loss": {"enabled":true,"mode":"percent","value":5.0},
    "take_profit": {"enabled":true,"mode":"percent","value":10.0},
    "leverage": 20
  }
}
```

### 2. EMA Crossover with ATR Risk

Trend following using EMA golden/death cross with ATR-based stops and trailing.

```json
{
  "name": "trend_following_atr",
  "symbol": "ETH/USDC",
  "indicators": [
    {"type":"ema","name":"ema20","period":20,"timeframe":"M1"},
    {"type":"ema","name":"ema50","period":50,"timeframe":"M1"},
    {"type":"atr","name":"atr14","timeframe":"M1","params":{"period":14}}
  ],
  "rules": [
    {
      "id": "golden_cross",
      "intent": "open",
      "when": {"indicator":"ema20","op":"crosses_above","other":"ema50"},
      "order": {"type":"market","side":"long","size":{"mode":"percent","value":100}}
    },
    {
      "id": "death_cross",
      "intent": "close",
      "when": {"indicator":"ema20","op":"crosses_below","other":"ema50"},
      "order": {"type":"market","size":{"mode":"all"}}
    }
  ],
  "risk_manager": {
    "stop_loss": {"enabled":true,"mode":"atr","value":1.5,"atr_indicator":"atr14"},
    "take_profit": {"enabled":true,"mode":"atr","value":2.5,"atr_indicator":"atr14"},
    "trailing_stop": {"enabled":true,"start_mode":"atr","start_value":1.0,"distance_mode":"breakeven","distance_value":0.0,"atr_indicator":"atr14"}
  }
}
```

### 3. MACD Crossover with Compound Conditions

Enter on bullish MACD cross + positive histogram, exit on bearish cross.

```json
{
  "name": "macd_crossover_strategy",
  "symbol": "ETH/USDC",
  "indicators": [
    {"type":"macd","name":"macd","timeframe":"M1","params":{"fast_period":12,"slow_period":26,"signal_period":9}}
  ],
  "rules": [
    {
      "id": "bullish_cross",
      "intent": "open",
      "when": {
        "all": [
          {"indicator":"macd.macd","op":"crosses_above","other":"macd.signal"},
          {"indicator":"macd.histogram","op":"gt","value":0}
        ]
      },
      "order": {"type":"market","side":"long","size":{"mode":"all"}}
    },
    {
      "id": "bearish_cross",
      "intent": "close",
      "when": {
        "all": [
          {"indicator":"macd.macd","op":"crosses_below","other":"macd.signal"},
          {"indicator":"macd.histogram","op":"lt","value":0}
        ]
      },
      "order": {"type":"market","size":{"mode":"all"}}
    }
  ]
}
```

### 4. Bollinger + StochRSI with Per-Bar Limits

Mean reversion: buy at lower band + oversold StochRSI, sell at upper band + overbought.

```json
{
  "name": "bollinger_breakout",
  "symbol": "ETH/USDC",
  "indicators": [
    {"type":"bollinger","name":"bb","timeframe":"M1","params":{"period":20,"std_dev":2.0}},
    {"type":"stochrsi","name":"stochrsi","timeframe":"M1","params":{"rsi_period":14,"stoch_period":14,"k_period":3,"d_period":3}}
  ],
  "rules": [
    {
      "id": "bb_lower_bounce",
      "intent": "open",
      "when": {
        "all": [
          {"indicator":"price","op":"lt","other":"bb.lower"},
          {"indicator":"stochrsi_k","op":"lt","value":20}
        ]
      },
      "order": {"type":"market","side":"long","size":{"mode":"all"}}
    },
    {
      "id": "bb_upper_sell",
      "intent": "close",
      "when": {
        "all": [
          {"indicator":"price","op":"gt","other":"bb.upper"},
          {"indicator":"stochrsi_k","op":"gt","value":80}
        ]
      },
      "order": {"type":"market","size":{"mode":"all"}}
    }
  ],
  "risk_manager": {
    "per_bar_limits": [{"timeframe":"M1","max_trades":1}]
  }
}
```
