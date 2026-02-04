---
name: strategy-examples
description: Complete strategy JSON examples covering common patterns. Use as templates when building trading strategies.
---

# Strategy Examples

## 1. Simple RSI Strategy

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
      "order": {"type":"market","size":{"mode":"all"}}
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
    "take_profit": {"enabled":true,"mode":"percent","value":10.0}
  }
}
```

## 2. EMA Crossover with ATR Risk

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
      "order": {"type":"market","size":{"mode":"percent","value":100}}
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

## 3. MACD Crossover with Compound Conditions

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
      "order": {"type":"market","size":{"mode":"all"}}
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

## 4. Bollinger + StochRSI with Per-Bar Limits

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
      "order": {"type":"market","size":{"mode":"all"}}
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
