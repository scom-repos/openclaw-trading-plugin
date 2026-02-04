---
name: strategy-indicators
description: Reference for all strategy indicator types and their parameters. Use when constructing the indicators array for a trading strategy JSON.
---

# Strategy Indicators Reference

## Common Structure

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

## Indicator Types

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

## Current Price

Use `"price"` (or `"current_price"`) in rules to reference the live tick price. No indicator definition needed.
```json
{"indicator":"price","op":"gt","other":"sma20"}
```

## Lookback Syntax

Access previous bar values with `[n]` (up to 10 bars back):
- `rsi14[1]` — RSI value 1 bar ago
- `ohlc_m1.high[1]` — previous bar's high
- `macd_signal[2]` — signal line 2 bars ago
- `bb_lower[1]` — lower band 1 bar ago

## Output Reference Table

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
