import { Type } from "@sinclair/typebox";
import { Keys, Nip19, Signer, Crypto } from "@scom/scom-signer";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Strategy schema ────────────────────────────────────────────────

const IndicatorConfig = Type.Object({
  type: Type.String({ description: 'Indicator type: "rsi","sma","ema","macd","stochrsi","stochastic","bollinger","atr","renko","renko_atr","ohlc"' }),
  name: Type.String({ description: 'Unique name referenced in rules, e.g. "ema_20_M15"' }),
  period: Type.Optional(Type.Number({ description: "Period/length (required for most)" })),
  timeframe: Type.Optional(Type.String({ description: '"M1","M5","M15","M30","H1","H4","D1"' })),
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown(), {
    description: 'Extra params. EMA/SMA/RSI: {period}. MACD: {fast_period,slow_period,signal_period}. Bollinger: {period,std_dev}. StochRSI: {rsi_period,stoch_period,k_period,d_period}. ATR: {period,multiplier}. Renko: {brick_size}. RenkoATR: {atr_period,atr_multiplier}.',
  })),
});

const SizeConfig = Type.Object({
  mode: Type.String({ description: '"all","fixed_usd","percent","shares","fixed_asset"' }),
  value: Type.Optional(Type.Number()),
});

const OrderConfig = Type.Object({
  type: Type.String({ description: '"market"' }),
  side: Type.Optional(Type.String({ description: '"long" or "short"' })),
  size: Type.Optional(SizeConfig),
});

const PyramidingConfig = Type.Object({
  enabled: Type.Boolean(),
  max_legs: Type.Number(),
});

const RuleConfig = Type.Object({
  id: Type.String({ description: "Unique rule ID" }),
  intent: Type.String({ description: '"open" or "close"' }),
  when: Type.Unknown({
    description: 'Condition. Simple: {"indicator":"rsi14","op":"lt","value":30}. Cross: {"indicator":"ema20","op":"crosses_above","other":"ema50"}. AND: {"all":[...]}. OR: {"any":[...]}. Profit: {"profit":{"mode":"percent","value":5}}. Age: {"position_age_secs":300}. Ops: lt,le,gt,ge,eq,ne,crosses_above,crosses_below.',
  }),
  order: Type.Optional(OrderConfig),
  pyramiding: Type.Optional(PyramidingConfig),
});

const StopLossTakeProfit = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  mode: Type.Optional(Type.String({ description: '"percent","absolute","atr"' })),
  value: Type.Optional(Type.Number()),
  atr_indicator: Type.Optional(Type.String()),
});

const TrailingStopConfig = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  start_mode: Type.Optional(Type.String({ description: '"atr" or "percent"' })),
  start_value: Type.Optional(Type.Number()),
  distance_mode: Type.Optional(Type.String({ description: '"breakeven","atr","percent"' })),
  distance_value: Type.Optional(Type.Number()),
  atr_indicator: Type.Optional(Type.String()),
});

const PerBarLimit = Type.Object({
  timeframe: Type.String({ description: '"M1","M5","M15","M30","H1","H4","D1"' }),
  max_trades: Type.Number(),
});

const RiskManagerConfig = Type.Object({
  stop_loss: Type.Optional(StopLossTakeProfit),
  take_profit: Type.Optional(StopLossTakeProfit),
  trailing_stop: Type.Optional(TrailingStopConfig),
  cooldown: Type.Optional(Type.Object({ entry_secs: Type.Optional(Type.Number()) })),
  per_bar_limits: Type.Optional(Type.Array(PerBarLimit)),
  leverage: Type.Optional(Type.Number({ description: "Leverage multiplier" })),
});

const Strategy = Type.Object({
  name: Type.String({ description: "Strategy name" }),
  symbol: Type.String({ description: 'Trading pair, e.g. "ETH/USDC"' }),
  indicators: Type.Array(IndicatorConfig),
  rules: Type.Array(RuleConfig),
  risk_manager: Type.Optional(RiskManagerConfig),
});

