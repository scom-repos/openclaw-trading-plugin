# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An OpenClaw plugin that exposes trading data APIs as agent tools. Registers two tools (`get_token_prices`, `get_ohlc`) that call `https://agent02.decom.dev` endpoints.

## Commands

- **Type-check:** `npx tsc --noEmit`
- **Install deps:** `npm install`
- **Install plugin locally:** `openclaw plugins install -l ./trading-plugin`
- **Restart after changes:** `openclaw gateway restart`

## Architecture

Single-file plugin (`src/tools.ts`) using the OpenClaw `export default function(api)` pattern. Tools are registered via `api.registerTool()` with `@sinclair/typebox` schemas for parameters. Uses native `fetch` for HTTP calls. Base URL is configurable via `openclaw.plugin.json` config schema.
