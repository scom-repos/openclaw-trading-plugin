import { Type } from "@sinclair/typebox";
import { Keys, Nip19, Signer } from "@scom/scom-signer";
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
});

const Strategy = Type.Object({
  name: Type.String({ description: "Strategy name" }),
  symbol: Type.String({ description: 'Trading pair, e.g. "ETH/USDC"' }),
  indicators: Type.Array(IndicatorConfig),
  rules: Type.Array(RuleConfig),
  risk_manager: Type.Optional(RiskManagerConfig),
});

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://agent02.decom.dev";
const DEFAULT_BOT_URL =
  "https://c8fdf099a1934bcabb0ca29685ef945f8ed30148-8081.dstack-pha-prod9.phala.network/trading-bot-demo";

function loadKeys(config: any): {
  privateKey: string;
  publicKey: string;
  npub: string;
} {
  // Prefer explicit plugin config, but fall back to env for convenience.
  const pk =
    (config?.nostrPrivateKey && config.nostrPrivateKey !== "${NOSTR_PRIVATE_KEY}"
      ? config.nostrPrivateKey
      : undefined) ??
    process.env.NOSTR_PRIVATE_KEY;

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

function persistKeyToEnv(privateKey: string): boolean {
  const envPath = path.join(os.homedir(), ".openclaw", ".env");
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf-8");
  } catch {}
  if (content.includes("NOSTR_PRIVATE_KEY=")) return false;
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const sep = content.length && !content.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(envPath, `${sep}NOSTR_PRIVATE_KEY=${privateKey}\n`);
  return true;
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export default function (api: any) {
  const baseUrl: string = api.config?.baseUrl ?? DEFAULT_BASE_URL;
  const tradingBotUrl: string = api.config?.tradingBotUrl ?? DEFAULT_BOT_URL;

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
    }),
    async execute(_id: string, params: { privateKey?: string }) {
      let pk = api.config?.nostrPrivateKey;
      const fromConfig = pk && pk !== "${NOSTR_PRIVATE_KEY}";

      if (fromConfig) {
        const publicKey = Keys.getPublicKey(pk);
        return textResult({
          privateKey: pk,
          publicKey,
          nsec: Nip19.nsecEncode(pk),
          npub: Nip19.npubEncode(publicKey),
          persisted: false,
        });
      }

      pk = params.privateKey ?? Keys.generatePrivateKey();
      const persisted = persistKeyToEnv(pk);
      const publicKey = Keys.getPublicKey(pk);
      return textResult({
        privateKey: pk,
        publicKey,
        nsec: Nip19.nsecEncode(pk),
        npub: Nip19.npubEncode(publicKey),
        persisted,
      });
    },
  });

  api.registerTool({
    name: "get_trading_pairs",
    description: "Get available trading pairs",
    parameters: Type.Object({}),
    async execute() {
      const res = await fetch(`${baseUrl}/api/trading-pairs`);
      if (!res.ok) throw new Error(`trading-pairs failed: ${res.status}`);
      return textResult(await res.json());
    },
  });

  api.registerTool({
    name: "create_agent",
    description: "Create a new paper trading agent",
    parameters: Type.Object({
      name: Type.String({ description: "Agent name" }),
      initialCapital: Type.Number({ description: "Initial capital amount" }),
      poolId: Type.Number({ description: "Trading pool ID" }),
      mode: Type.Optional(
        Type.String({ description: "Trading mode", default: "paper" }),
      ),
      marketType: Type.Optional(
        Type.String({ description: "Market type", default: "spot" }),
      ),
      strategy: Type.Optional(Strategy),
    }),
    async execute(
      _id: string,
      params: {
        name: string;
        initialCapital: number;
        poolId: number;
        mode?: string;
        marketType?: string;
        strategy?: Record<string, unknown>;
      },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(api.config);
      const auth = getAuthHeader(publicKey, privateKey);

      const payload: Record<string, unknown> = {
        name: params.name,
        initialCapital: params.initialCapital,
        poolId: params.poolId,
        mode: params.mode ?? "paper",
        marketType: params.marketType ?? "spot",
        owner: npub,
        pubkey: publicKey,
        chainId: 1,
      };
      if (params.strategy) payload.strategy = params.strategy;
      const res = await fetch(`${baseUrl}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload),
      });
      if (!res.ok)
        throw new Error(
          `create_agent failed: ${res.status} ${await res.text()}`,
        );
      return textResult(await res.json());
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
        Type.String({ description: "Trading mode", default: "paper" }),
      ),
      marketType: Type.Optional(
        Type.String({ description: "Market type", default: "spot" }),
      ),
      strategy: Type.Optional(Strategy),
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
        strategy?: Record<string, unknown>;
      },
    ) {
      const { privateKey, publicKey, npub } = loadKeys(api.config);
      const signedAt = Math.floor(Date.now() / 1000);

      const body = {
        id: params.agentId,
        name: params.name,
        owner: npub,
        avatar_url: null,
        initial_capital: params.initialCapital,
        strategy_config: params.strategy ?? {
          name: params.name,
          symbol: params.pairSymbol,
          indicators: [],
          rules: [],
          risk_manager: {},
        },
        description: null,
        mode: params.mode ?? "paper",
        signed_at: signedAt,
        market_type: params.marketType ?? "spot",
      };
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
      const { privateKey, publicKey } = loadKeys(api.config);
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
}
