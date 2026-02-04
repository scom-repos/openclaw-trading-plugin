# trading-plugin

OpenClaw plugin that exposes trading data APIs as agent tools.

## Tools

### `get_token_prices`
Get current live prices of all tokens. No parameters.

### `get_ohlc`
Get OHLC candle data for a specific symbol.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | yes | Trading pair, e.g. `BTC/USDC` |
| `from` | number | no | Start timestamp (Unix seconds) |
| `to` | number | no | End timestamp (Unix seconds) |
| `resolution` | string | no | One of `1`, `5`, `15`, `30`, `60`, `240`, `1D`. Default `60` |

## Install

```bash
npm install
openclaw plugins install -l .
openclaw gateway restart
```

## Configuration

In your OpenClaw config, set `baseUrl` to override the default API endpoint (`https://agent02.decom.dev`).