const SimulationConfig = Type.Object({
  asset_type: Type.String({ description: '"crypto" or "stocks"' }),
  protocol: Type.Optional(Type.String({ description: '"uniswap" or "hyperliquid" (required when asset_type is "crypto")' })),
});

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://agent02.decom.dev";
const DEFAULT_BOT_URL =
  "https://c8fdf099a1934bcabb0ca29685ef945f8ed30148-8081.dstack-pha-prod9.phala.network/trading-bot-demo";
const DEFAULT_BACKTEST_ENGINE_URL = "https://mcp-backtest01.decom.dev";
const DEFAULT_WALLET_AGENT_URL =
  "https://8d8078ecb55660bce38d6f042b1eef9d70cb0dac-8081.dstack-pha-prod7.phala.network/wallet-agent";
const DEFAULT_SETTLEMENT_ENGINE_URL =
  "https://78ac0594e0a4d247df08bfbfdc5c8337548693c9-8081.dstack-pha-prod7.phala.network/settlement-engine";

function loadKeys(config: any): {
  privateKey: string;
  publicKey: string;
  npub: string;
} {
  const pk = config?.nostrPrivateKey || undefined;

  if (!pk)
    throw new Error(
      "No Nostr key configured. Run get_or_create_nostr_keys first.",
    );

  const publicKey = Keys.getPublicKey(pk);
  return { privateKey: pk, publicKey, npub: Nip19.npubEncode(publicKey) };
}

function getAuthHeader(pubkey: string, privateKey: string): string {
  const sig = Signer.getSignature(
    { pubkey },
    privateKey,
    { pubkey: "string" } as const,
  );
  return `Bearer ${pubkey}:${sig}`;
}

