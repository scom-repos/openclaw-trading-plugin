# trading-plugin

OpenClaw plugin for trading data, paper trading, live trading (Hyperliquid), and backtesting.

## Install

```bash
npm install
openclaw plugins install -l .
openclaw gateway restart
```

## Configuration

Config keys defined in `openclaw.plugin.json`. Set them in `~/.openclaw/config.json5`:

```json5
{
  plugins: {
    entries: {
      "trading-plugin": {
        config: {
          baseUrl: "https://agent02.decom.dev",
          tradingBotUrl: "https://c8fdf099a1934bcabb0ca29685ef945f8ed30148-8081.dstack-pha-prod9.phala.network",
          nostrPrivateKey: "${NOSTR_PRIVATE_KEY}",
          walletAgentUrl: "https://8d8078ecb55660bce38d6f042b1eef9d70cb0dac-8081.dstack-pha-prod7.phala.network/wallet-agent",
          settlementEngineUrl: "https://78ac0594e0a4d247df08bfbfdc5c8337548693c9-8081.dstack-pha-prod7.phala.network/settlement-engine",
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

### Access Control

| Tool                       | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `check_trading_access`     | Check if the current user is whitelisted for trading |
| `request_trading_access`   | Request trading access (requires admin approval)     |

### Trading

| Tool                       | Description                                |
| -------------------------- | ------------------------------------------ |
| `get_or_create_nostr_keys` | Generate or import Nostr keypair for auth  |
| `get_trading_pairs`        | List available trading pairs               |
| `create_agent`             | Create a trading agent (paper or live)     |
| `notify_trading_bot`       | Send agent details to trading bot          |
| `log_agent_action`         | Log an agent action for auditing           |
| `get_agent`                | Get agent details by ID                    |

### Live Trading (Hyperliquid)

| Tool                  | Description                                        |
| --------------------- | -------------------------------------------------- |
| `store_wallet_in_tee` | Store agent wallet private key in TEE wallet agent |
| `register_wallet`     | Register agent wallet in the backend               |
| `register_trader`     | Register trader in the settlement engine           |

### Backtesting

| Tool                  | Description                           |
| --------------------- | ------------------------------------- |
| `create_backtest`     | Submit a backtest job                 |
| `get_backtests`       | List backtests for an agent           |
| `get_backtest_status` | Check backtest job status             |
| `get_backtest_job`    | Poll backtest job progress and status |
| `get_backtest_result` | Get completed backtest results        |
