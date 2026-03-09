import { Type } from "@sinclair/typebox";
import { Keys, Nip19, Signer, Crypto } from "@scom/scom-signer";
import mqtt from "mqtt";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SUPPORTED_PAIRS } from "./supported-pairs.js";

// ── Strategy schema ────────────────────────────────────────────────

const IndicatorConfig = Type.Object({
  type: Type.String({ description: 'Indicator type: "rsi","sma","ema","macd","stochrsi","stochastic","bollinger","atr","renko","renko_atr","ohlc". Outputs — single-value (rsi,sma,ema,atr): {name}. macd: {name}.macd, {name}.signal, {name}.histogram. stochrsi/stochastic: {name}.k, {name}.d. bollinger: {name}.upper, {name}.middle, {name}.lower. renko/renko_atr: {name}.brick_high, {name}.brick_low, {name}.direction. ohlc: {name}.open, {name}.high, {name}.low, {name}.close, {name}.volume. Use "price" for live tick price (no indicator needed).' }),
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
  side: Type.Optional(Type.String({ description: '"long" or "short" — required for both open and close rules (must match the position side being opened/closed)' })),
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
  chain_id: Type.Optional(Type.Number({ description: "Uniswap: 1 (Ethereum), 56 (BSC), 8453 (Base), 42161 (Arbitrum). Hyperliquid: 998 (testnet), 999 (mainnet). Not needed for stocks." })),
});

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://agent02.decom.dev";
const DEFAULT_BOT_URL =
  "https://trading-agent.decom.dev";
const DEFAULT_BACKTEST_ENGINE_URL = "https://mcp-backtest01.decom.dev";
const DEFAULT_WALLET_AGENT_URL =
  "https://9740f18eea0cc47c42455e5ce03ab90bdb223c9f-8081.dstack-pha-prod5.phala.network/wallet-agent";
const DEFAULT_SETTLEMENT_ENGINE_URL =
  "https://settlement-agent.decom.dev";

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

async function fetchUsdcBalance(masterWalletAddress: string, chainId: number): Promise<number> {
  const apiUrl = chainId === 999
    ? "https://api.hyperliquid.xyz/info"
    : "https://api.hyperliquid-testnet.xyz/info";

  // Try Standard Account first
  const chRes = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user: masterWalletAddress }),
  });
  if (!chRes.ok) throw new Error(`clearinghouseState failed: ${chRes.status}`);
  const chData = await chRes.json();
  const withdrawable = parseFloat(chData.withdrawable ?? "0");
  if (withdrawable > 0) return withdrawable;

  // Try Unified Account (spotClearinghouseState)
  const spotRes = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotClearinghouseState", user: masterWalletAddress }),
  });
  if (!spotRes.ok) throw new Error(`spotClearinghouseState failed: ${spotRes.status}`);
  const spotData = await spotRes.json();

  let balance = 0;
  const tokenAvail = spotData.tokenToAvailableAfterMaintenance;
  if (Array.isArray(tokenAvail)) {
    const usdcEntry = tokenAvail.find((e: any) => e[0] === 0);
    if (usdcEntry) balance = parseFloat(usdcEntry[1]);
  }
  if (balance === 0 && Array.isArray(spotData.balances)) {
    const usdcBal = spotData.balances.find((b: any) => b.coin === "USDC");
    if (usdcBal) balance = parseFloat(usdcBal.total ?? "0");
  }

  return balance;
}

