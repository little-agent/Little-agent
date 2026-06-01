# Langfuse Observability Plugin

This plugin ships bundled with Little but is **opt-in** — it only loads when
you explicitly enable it.

## Enable

```bash
pip install langfuse
little plugins enable observability/langfuse
```

Or check the box in the interactive `little plugins` UI.

## Required credentials

Set these in `~/.little/.env`:

```bash
LITTLE_LANGFUSE_PUBLIC_KEY=pk-lf-...
LITTLE_LANGFUSE_SECRET_KEY=sk-lf-...
LITTLE_LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-hosted URL
```

Without the SDK or credentials the hooks no-op silently — the plugin fails
open.

## Verify

```bash
little plugins list                 # observability/langfuse should show "enabled"
little chat -q "hello"              # then check Langfuse for a "Little turn" trace
```

## Optional tuning

```bash
LITTLE_LANGFUSE_ENV=production       # environment tag
LITTLE_LANGFUSE_RELEASE=v1.0.0       # release tag
LITTLE_LANGFUSE_SAMPLE_RATE=0.5      # sample 50% of traces
LITTLE_LANGFUSE_MAX_CHARS=12000      # max chars per field (default: 12000)
LITTLE_LANGFUSE_DEBUG=true           # verbose plugin logging
```

## Disable

```bash
little plugins disable observability/langfuse
```
