---
name: paper-trade
description: Create a paper trading agent with a strategy. Use when the user wants to create a paper trade, set up a paper trading agent, start simulated trading, or test a trading strategy. Guides through key setup, access check, pair selection, strategy construction, agent creation, bot notification, and verification.
---

# Paper Trade Agent Creation

Follow these steps to create a paper trading agent.

## Step 1 — Ensure Nostr keys exist
Call `get_or_create_nostr_keys` with no arguments. Do not display the private key or nsec unless explicitly asked.

## Step 2 — Check trading access
Call `check_trading_access`. If the user does not have access, call `request_trading_access` with their wallet address (ask if needed). Tell them an admin must approve at https://agent.openswap.xyz/admin/waitlist. Do NOT proceed until they have access.

## Step 3 — Build the strategy
Ask the user what trading strategy they want. Construct a strategy object with:
- **indicators**: technical indicators (EMA, RSI, MACD, Bollinger, etc.) with type, name, period, timeframe, and params
- **rules**: entry (intent:"open") and exit (intent:"close") rules with conditions and order specs
- **risk_manager**: stop_loss, take_profit, trailing_stop, cooldown, per_bar_limits

For detailed schema references, see: `strategy-indicators`, `strategy-rules`, `strategy-risk`, and `strategy-examples` skills.

If the user says something general like "EMA crossover", construct a reasonable default. Example for EMA 20/50 crossover on M15:
```json
{
  "name": "ema_crossover",
  "symbol": "ETH/USDC",
  "indicators": [
    {"type":"ema","name":"ema_20_M15","period":20,"timeframe":"M15"},
    {"type":"ema","name":"ema_50_M15","period":50,"timeframe":"M15"}
  ],
  "rules": [
    {"id":"open_long","intent":"open","when":{"indicator":"ema_20_M15","op":"crosses_above","other":"ema_50_M15"},"order":{"type":"market","side":"long","size":{"mode":"all"}}},
    {"id":"close_long","intent":"close","when":{"indicator":"ema_20_M15","op":"crosses_below","other":"ema_50_M15"},"order":{"type":"market","size":{"mode":"all"}}}
  ],
  "risk_manager":{"stop_loss":{"enabled":true,"mode":"percent","value":5},"take_profit":{"enabled":true,"mode":"percent","value":10},"cooldown":{"entry_secs":60}}
}
```

## Step 4 — Confirm before creating
Present a summary of what will be created: agent name, trading pair, initial capital, strategy name, indicators, entry/exit rules, and risk settings. Ask the user to confirm before proceeding. Do NOT call `create_agent` until the user explicitly confirms.

## Step 5 — Create the agent
Call `create_agent` with name, initialCapital, the strategy object, and `simulationConfig`. You must provide `simulationConfig` explicitly — use these defaults unless the user specifies otherwise: spot → `{"asset_type":"crypto","protocol":"uniswap"}`, perp → `{"asset_type":"crypto","protocol":"hyperliquid"}`, stocks → `{"asset_type":"stocks"}`. Save the returned agentId.

## Step 6 — Notify the trading bot
Call `notify_trading_bot` with agentId, name, initialCapital, pairSymbol, the same strategy, and the same `simulationConfig`.

## Step 7 — Log the creation
Call `log_agent_action` with agentId and action "create".

## Step 8 — Verify
Call `get_agent` with agentId. Present a summary: agent ID, name, pair, capital, and strategy name. Include the agent URL from the `create_agent` response (`agentUrl`).
