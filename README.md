# trading-plugin

OpenClaw plugin for trading data, paper trading, and backtesting.

## Install

```bash
npm install
openclaw plugins install -l .
openclaw gateway restart
```

## Configuration

Three config keys defined in `openclaw.plugin.json`. Set them in `~/.openclaw/config.json5`:

```json5
{
  plugins: {
    entries: {
      "trading-plugin": {
        config: {
          baseUrl: "https://agent02.decom.dev",
          tradingBotUrl: "https://c8fdf099a1934bcabb0ca29685ef945f8ed30148-8081.dstack-pha-prod9.phala.network",
          nostrPrivateKey: "${NOSTR_PRIVATE_KEY}",
        },
      },
    },
  },
}
```

## Tools

### Market Data

| Tool               | Description                       |
| ------------------ | --------------------------------- |
| `get_token_prices` | Get live prices of all tokens     |
| `get_ohlc`         | Get OHLC candle data for a symbol |

### Paper Trading

| Tool                       | Description                               |
| -------------------------- | ----------------------------------------- |
| `get_or_create_nostr_keys` | Generate or import Nostr keypair for auth |
| `get_trading_pairs`        | List available trading pairs              |
| `create_agent`             | Create a paper trading agent              |
| `notify_trading_bot`       | Send agent details to trading bot         |
| `log_agent_action`         | Log an agent action for auditing          |
| `get_agent`                | Get agent details by ID                   |

### Backtesting

| Tool                  | Description                    |
| --------------------- | ------------------------------ |
| `create_backtest`     | Submit a backtest job          |
| `get_backtests`       | List backtests for an agent    |
| `get_backtest_status` | Check backtest job status      |
| `get_backtest_result` | Get completed backtest results |
