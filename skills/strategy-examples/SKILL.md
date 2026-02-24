---
name: strategy-examples
description: Strategy config structure and canonical examples copied from the official Trading Bot API doc. Use as the primary reference when building strategy_config JSON for agent creation or updates.
---

# Strategy Config Reference

## Strategy Config Structure

The `strategy_config` object is a required field when creating or updating a trading agent. It defines the trading strategy the agent will execute.

**Top-level fields:**
- `name` (string, required): Strategy name identifier
- `symbol` (string, required): Trading pair, e.g. `"ETH/USDC"` or stock symbol like `"AAPL"`
- `indicators` (array, required): Technical indicators used by the strategy. See `strategy-indicators` skill for all types.
- `rules` (array, required): Entry/exit rules with conditions and orders. See `strategy-rules` skill for all condition types.
- `risk_manager` (object, optional): Stop loss, take profit, trailing stop, cooldown, per-bar limits. See `strategy-risk` skill for all options.

## 1. Spot Paper Trading (Crypto with Uniswap)

RSI-based momentum strategy for spot paper trading. Uses `simulation_config` with `asset_type: "crypto"` and `protocol: "uniswap"`.

```json
{
  "name": "momentum_rsi",
  "symbol": "ETH/USDC",
  "indicators": [
    {
      "type": "rsi",
      "name": "rsi14",
      "period": 14,
      "timeframe": "M1"
    }
  ],
  "rules": [
    {
      "id": "buy_oversold",
      "intent": "open",
      "when": {
        "indicator": "rsi14",
        "op": "lt",
        "value": 30
      },
      "order": {
        "type": "market",
        "size": { "mode": "percent", "value": 50 }
      }
    }
  ],
  "risk_manager": {
    "stop_loss": { "enabled": true, "mode": "percent", "value": 5.0 }
  }
}
```

## 2. Perp Live Trading (with Leverage)

RSI-based perp strategy for live trading on Hyperliquid. Paired with `leverage`, `settlement_config`, and `simulation_config` with `protocol: "hyperliquid"`.

```json
{
  "name": "momentum_rsi",
  "symbol": "ETH/USDC",
  "indicators": [
    {
      "type": "rsi",
      "name": "rsi14",
      "period": 14,
      "timeframe": "M1"
    }
  ],
  "rules": [
    {
      "id": "buy_oversold",
      "intent": "open",
      "when": {
        "indicator": "rsi14",
        "op": "lt",
        "value": 30
      },
      "order": {
        "type": "market",
        "size": { "mode": "percent", "value": 50 }
      }
    }
  ]
}
```

## 3. Stocks Simulation (Paper Mode)

Stock trading with RSI strategy. Uses `simulation_config` with `asset_type: "stocks"` (no `protocol` field needed).

```json
{
  "name": "stock_momentum",
  "symbol": "AAPL",
  "indicators": [
    {
      "type": "rsi",
      "name": "rsi14",
      "period": 14,
      "timeframe": "M1"
    }
  ],
  "rules": [
    {
      "id": "buy_oversold",
      "intent": "open",
      "when": {
        "indicator": "rsi14",
        "op": "lt",
        "value": 30
      },
      "order": {
        "type": "market",
        "size": { "mode": "percent", "value": 50 }
      }
    }
  ]
}
```

## 4. Strategy Update (MACD Crossover)

MACD crossover with compound conditions, used when updating an existing agent's strategy via PUT endpoint.

```json
{
  "name": "macd_update",
  "symbol": "ETH/USDC",
  "indicators": [
    { "type": "macd", "name": "macd", "timeframe": "M1", "params": { "fast_period": 12, "slow_period": 26, "signal_period": 9 } }
  ],
  "rules": [
    {
      "id": "macd_open",
      "intent": "open",
      "when": {
        "all": [
          { "indicator": "macd.macd", "op": "crosses_above", "other": "macd.signal" },
          { "indicator": "macd.histogram", "op": "gt", "value": 0 }
        ]
      },
      "order": { "type": "market", "size": { "mode": "percent", "value": 100 } }
    }
  ]
}
```

## 5. Updated RSI Strategy (Adjusted Thresholds)

Example of a strategy_config sent via PUT to update an existing agent with modified thresholds and size.

```json
{
  "name": "updated_rsi",
  "symbol": "ETH/USDC",
  "indicators": [
    { "type": "rsi", "name": "rsi14", "period": 14, "timeframe": "M1" }
  ],
  "rules": [
    {
      "id": "buy_oversold",
      "intent": "open",
      "when": { "indicator": "rsi14", "op": "lt", "value": 25 },
      "order": { "type": "market", "size": { "mode": "percent", "value": 75 } }
    }
  ]
}
```

## Simulation Config

Required for `mode="paper"` to specify the simulation type.

**Crypto with Uniswap** (default for `market_type="spot"`):
```json
{
  "asset_type": "crypto",
  "protocol": "uniswap"
}
```

**Crypto with Hyperliquid** (default for `market_type="perp"`):
```json
{
  "asset_type": "crypto",
  "protocol": "hyperliquid"
}
```

**Stocks** (executes immediately without indexer):
```json
{
  "asset_type": "stocks"
}
```

## Settlement Config (Hyperliquid)

Required when `mode="live"` for actual trading with settlement integration. Not needed for `mode="paper"`.

```json
{
  "eth_address": "0x1234567890123456789012345678901234567890",
  "symbol": "ETH/USDC",
  "chain_id": 998,
  "protocol": "hyperliquid",
  "buy_limit_usd": 10000.0
}
```

- `chain_id`: 998 for testnet, 999 for mainnet