function persistKeyToConfig(privateKey: string): boolean {
  const cfgPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  let cfg: any = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  } catch {}

  const entry = ((cfg.plugins ??= {}).entries ??= {})["trading-plugin"] ??= {};
  const config = (entry.config ??= {});
  if (config.nostrPrivateKey) return false;

  config.nostrPrivateKey = privateKey;
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  return true;
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export default function (api: any) {
  const pluginConfig = api.config?.plugins?.entries?.["trading-plugin"]?.config ?? api.config ?? {};
  const baseUrl: string = pluginConfig.baseUrl ?? DEFAULT_BASE_URL;
  const tradingBotUrl: string = pluginConfig.tradingBotUrl ?? DEFAULT_BOT_URL;
  const backtestEngineUrl: string = pluginConfig.backtestEngineUrl ?? DEFAULT_BACKTEST_ENGINE_URL;
  const walletAgentUrl: string = pluginConfig.walletAgentUrl ?? DEFAULT_WALLET_AGENT_URL;
  const settlementEngineUrl: string = pluginConfig.settlementEngineUrl ?? DEFAULT_SETTLEMENT_ENGINE_URL;

  // ── Existing tools ──────────────────────────────────────────────

  api.registerTool({
    name: "get_token_prices",
    description: "Get current live prices of all tokens",
    parameters: Type.Object({}),
    async execute() {
      const res = await fetch(`${baseUrl}/api/token-prices`);
      if (!res.ok) throw new Error(`token-prices failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "get_ohlc",
    description: "Get OHLC candle data for a specific symbol",
    parameters: Type.Object({
      symbol: Type.String({ description: 'Trading pair, e.g. "BTC/USDC"' }),
      from: Type.Optional(
        Type.Number({ description: "Start timestamp (Unix seconds)" }),
      ),
      to: Type.Optional(
        Type.Number({ description: "End timestamp (Unix seconds)" }),
      ),
      resolution: Type.Optional(
        Type.String({
          description:
            'Candle resolution. One of "1", "5", "15", "30", "60", "240", "1D"',
          default: "60",
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        symbol: string;
        from?: number;
        to?: number;
        resolution?: string;
      },
    ) {
      const qs = new URLSearchParams({ symbol: params.symbol });
      if (params.from != null) qs.set("from", String(params.from));
      if (params.to != null) qs.set("to", String(params.to));
      if (params.resolution) qs.set("resolution", params.resolution);

      const res = await fetch(`${baseUrl}/api/ohlc?${qs}`);
      if (!res.ok) throw new Error(`ohlc failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  // ── Paper-trade tools ───────────────────────────────────────────

  api.registerTool({
    name: "get_or_create_nostr_keys",
    description:
      "Get existing or generate new Nostr keypair for agent authentication",
    parameters: Type.Object({
      privateKey: Type.Optional(
        Type.String({ description: "Existing hex private key to import" }),
      ),
      checkOnly: Type.Optional(
        Type.Boolean({ description: "When true, only check if a key exists without generating one" }),
      ),
    }),
    async execute(_id: string, params: { privateKey?: string; checkOnly?: boolean }) {
      let pk = pluginConfig.nostrPrivateKey;
      const fromConfig = !!pk;

      if (fromConfig) {
        const publicKey = Keys.getPublicKey(pk);
        return textResult({
          exists: true,
          privateKey: pk,
          publicKey,
          nsec: Nip19.nsecEncode(pk),
          npub: Nip19.npubEncode(publicKey),
          persisted: false,
        });
      }

      if (params.checkOnly) {
        return textResult({ exists: false });
      }

      pk = params.privateKey ?? Keys.generatePrivateKey();
      const persisted = persistKeyToConfig(pk);
      const publicKey = Keys.getPublicKey(pk);
      return textResult({
        exists: true,
        privateKey: pk,
        publicKey,
        nsec: Nip19.nsecEncode(pk),
        npub: Nip19.npubEncode(publicKey),
        persisted,
      });
    },
  });

  api.registerTool({
    name: "get_nostr_identity",
    description: "Get the user's Nostr npub and public key (read-only, no side effects)",
    parameters: Type.Object({}),
    async execute() {
      const pk = pluginConfig.nostrPrivateKey;
      if (!pk) {
        return textResult({ exists: false });
      }
      const publicKey = Keys.getPublicKey(pk);
      return textResult({ npub: Nip19.npubEncode(publicKey), publicKey });
    },
  });

  api.registerTool({
    name: "check_trading_access",
    description: "Check if the current user has trading access (is whitelisted)",
    parameters: Type.Object({}),
    async execute() {
      const { npub } = loadKeys(pluginConfig);
      const res = await fetch(`${baseUrl}/api/is-whitelisted/${npub}`);
      if (!res.ok) throw new Error(`check_trading_access failed: ${res.status}`);
      const data = await res.json();
      return textResult({
        npub,
        hasAccess: data.isWhitelisted,
        message: data.isWhitelisted
          ? "You have trading access."
          : "You do not have trading access. Use request_trading_access to request it.",
      });
    },
  });

  api.registerTool({
    name: "request_trading_access",
    description: "Request trading access (waitlist). A whitelisted user or admin must approve at https://agent.openswap.xyz/admin/waitlist",
    parameters: Type.Object({
      walletAddress: Type.Optional(Type.String({ description: "Your wallet address (optional)" })),
    }),
    async execute(_id: string, params: { walletAddress?: string }) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);
      const res = await fetch(`${baseUrl}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ npub, walletAddress: params.walletAddress }),
      });
      if (!res.ok) throw new Error(`request_trading_access failed: ${res.status} ${await res.text()}`);
      return textResult({
        success: true,
        message: "Access requested. A whitelisted user or admin must approve at https://agent.openswap.xyz/admin/waitlist",
      });
    },
  });

  api.registerTool({
    name: "list_wallets",
    description: "List all wallets registered for the current user",
    parameters: Type.Object({}),
    async execute() {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);
      const res = await fetch(`${baseUrl}/api/wallets?npub=${npub}`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error(`list_wallets failed: ${res.status}`);
      const data = await res.json();
      const wallets = (data.data || []).map((w: any) => ({
        walletId: w.id,
        name: w.name,
        walletAddress: w.wallet_address,
        masterWalletAddress: w.master_wallet_address,
        walletType: w.wallet_type,
        network: w.hyperliquid_network,
        isActive: w.is_active,
      }));
      return textResult({ npub, wallets });
    },
  });

  // ── Live-trade tools ──────────────────────────────────────────

  api.registerTool({
    name: "store_wallet_in_tee",
    description: "Store an agent wallet private key in the TEE-backed wallet agent (Step 1 of live trading setup)",
    parameters: Type.Object({
      ethAgentPrivateKey: Type.String({ description: "Agent wallet private key (hex, without 0x)" }),
      masterWalletAddress: Type.String({ description: "Master wallet address (0x...)" }),
    }),
    async execute(
      _id: string,
      params: { ethAgentPrivateKey: string; masterWalletAddress: string },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);

      const pubKeyRes = await fetch(`${walletAgentUrl}/pubkey`);
      if (!pubKeyRes.ok) throw new Error(`Failed to get wallet-agent pubkey: ${pubKeyRes.status}`);
      const { publicKey: walletAgentPubKey } = await pubKeyRes.json();

      const ephemeralKey = Keys.generatePrivateKey();
      const ephemeralPubKey = Keys.getPublicKey(ephemeralKey);
      const encrypted = await Crypto.encryptSharedMessage(
        ephemeralKey,
        walletAgentPubKey,
        params.ethAgentPrivateKey,
      );
      const encryptedPrivateKey = `${encrypted}&pbk=02${ephemeralPubKey}`;

      const signedAt = Math.floor(Date.now() / 1000);
      const body = {
        npub,
        public_key: walletAgentPubKey,
        encrypted_private_key: encryptedPrivateKey,
        signed_at: signedAt,
      };
      const signature = Signer.getSignature(body, privateKey, {
        npub: "string",
        public_key: "string",
        encrypted_private_key: "string",
        signed_at: "number",
      } as const);

      const res = await fetch(`${walletAgentUrl}/wallets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-public-key": publicKey,
          "x-signature": signature,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      let agentWalletAddress: string;

      if (res.ok) {
        agentWalletAddress = data.eth_address ?? data.address;
      } else if (data?.code === "WALLET_EXISTS") {
        const match = data.error?.match(/(0x[0-9a-fA-F]{40})/);
        if (match) {
          agentWalletAddress = match[1];
        } else {
          const listRes = await fetch(`${walletAgentUrl}/wallets/${npub}`, {
            headers: { "x-public-key": publicKey },
          });
          const listData = await listRes.json();
          const wallets = listData.wallets || [];
          agentWalletAddress = wallets[wallets.length - 1]?.eth_address;
        }
        if (!agentWalletAddress) throw new Error("No wallets found for this npub");
      } else {
        throw new Error(`store_wallet_in_tee failed: ${res.status} ${JSON.stringify(data)}`);
      }

      return textResult({ agentWalletAddress });
    },
  });

  api.registerTool({
    name: "register_wallet",
    description: "Register an agent wallet in the backend (Step 2 of live trading setup)",
    parameters: Type.Object({
      agentWalletAddress: Type.String({ description: "Agent wallet address (0x...)" }),
      masterWalletAddress: Type.String({ description: "Master wallet address (0x...)" }),
      network: Type.Optional(Type.String({ description: '"testnet" or "mainnet"', default: "testnet" })),
    }),
    async execute(
      _id: string,
      params: { agentWalletAddress: string; masterWalletAddress: string; network?: string },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);

      const findWallet = async () => {
        const res = await fetch(`${baseUrl}/api/wallets?npub=${npub}`, {
          headers: { Authorization: auth },
        });
        if (!res.ok) return undefined;
        const data = await res.json();
        return (data.data || []).find(
          (w: any) => w.wallet_address.toLowerCase() === params.agentWalletAddress.toLowerCase(),
        );
      };

      // Check if wallet already registered
      const existing = await findWallet();
      if (existing) {
        return textResult({ walletId: existing.id, walletAddress: existing.wallet_address });
      }

      // Register new wallet
      const createdAt = Math.floor(Date.now() / 1000);
      const walletSig = Signer.getSignature(
        {
          created_at: createdAt,
          wallet_address: params.agentWalletAddress,
          action: "connected",
          npub,
        },
        privateKey,
        {
          created_at: "number",
          wallet_address: "string",
          action: "string",
          npub: "string",
        } as const,
      );

      const res = await fetch(`${baseUrl}/api/wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          npub,
          name: `Wallet-${createdAt}`,
          walletAddress: params.agentWalletAddress,
          signature: walletSig,
          createdAt,
          walletType: "hyperliquid_agent",
          masterWalletAddress: params.masterWalletAddress,
          hyperliquidNetwork: params.network ?? "testnet",
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        // Backend may 500 on duplicate — check if wallet exists now
        const retry = await findWallet();
        if (retry) return textResult({ walletId: retry.id, walletAddress: retry.wallet_address });
        throw new Error(`register_wallet failed: ${res.status} ${text}`);
      }

      // POST succeeded but doesn't return walletId — look it up
      const created = await findWallet();
      if (!created) throw new Error("Wallet not found in backend after registration");
      return textResult({ walletId: created.id, walletAddress: created.wallet_address });
    },
  });

  api.registerTool({
    name: "register_trader",
    description: "Register a trader in the settlement engine (final step of live trading setup)",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID" }),
      masterWalletAddress: Type.String({ description: "Master wallet address (0x...)" }),
      agentWalletAddress: Type.String({ description: "Agent wallet address (0x...)" }),
      symbol: Type.String({ description: 'Trading pair, e.g. "ETH/USDC"' }),
      chainId: Type.Number({ description: "Chain ID (998=testnet)" }),
      protocol: Type.Optional(Type.String({ description: "Protocol name", default: "hyperliquid" })),
      buyLimitUsd: Type.Number({ description: "Buy limit in USD (initialCapital * leverage)" }),
    }),
    async execute(
      _id: string,
      params: {
        agentId: number;
        masterWalletAddress: string;
        agentWalletAddress: string;
        symbol: string;
        chainId: number;
        protocol?: string;
        buyLimitUsd: number;
      },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const signedAt = Math.floor(Date.now() / 1000);

      const body = {
        trader_id: params.agentId,
        owner: npub,
        eth_address: params.masterWalletAddress,
        agent_address: params.agentWalletAddress,
        symbol: params.symbol,
        chain_id: params.chainId,
        protocol: params.protocol ?? "hyperliquid",
        buy_limit_usd: params.buyLimitUsd,
        execution_mode: "live",
        signed_at: signedAt,
      };
      const signature = Signer.getSignature(body, privateKey, {
        trader_id: "number",
        eth_address: "string",
        symbol: "string",
        chain_id: "number",
        signed_at: "number",
      } as const);

      const res = await fetch(`${settlementEngineUrl}/traders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-public-key": publicKey,
          "x-signature": signature,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error(`register_trader failed: ${res.status} ${await res.text()}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "create_agent",
    description: "Create a new trading agent (paper or live)",
    parameters: Type.Object({
      name: Type.String({ description: "Agent name" }),
      initialCapital: Type.Number({ description: "Initial capital amount" }),
      mode: Type.Optional(
        Type.String({ description: '"paper" or "live"', default: "paper" }),
      ),
      marketType: Type.Optional(
        Type.String({ description: '"spot" or "perp"', default: "spot" }),
      ),
      strategy: Type.Optional(Strategy),
      strategyDescription: Type.Optional(Type.String({ description: "Human-readable strategy summary" })),
      simulationConfig: Type.Optional(SimulationConfig),
      walletId: Type.Optional(Type.Number({ description: "Wallet ID from register_wallet (live mode)" })),
      walletAddress: Type.Optional(Type.String({ description: "Agent wallet address (live mode)" })),
      symbol: Type.Optional(Type.String({ description: 'Trading pair symbol, e.g. "ETH/USDC" (live mode)' })),
      protocol: Type.Optional(Type.String({ description: '"hyperliquid" (live mode)', default: "hyperliquid" })),
      chainId: Type.Optional(Type.Number({ description: "Chain ID (998=testnet, live mode)" })),
      leverage: Type.Optional(Type.Number({ description: "Leverage multiplier (must match strategy.risk_manager.leverage)" })),
      buyLimit: Type.Optional(Type.Number({ description: "Buy limit in USD (initialCapital × leverage)" })),
      settlement_config: Type.Optional(Type.Object({
        eth_address: Type.String({ description: "Master wallet address" }),
        agent_address: Type.String({ description: "Agent wallet address" }),
      })),
    }),
    async execute(
      _id: string,
      params: {
        name: string;
        initialCapital: number;
        mode?: string;
        marketType?: string;
        strategy?: Record<string, unknown>;
        strategyDescription?: string;
        simulationConfig?: { asset_type: string; protocol?: string };
        walletId?: number;
        walletAddress?: string;
        symbol?: string;
        protocol?: string;
        chainId?: number;
        leverage?: number;
        buyLimit?: number;
        settlement_config?: { eth_address: string; agent_address: string };
      },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);
      const mode = params.mode ?? "paper";

      const payload: Record<string, unknown> = {
        name: params.name,
        avatarUrl: "",
        initialCapital: params.initialCapital,
        mode,
        marketType: params.marketType ?? "spot",
        owner: npub,
        pubkey: Nip19.npubEncode(publicKey),
        isActive: true,
      };
      if (params.leverage != null) payload.leverage = params.leverage;
      if (params.buyLimit != null) payload.buyLimit = params.buyLimit;
      if (params.chainId != null) payload.chainId = params.chainId;
      if (params.simulationConfig) payload.simulationConfig = params.simulationConfig;
      if (params.strategy) payload.strategy = params.strategy;
      if (params.strategyDescription) payload.strategyDescription = params.strategyDescription;
      if (params.walletId != null) payload.walletId = params.walletId;
      if (params.walletAddress) payload.walletAddress = params.walletAddress;
      if (params.symbol) payload.symbol = params.symbol;
      if (params.protocol) payload.protocol = params.protocol;
      if (params.settlement_config) payload.settlement_config = params.settlement_config;

      const res = await fetch(`${baseUrl}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload),
      });
      if (!res.ok)
        throw new Error(
          `create_agent failed: ${res.status} ${await res.text()}`,
        );
      const data = await res.json();
      data.agentUrl = `https://agent.openswap.xyz/trading-agents/${publicKey}/${data.agentId}`;
      return textResult(data);
    },
  });

  api.registerTool({
    name: "notify_trading_bot",
    description: "Notify the trading bot about a new agent",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID from create_agent" }),
      name: Type.String({ description: "Agent name" }),
      initialCapital: Type.Number({ description: "Initial capital amount" }),
      pairSymbol: Type.String({
        description: 'Trading pair symbol, e.g. "BTC/USDC"',
      }),
      mode: Type.Optional(
        Type.String({ description: '"paper" or "live"', default: "paper" }),
      ),
      marketType: Type.Optional(
        Type.String({ description: '"spot" or "perp"', default: "spot" }),
      ),
      leverage: Type.Optional(Type.Number({ description: "Leverage multiplier (required for perp/live mode)" })),
      strategy: Strategy,
      description: Type.Optional(Type.String({ description: "Agent description" })),
      settlementConfig: Type.Optional(Type.String({ description: "JSON-stringified settlement config (live mode)" })),
      simulationConfig: Type.Optional(SimulationConfig),
    }),
    async execute(
      _id: string,
      params: {
        agentId: number;
        name: string;
        initialCapital: number;
        pairSymbol: string;
        mode?: string;
        marketType?: string;
        leverage?: number;
        strategy: Record<string, unknown>;
        description?: string;
        settlementConfig?: string;
        simulationConfig?: { asset_type: string; protocol?: string };
      },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const signedAt = Math.floor(Date.now() / 1000);

      const body: Record<string, unknown> = {
        id: params.agentId,
        name: params.name,
        owner: npub,
        avatar_url: null,
        initial_capital: params.initialCapital,
        strategy_config: params.strategy,
        description: params.description ?? null,
        mode: params.mode ?? "paper",
        signed_at: signedAt,
        market_type: params.marketType ?? "spot",
      };
      if (params.leverage != null) body.leverage = params.leverage;
      if (params.settlementConfig != null) body.settlement_config = params.settlementConfig;
      if (params.simulationConfig) body.simulation_config = params.simulationConfig;

      const signature = Signer.getSignature(body, privateKey, {
        id: "number",
        name: "string",
        initial_capital: "number",
        signed_at: "number",
      } as const);

      const res = await fetch(`${tradingBotUrl}/agents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-public-key": publicKey,
          "x-signature": signature,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok)
        throw new Error(
          `notify_trading_bot failed: ${res.status} ${await res.text()}`,
        );
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "log_agent_action",
    description: "Log an action for a trading agent",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID" }),
      action: Type.String({ description: 'Action to log, e.g. "create"' }),
    }),
    async execute(
      _id: string,
      params: { agentId: number; action: string },
    ) {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const timestamp = Math.floor(Date.now() / 1000);

      const sigData = {
        agent_id: params.agentId,
        action: params.action,
        user: Nip19.npubEncode(publicKey),
        timestamp,
      };
      const signature = Signer.getSignature(sigData, privateKey, {
        agent_id: "number",
        action: "string",
        user: "string",
        timestamp: "number",
      } as const);

      const auth = getAuthHeader(publicKey, privateKey);
      const res = await fetch(`${baseUrl}/api/agent-action-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({
          agentId: params.agentId,
          action: params.action,
          signature,
          timestamp,
        }),
      });
      if (!res.ok)
        throw new Error(
          `log_agent_action failed: ${res.status} ${await res.text()}`,
        );
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "get_agent",
    description: "Get details of a trading agent by ID",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID to retrieve" }),
    }),
    async execute(_id: string, params: { agentId: number }) {
      const res = await fetch(`${baseUrl}/api/agent/${params.agentId}`);
      if (!res.ok) throw new Error(`get_agent failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  // ── Backtest tools ──────────────────────────────────────────────

  api.registerTool({
    name: "create_backtest",
    description: "Create a new backtest job for an agent",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID to backtest" }),
      initialCapital: Type.Number({ description: "Initial capital amount" }),
      startTime: Type.String({ description: "Start time (ISO datetime or unix timestamp)" }),
      endTime: Type.String({ description: "End time (ISO datetime or unix timestamp)" }),
      protocolFee: Type.Optional(Type.Number({ description: "Protocol fee override" })),
      gasFee: Type.Optional(Type.Number({ description: "Gas fee override" })),
      strategy: Type.Optional(Strategy),
    }),
    async execute(
      _id: string,
      params: {
        agentId: number;
        initialCapital: number;
        startTime: string;
        endTime: string;
        protocolFee?: number;
        gasFee?: number;
        strategy?: Record<string, unknown>;
      },
    ) {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);

      const payload: Record<string, unknown> = {
        agentId: params.agentId,
        initialCapital: params.initialCapital,
        startTime: params.startTime,
        endTime: params.endTime,
      };
      if (params.protocolFee != null) payload.protocolFee = params.protocolFee;
      if (params.gasFee != null) payload.gasFee = params.gasFee;
      if (params.strategy) payload.strategy = params.strategy;

      const res = await fetch(`${baseUrl}/api/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload),
      });
      if (!res.ok)
        throw new Error(`create_backtest failed: ${res.status} ${await res.text()}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "get_backtests",
    description: "List backtests for an agent",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID" }),
    }),
    async execute(_id: string, params: { agentId: number }) {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);

      const res = await fetch(`${baseUrl}/api/backtests/${params.agentId}`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error(`get_backtests failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "get_backtest_status",
    description: "Check the status of one or more backtest jobs",
    parameters: Type.Object({
      jobIds: Type.Array(Type.String(), { description: "Array of backtest job IDs" }),
    }),
    async execute(_id: string, params: { jobIds: string[] }) {
      const res = await fetch(`${baseUrl}/api/backtests-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: params.jobIds }),
      });
      if (!res.ok) throw new Error(`get_backtest_status failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "get_backtest_job",
    description: "Poll the progress and status of a backtest job",
    parameters: Type.Object({
      jobId: Type.String({ description: "Backtest job ID" }),
    }),
    async execute(_id: string, params: { jobId: string }) {
      const res = await fetch(`${backtestEngineUrl}/jobs/${params.jobId}`);
      if (!res.ok) throw new Error(`get_backtest_job failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "get_backtest_result",
    description: "Get the full result of a completed backtest job (portfolio, metrics, trades)",
    parameters: Type.Object({
      jobId: Type.String({ description: "Backtest job ID" }),
    }),
    async execute(_id: string, params: { jobId: string }) {
      const res = await fetch(`${backtestEngineUrl}/jobs/${params.jobId}/result`);
      if (!res.ok) throw new Error(`get_backtest_result failed: ${res.status}`);
      return textResult(await res.json());
    },
  });
}