export default function (api: any) {
  const pluginConfig = api.config?.plugins?.entries?.["trading-plugin"]?.config ?? api.config ?? {};
  const baseUrl: string = pluginConfig.baseUrl ?? DEFAULT_BASE_URL;
  const tradingBotUrl: string = pluginConfig.tradingBotUrl ?? DEFAULT_BOT_URL;
  const backtestEngineUrl: string = pluginConfig.backtestEngineUrl ?? DEFAULT_BACKTEST_ENGINE_URL;
  const walletAgentUrl: string = pluginConfig.walletAgentUrl ?? DEFAULT_WALLET_AGENT_URL;
  const settlementEngineUrl: string = pluginConfig.settlementEngineUrl ?? DEFAULT_SETTLEMENT_ENGINE_URL;

  // ── Debug logger ───────────────────────────────────────────────
  const debugLogPath = path.join(os.homedir(), ".openclaw", "logs", "trading-debug.json");

  function debugLog(tool: string, step: string, data: unknown) {
    try {
      fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
      const entry = { ts: new Date().toISOString(), tool, step, data };
      fs.appendFileSync(debugLogPath, JSON.stringify(entry) + "\n");
    } catch {}
  }

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

  api.registerTool({
    name: "get_supported_pairs",
    description:
      "Get supported trading pairs and which venues (protocol + chain) they are available on. " +
      "Returns crypto pairs with venue availability and stock symbols (paper mode, signal simulation only). " +
      "Use optional filters to narrow results by asset type or protocol.",
    parameters: Type.Object({
      assetType: Type.Optional(
        Type.String({ description: '"crypto" or "stocks". Omit for all.' }),
      ),
      protocol: Type.Optional(
        Type.String({
          description:
            '"uniswap", "hyperliquid", or "signal_simulation". Filters to pairs available on this protocol. Omit for all.',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: { assetType?: string; protocol?: string },
    ) {
      let results = SUPPORTED_PAIRS;

      if (params.assetType) {
        results = results.filter((p) => p.asset_type === params.assetType);
      }

      if (params.protocol) {
        results = results
          .map((p) => ({
            ...p,
            venues: p.venues.filter((v) => v.protocol === params.protocol),
          }))
          .filter((p) => p.venues.length > 0);
      }

      return textResult({ pairs: results, total: results.length });
    },
  });

  // ── Identity & access tools ─────────────────────────────────────

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

  // ── Live-trade tools ──────────────────────────────────────────

  api.registerTool({
    name: "get_hyperliquid_balance",
    description: "Get USDC balance of a Hyperliquid master wallet (public endpoint, no auth needed). Use the master wallet address, not the agent/API wallet.",
    parameters: Type.Object({
      masterWalletAddress: Type.String({ description: "Master wallet address (0x...), not the agent/API wallet" }),
      chainId: Type.Optional(Type.Number({ description: "998=testnet, 999=mainnet", default: 998 })),
    }),
    async execute(
      _id: string,
      params: { masterWalletAddress: string; chainId?: number },
    ) {
      const chainId = params.chainId ?? 998;
      const balance = await fetchUsdcBalance(params.masterWalletAddress, chainId);

      if (balance > 0) {
        return textResult({ masterWalletAddress: params.masterWalletAddress, chainId, balance });
      } else {
        const appUrl = chainId === 999
          ? "https://app.hyperliquid.xyz"
          : "https://app.hyperliquid-testnet.xyz";
        return textResult({
          masterWalletAddress: params.masterWalletAddress,
          chainId,
          balance,
          depositReminder:
            `Your wallet has 0 USDC balance. You must deposit USDC into your Hyperliquid wallet before you can trade. ` +
            `Deposit here: ${appUrl}`,
        });
      }
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

  // ── Composite tools ────────────────────────────────────────────

  api.registerTool({
    name: "init_trading_session",
    description: "Initialize a trading session: check/generate Nostr keys, verify trading access, and optionally list wallets (live mode). Replaces sequential calls to get_or_create_nostr_keys + check_trading_access + list_wallets.",
    parameters: Type.Object({
      mode: Type.Optional(Type.String({ description: '"paper" or "live"', default: "paper" })),
    }),
    async execute(_id: string, params: { mode?: string }) {
      const mode = params.mode ?? "paper";
      debugLog("init_trading_session", "entry", { mode });
      const result: Record<string, unknown> = {};

      // Step 1: Check/generate Nostr key
      let pk = pluginConfig.nostrPrivateKey;
      let generated = false;
      if (!pk) {
        pk = Keys.generatePrivateKey();
        persistKeyToConfig(pk);
        generated = true;
      }
      const publicKey = Keys.getPublicKey(pk);
      const npub = Nip19.npubEncode(publicKey);
      result.keys = { ok: true, npub, publicKey, generated };
      debugLog("init_trading_session", "keys", { npub, generated });

      // Step 2: Check trading access
      try {
        const whitelistUrl = `${baseUrl}/api/is-whitelisted/${npub}`;
        debugLog("init_trading_session", "api.req /api/is-whitelisted", { url: whitelistUrl });
        const res = await fetch(whitelistUrl);
        if (!res.ok) {
          const errText = await res.text().catch(() => null);
          debugLog("init_trading_session", "api.res /api/is-whitelisted", { status: res.status, body: errText });
          result.access = { ok: false, error: `check failed: ${res.status}` };
          debugLog("init_trading_session", "result", result);
          return textResult(result);
        }
        const data = await res.json();
        debugLog("init_trading_session", "api.res /api/is-whitelisted", { status: res.status, body: data });
        result.access = { ok: true, hasAccess: data.isWhitelisted };
        if (!data.isWhitelisted) {
          debugLog("init_trading_session", "result", result);
          return textResult(result);
        }
      } catch (e: any) {
        result.access = { ok: false, error: e.message };
        debugLog("init_trading_session", "result", result);
        return textResult(result);
      }

      // Step 3: If live, list wallets
      if (mode === "live") {
        try {
          const auth = getAuthHeader(publicKey, pk);
          const walletsUrl = `${baseUrl}/api/wallets?npub=${npub}`;
          debugLog("init_trading_session", "api.req /api/wallets", { url: walletsUrl });
          const res = await fetch(walletsUrl, {
            headers: { Authorization: auth },
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => null);
            debugLog("init_trading_session", "api.res /api/wallets", { status: res.status, body: errText });
            result.wallets = { ok: false, error: `list_wallets failed: ${res.status}` };
          } else {
            const data = await res.json();
            debugLog("init_trading_session", "api.res /api/wallets", { status: res.status, body: data });
            const wallets = (data.data || [])
              .filter((w: any) => w.is_active && w.wallet_type === "hyperliquid_agent")
              .map((w: any) => ({
                walletId: w.id,
                name: w.name,
                walletAddress: w.wallet_address,
                masterWalletAddress: w.master_wallet_address,
                network: w.hyperliquid_network,
              }));
            result.wallets = { ok: true, wallets };
          }
        } catch (e: any) {
          result.wallets = { ok: false, error: e.message };
        }
      }

      debugLog("init_trading_session", "result", result);
      return textResult(result);
    },
  });

  api.registerTool({
    name: "setup_live_wallet",
    description: "Store an agent wallet key in TEE and register it in the backend. Replaces sequential calls to store_wallet_in_tee + register_wallet.",
    parameters: Type.Object({
      ethAgentPrivateKey: Type.String({ description: "Agent wallet private key (hex, without 0x)" }),
      masterWalletAddress: Type.String({ description: "Master wallet address (0x...)" }),
      network: Type.Optional(Type.String({ description: '"testnet" or "mainnet"', default: "testnet" })),
    }),
    async execute(
      _id: string,
      params: { ethAgentPrivateKey: string; masterWalletAddress: string; network?: string },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      debugLog("setup_live_wallet", "entry", { masterWalletAddress: params.masterWalletAddress, network: params.network ?? "testnet" });
      const result: Record<string, unknown> = {};

      // Step 1: Store in TEE
      let agentWalletAddress: string;
      try {
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

        debugLog("setup_live_wallet", "api.req wallet-agent/wallets", { npub, public_key: walletAgentPubKey, signed_at: signedAt });
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

        if (res.ok) {
          agentWalletAddress = data.eth_address ?? data.address;
          debugLog("setup_live_wallet", "api.res wallet-agent/wallets", { status: res.status, agentWalletAddress });
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
          debugLog("setup_live_wallet", "api.res wallet-agent/wallets", { status: res.status, agentWalletAddress, walletExists: true });
        } else {
          debugLog("setup_live_wallet", "api.res wallet-agent/wallets", { status: res.status, error: data });
          throw new Error(`TEE storage failed: ${res.status} ${JSON.stringify(data)}`);
        }

        result.teeStorage = { ok: true, agentWalletAddress };
      } catch (e: any) {
        result.teeStorage = { ok: false, error: e.message };
        debugLog("setup_live_wallet", "result", result);
        return textResult(result);
      }

      // Step 2: Register wallet in backend
      try {
        const auth = getAuthHeader(publicKey, privateKey);

        const findWallet = async () => {
          const res = await fetch(`${baseUrl}/api/wallets?npub=${npub}`, {
            headers: { Authorization: auth },
          });
          if (!res.ok) return undefined;
          const data = await res.json();
          return (data.data || []).find(
            (w: any) => w.wallet_address.toLowerCase() === agentWalletAddress.toLowerCase(),
          );
        };

        const existing = await findWallet();
        if (existing) {
          result.registration = { ok: true, walletId: existing.id, walletAddress: existing.wallet_address };
          debugLog("setup_live_wallet", "result", result);
          return textResult(result);
        }

        const createdAt = Math.floor(Date.now() / 1000);
        const walletSig = Signer.getSignature(
          {
            created_at: createdAt,
            wallet_address: agentWalletAddress,
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

        const registerBody = {
          npub,
          name: `Wallet-${createdAt}`,
          walletAddress: agentWalletAddress,
          signature: walletSig,
          createdAt,
          walletType: "hyperliquid_agent",
          masterWalletAddress: params.masterWalletAddress,
          hyperliquidNetwork: params.network ?? "testnet",
        };
        debugLog("setup_live_wallet", "api.req POST /api/wallets", registerBody);
        const res = await fetch(`${baseUrl}/api/wallets`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify(registerBody),
        });
        const resBody = await res.json().catch(() => null);
        debugLog("setup_live_wallet", "api.res POST /api/wallets", { status: res.status, body: resBody });
        if (!res.ok) {
          const retry = await findWallet();
          if (retry) {
            result.registration = { ok: true, walletId: retry.id, walletAddress: retry.wallet_address };
            debugLog("setup_live_wallet", "result", result);
            return textResult(result);
          }
          throw new Error(`register_wallet failed: ${res.status}`);
        }

        const created = await findWallet();
        if (!created) throw new Error("Wallet not found after registration");
        result.registration = { ok: true, walletId: created.id, walletAddress: created.wallet_address };
      } catch (e: any) {
        result.registration = { ok: false, error: e.message };
      }

      debugLog("setup_live_wallet", "result", result);
      return textResult(result);
    },
  });

  api.registerTool({
    name: "deploy_agent",
    description: "Create a trading agent, notify bot, register trader (live), log action, and verify. Replaces sequential calls to create_agent + notify_trading_bot + register_trader + log_agent_action + get_agent.",
    parameters: Type.Object({
      name: Type.String({ description: "Agent name" }),
      initialCapital: Type.Optional(Type.Number({ description: "Initial capital amount (auto-fetched for live mode)" })),
      mode: Type.Optional(Type.String({ description: '"paper" or "live"', default: "paper" })),
      marketType: Type.Optional(Type.String({ description: '"spot" or "perp"', default: "spot" })),
      strategy: Strategy,
      strategyDescription: Type.Optional(Type.String({ description: "Human-readable strategy summary" })),
      simulationConfig: Type.Optional(SimulationConfig),
      walletId: Type.Optional(Type.Number({ description: "Wallet ID (live mode)" })),
      walletAddress: Type.Optional(Type.String({ description: "Agent wallet address (live mode)" })),
      masterWalletAddress: Type.Optional(Type.String({ description: "Master wallet address (live mode, for settlement)" })),
      symbol: Type.Optional(Type.String({ description: 'Trading pair, e.g. "ETH/USDC"' })),
      protocol: Type.Optional(Type.String({ description: '"hyperliquid"', default: "hyperliquid" })),
      chainId: Type.Optional(Type.Number({ description: "Chain ID (998=testnet)" })),
      leverage: Type.Optional(Type.Number({ description: "Leverage multiplier" })),
    }),
    async execute(
      _id: string,
      params: {
        name: string;
        initialCapital?: number;
        mode?: string;
        marketType?: string;
        strategy: Record<string, unknown>;
        strategyDescription?: string;
        simulationConfig?: { asset_type: string; protocol?: string; chain_id?: number };
        walletId?: number;
        walletAddress?: string;
        masterWalletAddress?: string;
        symbol?: string;
        protocol?: string;
        chainId?: number;
        leverage?: number;
      },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);
      const mode = params.mode ?? "paper";
      const isLive = mode === "live";
      debugLog("deploy_agent", "entry", params);
      const result: Record<string, unknown> = {};

      // Auto-fetch initial capital for live mode
      let initialCapital = params.initialCapital;
      if (isLive && initialCapital == null && params.masterWalletAddress) {
        const chainId = params.chainId ?? 998;
        const balance = await fetchUsdcBalance(params.masterWalletAddress, chainId);
        if (balance === 0) {
          const appUrl = chainId === 999
            ? "https://app.hyperliquid.xyz"
            : "https://app.hyperliquid-testnet.xyz";
          return textResult({
            error: `Wallet ${params.masterWalletAddress} has 0 USDC balance. Deposit USDC before deploying: ${appUrl}`,
          });
        }
        initialCapital = balance;
        debugLog("deploy_agent", "auto-fetched balance", { initialCapital });
      }
      if (initialCapital == null) {
        return textResult({ error: "initialCapital is required for paper mode" });
      }

      // Default leverage to 3x for live mode
      const leverage = isLive ? (params.leverage ?? 3) : params.leverage;

      // Auto-compute buyLimit and settlement_config for live
      const buyLimit = isLive && leverage
        ? initialCapital * leverage
        : undefined;
      const settlementConfig = isLive && params.masterWalletAddress && params.walletAddress
        ? { eth_address: params.masterWalletAddress, agent_address: params.walletAddress }
        : undefined;
      debugLog("deploy_agent", "computed", { buyLimit, settlementConfig });

      // Step 1: Create agent (fatal if fails)
      let agentId: number;
      let agentUrl: string;
      try {
        const payload: Record<string, unknown> = {
          name: params.name,
          avatarUrl: "",
          initialCapital,
          mode,
          marketType: params.marketType ?? "spot",
          owner: npub,
          pubkey: Nip19.npubEncode(publicKey),
          isActive: true,
        };
        if (leverage != null) payload.leverage = leverage;
        if (buyLimit != null) payload.buyLimit = buyLimit;
        if (params.chainId != null) payload.chainId = params.chainId;
        if (params.simulationConfig) payload.simulationConfig = params.simulationConfig;
        if (params.strategy) payload.strategy = params.strategy;
        if (params.strategyDescription) payload.strategyDescription = params.strategyDescription;
        if (params.walletId != null) payload.walletId = params.walletId;
        if (params.walletAddress) payload.walletAddress = params.walletAddress;
        if (params.symbol) payload.symbol = params.symbol;
        if (params.protocol) payload.protocol = params.protocol;
        if (settlementConfig) payload.settlement_config = settlementConfig;

        debugLog("deploy_agent", "create.api.req POST /api/agent", payload);
        const res = await fetch(`${baseUrl}/api/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          debugLog("deploy_agent", "create.api.res", { status: res.status, error: errText });
          return textResult({ create: { ok: false, error: `create_agent failed: ${res.status} ${errText}` } });
        }
        const data = await res.json();
        agentId = data.agentId;
        agentUrl = `https://agent.openswap.xyz/trading-agents/${publicKey}/${agentId}`;
        debugLog("deploy_agent", "create.api.res", { status: res.status, body: data });
        result.create = { ok: true, agentId, agentUrl };
      } catch (e: any) {
        return textResult({ create: { ok: false, error: e.message } });
      }

      // Step 2: Notify trading bot
      try {
        const signedAt = Math.floor(Date.now() / 1000);
        const body: Record<string, unknown> = {
          id: agentId,
          name: params.name,
          owner: npub,
          avatar_url: null,
          initial_capital: initialCapital,
          strategy_config: params.strategy,
          description: params.strategyDescription ?? null,
          mode,
          signed_at: signedAt,
          market_type: params.marketType ?? "spot",
        };
        if (params.leverage != null) body.leverage = params.leverage;
        if (isLive && settlementConfig) {
          body.settlement_config = JSON.stringify({
            ...settlementConfig,
            symbol: params.symbol,
            chain_id: params.chainId,
            protocol: params.protocol ?? "hyperliquid",
            buy_limit_usd: buyLimit,
          });
        }
        if (params.simulationConfig) body.simulation_config = params.simulationConfig;

        const signature = Signer.getSignature(body, privateKey, {
          id: "number",
          name: "string",
          initial_capital: "number",
          signed_at: "number",
        } as const);

        debugLog("deploy_agent", "notify.api.req POST bot/agents", body);
        const res = await fetch(`${tradingBotUrl}/agents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-public-key": publicKey,
            "x-signature": signature,
          },
          body: JSON.stringify(body),
        });
        const resBody = res.ok ? await res.json().catch(() => null) : await res.text().catch(() => null);
        debugLog("deploy_agent", "notify.api.res", { status: res.status, responseBody: resBody });
        result.notify = { ok: res.ok };
        if (!res.ok) (result.notify as any).error = `${res.status}`;
      } catch (e: any) {
        result.notify = { ok: false, error: e.message };
      }

      // Step 3: Register trader in settlement engine (live only)
      if (isLive && params.masterWalletAddress && params.walletAddress) {
        try {
          const signedAt = Math.floor(Date.now() / 1000);
          const marketType = params.marketType ?? "perp";
          const traderBody: Record<string, unknown> = {
            trader_id: agentId,
            owner: npub,
            eth_address: params.masterWalletAddress,
            agent_address: params.walletAddress,
            symbol: params.symbol!,
            chain_id: params.chainId!,
            market_type: marketType,
            venue_type: marketType === "perp" ? "dex_orderbook" : "dex_amm",
            buy_limit_usd: buyLimit!,
            signed_at: signedAt,
          };
          if (params.protocol) traderBody.protocol = params.protocol;
          const signature = Signer.getSignature(traderBody, privateKey, {
            trader_id: "number",
            eth_address: "string",
            symbol: "string",
            chain_id: "number",
            signed_at: "number",
          } as const);

          debugLog("deploy_agent", "trader.api.req POST /traders", traderBody);
          const res = await fetch(`${settlementEngineUrl}/traders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-public-key": publicKey,
              "x-signature": signature,
            },
            body: JSON.stringify(traderBody),
          });
          const resBody = res.ok ? await res.json().catch(() => null) : await res.text().catch(() => null);
          debugLog("deploy_agent", "trader.api.res", { status: res.status, responseBody: resBody });
          result.registerTrader = { ok: res.ok };
          if (!res.ok) (result.registerTrader as any).error = `${res.status}`;
        } catch (e: any) {
          result.registerTrader = { ok: false, error: e.message };
        }
      }

      // Step 4: Log action
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const sigData = {
          agent_id: agentId,
          action: "create",
          user: Nip19.npubEncode(publicKey),
          timestamp,
        };
        const signature = Signer.getSignature(sigData, privateKey, {
          agent_id: "number",
          action: "string",
          user: "string",
          timestamp: "number",
        } as const);

        const logBody = { agentId, action: "create", signature, timestamp };
        debugLog("deploy_agent", "log.api.req POST /agent-action-log", logBody);
        const res = await fetch(`${baseUrl}/api/agent-action-log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: auth,
          },
          body: JSON.stringify(logBody),
        });
        const logResBody = await res.json().catch(() => null);
        debugLog("deploy_agent", "log.api.res", { status: res.status, body: logResBody });
        result.log = { ok: res.ok };
      } catch {
        result.log = { ok: false };
      }

      // Step 5: Verify
      try {
        const res = await fetch(`${baseUrl}/api/agent/${agentId}`);
        const verifyBody = await res.json().catch(() => null);
        debugLog("deploy_agent", "verify.api.res GET /api/agent", { status: res.status, body: verifyBody });
        if (res.ok) {
          result.verify = { ok: true, agent: verifyBody };
        } else {
          result.verify = { ok: false };
        }
      } catch {
        result.verify = { ok: false };
      }

      debugLog("deploy_agent", "result", result);
      return textResult(result);
    },
  });

  // ── List & delete tools ────────────────────────────────────────────

  api.registerTool({
    name: "list_my_agents",
    description: "List all trading agents owned by the current user",
    parameters: Type.Object({
      mode: Type.Optional(Type.String({ description: '"live" or "paper"' })),
      marketType: Type.Optional(Type.String({ description: '"spot" or "perp"' })),
      page: Type.Optional(Type.Number({ description: "Page number (default 1)" })),
      pageSize: Type.Optional(Type.Number({ description: "Results per page" })),
    }),
    async execute(_id: string, params: { mode?: string; marketType?: string; page?: number; pageSize?: number }) {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);
      const qs = new URLSearchParams();
      if (params.mode) qs.set("mode", params.mode);
      if (params.marketType) qs.set("marketType", params.marketType);
      if (params.page) qs.set("page", String(params.page));
      if (params.pageSize) qs.set("pageSize", String(params.pageSize));
      const url = `${baseUrl}/api/my-agents${qs.toString() ? `?${qs}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) throw new Error(`list_my_agents failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "delete_agent",
    description: "Delete a trading agent by ID. Removes from all backend services.",
    parameters: Type.Object({
      agentId: Type.Number({ description: "Agent ID to delete" }),
    }),
    async execute(_id: string, params: { agentId: number }) {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const npub = Nip19.npubEncode(publicKey);
      const auth = getAuthHeader(publicKey, privateKey);
      const result: Record<string, unknown> = {};
      const signedAt = Math.floor(Date.now() / 1000);
      debugLog("delete_agent", "entry", { agentId: params.agentId });

      // Fetch agent to determine mode
      const agentRes = await fetch(`${baseUrl}/api/agent/${params.agentId}`);
      if (!agentRes.ok) return textResult({ error: `Agent ${params.agentId} not found: ${agentRes.status}` });
      const agentData = await agentRes.json();
      const isLive = agentData?.data?.mode === "live";

      // Step 1: Deactivate trader in settlement engine (live only)
      if (isLive) {
        try {
          const body = { trader_id: params.agentId, signed_at: signedAt };
          const signature = Signer.getSignature(body, privateKey, {
            trader_id: "number", signed_at: "number",
          } as const);
          const res = await fetch(`${settlementEngineUrl}/traders/${params.agentId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json", "x-public-key": publicKey, "x-signature": signature },
            body: JSON.stringify(body),
          });
          debugLog("delete_agent", "settlement.res", { status: res.status });
          result.settlement = { ok: res.ok };
        } catch (e: any) {
          result.settlement = { ok: false, error: e.message };
        }
      }

      // Step 2: Delete from trading-data
      try {
        const sigData = { agent_id: params.agentId, action: "delete", user: npub, timestamp: signedAt };
        const signature = Signer.getSignature(sigData, privateKey, {
          agent_id: "number", action: "string", user: "string", timestamp: "number",
        } as const);
        const res = await fetch(`${baseUrl}/api/agent/${params.agentId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify({ signature, timestamp: signedAt }),
        });
        debugLog("delete_agent", "trading-data.res", { status: res.status });
        result.tradingData = { ok: res.ok };
      } catch (e: any) {
        result.tradingData = { ok: false, error: e.message };
      }

      // Step 3: Delete from trading-bot
      try {
        const res = await fetch(`${tradingBotUrl}/agents/${params.agentId}?signed_at=${signedAt}`, {
          method: "DELETE",
        });
        debugLog("delete_agent", "trading-bot.res", { status: res.status });
        result.tradingBot = { ok: res.ok };
      } catch (e: any) {
        result.tradingBot = { ok: false, error: e.message };
      }

      debugLog("delete_agent", "result", result);
      return textResult(result);
    },
  });

  api.registerTool({
    name: "list_wallets",
    description: "List all wallets registered to the current user",
    parameters: Type.Object({}),
    async execute() {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const auth = getAuthHeader(publicKey, privateKey);
      const res = await fetch(`${baseUrl}/api/wallets?npub=${Nip19.npubEncode(publicKey)}`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error(`list_wallets failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "delete_wallet",
    description: "Delete a wallet by address. Removes from TEE storage and trading-data.",
    parameters: Type.Object({
      walletAddress: Type.String({ description: "Wallet address (0x...) to delete" }),
    }),
    async execute(_id: string, params: { walletAddress: string }) {
      const { privateKey, publicKey } = loadKeys(pluginConfig);
      const npub = Nip19.npubEncode(publicKey);
      const auth = getAuthHeader(publicKey, privateKey);
      const result: Record<string, unknown> = {};
      const signedAt = Math.floor(Date.now() / 1000);
      debugLog("delete_wallet", "entry", { walletAddress: params.walletAddress });

      // Step 1: Remove from wallet-agent (TEE)
      try {
        const body = { wallet_address: params.walletAddress, signed_at: signedAt };
        const res = await fetch(`${walletAgentUrl}/wallets/${params.walletAddress}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        debugLog("delete_wallet", "tee.res", { status: res.status });
        result.tee = { ok: res.ok };
      } catch (e: any) {
        result.tee = { ok: false, error: e.message };
      }

      // Step 2: Remove from trading-data
      try {
        const createdAt = signedAt;
        const sigData = { created_at: createdAt, wallet_address: params.walletAddress, action: "disconnected", npub };
        const signature = Signer.getSignature(sigData, privateKey, {
          created_at: "number", wallet_address: "string", action: "string", npub: "string",
        } as const);
        const res = await fetch(`${baseUrl}/api/wallets`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Authorization: auth },
          body: JSON.stringify({ npub, walletAddress: params.walletAddress, signature, createdAt, agents: [] }),
        });
        debugLog("delete_wallet", "trading-data.res", { status: res.status });
        result.tradingData = { ok: res.ok };
      } catch (e: any) {
        result.tradingData = { ok: false, error: e.message };
      }

      debugLog("delete_wallet", "result", result);
      return textResult(result);
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

  // ── Fill execution notifications ─────────────────────────────────

  function formatFillNotification(event: any): string {
    const { agent_name, symbol, side, is_entry, base_amount, execution_price, success } = event;
    if (!success) return `[Trade Failed] ${agent_name}: ${symbol} ${side} failed`;
    const action = is_entry ? "Opened" : "Closed";
    return `[Trade] ${agent_name}: ${action} ${side} ${base_amount} ${symbol} @ $${execution_price}`;
  }

  function readOpenClawConfig(): { botToken: string | null; chatId: string | null } {
    const openclawDir = path.join(os.homedir(), ".openclaw");
    let botToken: string | null = null;
    let chatId: string | null = null;
    try {
      const config = JSON.parse(fs.readFileSync(path.join(openclawDir, "openclaw.json"), "utf8"));
      botToken = config.channels?.telegram?.botToken ?? null;
    } catch {}
    try {
      const allowFrom = JSON.parse(fs.readFileSync(path.join(openclawDir, "credentials", "telegram-allowFrom.json"), "utf8"));
      chatId = allowFrom.allowFrom?.[0] ?? null;
    } catch {}
    return { botToken, chatId };
  }

  let telegramBotToken: string | null = null;
  let telegramChatId: string | null = null;

  async function sendNotification(message: string) {
    if (!telegramBotToken || !telegramChatId) {
      const config = readOpenClawConfig();
      telegramBotToken = config.botToken;
      telegramChatId = config.chatId;
      if (!telegramBotToken || !telegramChatId) return;
    }
    try {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChatId, text: message }),
      });
    } catch {}
  }

  const mqttBrokerUrl: string | undefined = pluginConfig.mqttBrokerUrl;
  if (mqttBrokerUrl) {
    const mqttTopic: string = pluginConfig.mqttFillExecutionsTopic ?? "fill_executions";

    api.registerService({
      id: "fill-notifications",
      start() {
        const mqttPort = pluginConfig.mqttPort ?? 8883;
        const mqttProtocol = mqttPort === 8883 || mqttPort === 443 ? "mqtts" : "mqtt";
        const client = mqtt.connect(`${mqttProtocol}://${mqttBrokerUrl}`, {
          port: mqttPort,
          username: pluginConfig.mqttUsername,
          password: pluginConfig.mqttPassword,
          reconnectPeriod: 5000,
          protocol: mqttProtocol,
        });

        client.on("connect", () => {
          client.subscribe(mqttTopic);
        });

        client.on("message", (_topic: string, payload: Buffer) => {
          try {
            const event = JSON.parse(payload.toString());
            const msg = formatFillNotification(event);
            sendNotification(msg);
          } catch (e: any) {
            debugLog("fill-notifications", "parse-error", e.message);
          }
        });

        this.client = client;
      },
      stop() {
        this.client?.end();
      },
    });
  }
}
