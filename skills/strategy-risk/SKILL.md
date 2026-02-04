---
name: strategy-risk
description: Reference for strategy risk manager configuration — stop loss, take profit, trailing stop, cooldown, and per-bar limits. Use when constructing the risk_manager object for a trading strategy JSON.
---

# Strategy Risk Manager Reference

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

## Stop Loss

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

## Take Profit

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

## Trailing Stop

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

## Cooldown

Prevent rapid re-entry after closing a position.

```json
{"cooldown":{"entry_secs":300}}
```
Wait 300 seconds (5 min) before allowing new entry. Set to 0 to disable.

## Per-Bar Limits

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
