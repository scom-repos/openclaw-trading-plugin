---
name: backtest
description: Run a backtest for a trading agent. Use when the user wants to backtest a strategy, test historical performance, or run a simulation on past data. Guides through key setup, agent selection, parameter configuration, submission, and status checking.
---

# Backtest Agent Strategy

Follow these steps to run a backtest.

## Step 1 — Ensure Nostr keys exist
Call `get_or_create_nostr_keys` with no arguments. Do not display the private key or nsec unless explicitly asked.

## Step 2 — Identify the agent
If the user specified an agent ID, use it. Otherwise ask the user for the agent ID. Call `get_agent` to fetch the agent details (name, strategy, capital).

## Step 3 — Set backtest parameters
Ask the user for:
- **Time range**: start and end time (ISO datetime or unix timestamp)
- **Initial capital**: or default to the agent's existing capital
- **Protocol fee** (optional): fee override
- **Gas fee** (optional): fee override

## Step 4 — Optionally override strategy
If the user wants to test a different strategy, build a new one (indicators, rules, risk_manager). For detailed schema references, see: `strategy-indicators`, `strategy-rules`, `strategy-risk`, and `strategy-examples` skills. Otherwise use the agent's existing strategy.

## Step 5 — Confirm before submitting
Present a summary: agent name/ID, time range, initial capital, fees (if any), and strategy (existing or override). Ask the user to confirm before proceeding. Do NOT call `create_backtest` until the user explicitly confirms.

## Step 6 — Submit the backtest
Call `create_backtest` with agentId, initialCapital, startTime, endTime, and optional protocolFee, gasFee, strategy. Save the returned `jobId`.

## Step 7 — Check status and fetch results
Call `get_backtest_status` with the jobId.
- If status is **Completed**: call `get_backtest_result` with the jobId and present a summary including portfolio value, return %, win rate, max drawdown, Sharpe ratio, and trade count.
- If still running: inform the user of progress and suggest checking again later.

## Step 8 — Show backtest history
Call `get_backtests` with the agentId to list past backtests for context.
