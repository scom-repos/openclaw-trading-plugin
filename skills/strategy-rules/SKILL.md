---
name: strategy-rules
description: Reference for strategy rule structure, conditions, orders, and pyramiding. Use when constructing the rules array for a trading strategy JSON.
---

# Strategy Rules Reference

## Rule Structure

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

## Condition Types

### 1. Simple Comparison — indicator vs fixed value
```json
{"indicator":"rsi14","op":"lt","value":30}
```

### 2. Two-Indicator Comparison — indicator vs another indicator
```json
{"indicator":"ema20","op":"gt","other":"ema50"}
```

### 3. Cross Detection — indicator crosses another
```json
{"indicator":"ema20","op":"crosses_above","other":"ema50"}
```

### 4. Lookback — reference previous bar values with `[n]`
```json
{"indicator":"rsi14","op":"gt","value":"rsi14[1]"}
```
`[0]` = current, `[1]` = 1 bar ago, up to `[10]`.

### 5. Compound AND — all conditions must be true
```json
{
  "all": [
    {"indicator":"rsi14","op":"lt","value":30},
    {"indicator":"price","op":"gt","other":"sma20"}
  ]
}
```

### 6. Compound OR — at least one must be true
```json
{
  "any": [
    {"indicator":"rsi14","op":"gt","value":80},
    {"indicator":"stoch_k","op":"gt","value":90}
  ]
}
```

### 7. Profit Condition — exit based on profit threshold
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

### 8. Position Age — exit after duration
```json
{"position_age_secs":300}
```
Common values: 60 (1min), 300 (5min), 3600 (1hr), 86400 (1day).

## Operators

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

## Order Specification

```json
{
  "order": {
    "type": "market",
    "side": "long",
    "size": { "mode": "all" }
  }
}
```

- `side` — `"long"` or `"short"` (required for open rules)

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

## Pyramiding (Scale-In)

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
