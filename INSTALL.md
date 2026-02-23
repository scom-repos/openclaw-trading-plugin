# Installation

## 1. Install OpenClaw

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Follow the prompts to complete setup. Use defaults unless specified below:

- **Onboarding:** Quick start
- **Model provider:** Kimi K2.5 (paste your Kimi API key)
- **Channel:** Telegram (paste your bot token)

## 2. Install the Trading Plugin

```bash
git clone https://github.com/scom-repos/openclaw-trading-plugin.git
cd openclaw-trading-plugin
npm install
openclaw plugins install -l .
```

## 3. Configure the Plugin

Edit `~/openclaw/.env` and add the plugin config with your Nostr private key:

```json

```

## 4. Start the Gateway

```bash
openclaw gateway restart
```

You can now chat with the trading plugin via your Telegram bot.
