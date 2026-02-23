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
Call `get_or_create_nostr_keys` with `checkOnly: true`.
- **If `exists: true`:** Key is already set up. Proceed silently to Step 2.
- **If `exists: false`:** Ask the user if they want to generate a new Nostr identity. If they confirm, call `get_or_create_nostr_keys` (without `checkOnly`). Tell them a new identity was generated and saved to `~/.openclaw/.env`. Do not display the npub or nsec unless the user asks.

## Step 2 — Check trading access
Call `check_trading_access`. If the user does not have access, call `request_trading_access` with their wallet address (ask if needed). Tell them an admin must approve at https://agent.openswap.xyz/admin/waitlist. Do NOT proceed until they have access.

## Step 3 — Check for existing wallets
Call `list_wallets`. Filter the results to active wallets where `walletType` is `"hyperliquid_agent"`.

- **If matching wallets found:** Present them to the user (show name, walletAddress, masterWalletAddress, network). Ask which one to reuse. Save the chosen `walletId`, `walletAddress`, and `masterWalletAddress`, then **skip to Step 7**.
- **If no matching wallets:** Tell the user they need to set up a new wallet and continue to Step 4.

## Step 4 — User creates API wallet on Hyperliquid
**This is a manual step.** Ask the user if they already have a Hyperliquid API wallet private key.
- If yes: note their private key and proceed.
- If no: guide them through these steps:
  1. Go to Hyperliquid (testnet: app.hyperliquid-testnet.xyz, mainnet: app.hyperliquid.xyz)
  2. Connect their master wallet
  3. Click **More** > **API** (or visit the /API page)
  4. Click **Create API Wallet**, enter a name, click **Generate**
  5. **Copy the private key immediately** (shown only once)
  6. Set validity to MAX (180 days), click **Authorize**, sign the message

Ask the user to confirm they have the API wallet private key and their master wallet address (0x...).

## Step 5 — Store wallet in TEE
Call `store_wallet_in_tee` with the agent wallet private key and master wallet address.
Save the returned `agentWalletAddress`.

## Step 6 — Register wallet in backend
Call `register_wallet` with `agentWalletAddress` and `masterWalletAddress`.
Save the returned `walletId`.

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
