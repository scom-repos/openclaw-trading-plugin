---
name: live-trade
description: Create a live trading agent on Hyperliquid. Use when the user wants to start live trading, deploy a real trading agent, or trade on Hyperliquid testnet/mainnet.
---

# Live Trading Agent Creation (Hyperliquid)

## Prerequisites
The user needs:
- A master wallet (MetaMask etc.) connected to Hyperliquid
- Funds deposited on Hyperliquid (testnet or mainnet)

## Step 1 — Ensure Nostr keys
Call `get_or_create_nostr_keys`. Do not display the private key or nsec unless asked.

## Step 2 — Generate or import agent wallet
Ask if the user already has an agent wallet private key (ETH_AGENT_PRIVATE_KEY).
- If no: call `generate_agent_wallet` to create one.
- If yes: note their private key and proceed.

## Step 3 — User authorizes agent wallet on Hyperliquid
**This is a manual step.** Tell the user:
1. Go to Hyperliquid (testnet: app.hyperliquid-testnet.xyz, mainnet: app.hyperliquid.xyz)
2. Connect their master wallet
3. Go to Settings > API / Agent Wallets > Authorize Agent
4. Paste the agent wallet address
5. Approve the transaction
Ask the user to confirm they have authorized the agent wallet before proceeding.
Also ask for their master wallet address (0x...).

## Step 4 — Store wallet in TEE
Call `store_wallet_in_tee` with the agent wallet private key and master wallet address.
Save the returned `agentWalletAddress`.

## Step 5 — Register wallet in backend
Call `register_wallet` with `agentWalletAddress` and `masterWalletAddress`.
Save the returned `walletId`.

## Step 6 — Choose trading pair
Ask the user which pair they want to trade (e.g. "ETH/USDC"). No need to call `get_trading_pairs` — the symbol is passed directly.

## Step 7 — Build the strategy
Same as paper-trade: ask user what strategy, construct with indicators/rules/risk_manager.
Reference `strategy-indicators`, `strategy-rules`, `strategy-risk`, `strategy-examples` skills.

## Step 8 — Confirm before creating
Present summary: agent name, pair, capital, leverage, strategy, master wallet, agent wallet.
Ask for initial capital and leverage. Do NOT proceed until user confirms.

## Step 9 — Create the agent (live mode)
Call `create_agent` with:
- name, initialCapital, strategy
- mode: "live", marketType: "perp"
- leverage, walletId, walletAddress, symbol
- protocol: "hyperliquid", chainId (998 for testnet)
- settlementConfig: { eth_address: masterWalletAddress, agent_address: agentWalletAddress }
Save returned agentId.

## Step 10 — Notify the trading bot
Call `notify_trading_bot` with agentId, name, initialCapital, pairSymbol, strategy, mode "live", marketType "perp",
leverage, and settlementConfig (JSON string with eth_address, agent_address, symbol, chain_id, protocol, buy_limit_usd).

## Step 11 — Register trader in settlement engine
Call `register_trader` with agentId, masterWalletAddress, agentWalletAddress, symbol, chainId, protocol, buyLimitUsd.

## Step 12 — Log & verify
Call `log_agent_action` with agentId and action "create".
Call `get_agent` with agentId. Present summary: agent ID, name, pair, capital, leverage, wallet addresses.
