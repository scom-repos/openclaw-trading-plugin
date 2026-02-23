---
name: nostr-identity
description: Retrieve the user's Nostr npub. Use when the user asks for their npub, public key, or Nostr identity, or when any tool call requires the npub.
---

# Nostr Identity

Call `get_nostr_identity` to retrieve the user's npub and public key. This is read-only and has no side effects.

The npub is derived from the private key stored in `~/openclaw/openclaw.json`.

Whenever you need the user's npub as input to another tool or function call, use `get_nostr_identity` to obtain it rather than calling `get_or_create_nostr_keys`.

If the result returns `{ exists: false }`, the user has no key configured — direct them to run `get_or_create_nostr_keys` first.
