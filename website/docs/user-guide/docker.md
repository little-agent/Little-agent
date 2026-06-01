---
sidebar_position: 7
title: "Docker"
description: "Running Little Agent in Docker and using Docker as a terminal backend"
---

# Little Agent — Docker

There are two distinct ways Docker intersects with Little Agent:

1. **Running Little IN Docker** — the agent itself runs inside a container (this page's primary focus)
2. **Docker as a terminal backend** — the agent runs on your host but executes every command inside a single, persistent Docker sandbox container that survives across tool calls, `/new`, and subagents for the life of the Little process (see [Configuration → Docker Backend](./configuration.md#docker-backend))

This page covers option 1. The container stores all user data (config, API keys, sessions, skills, memories) in a single directory mounted from the host at `/opt/data`. The image itself is stateless and can be upgraded by pulling a new version without losing any configuration.

## Quick start

If this is your first time running Little Agent, create a data directory on the host and start the container interactively to run the setup wizard:

```sh
mkdir -p ~/.little
docker run -it --rm \
  -v ~/.little:/opt/data \
  little-agent/Little-agent setup
```

This drops you into the setup wizard, which will prompt you for your API keys and write them to `~/.little/.env`. You only need to do this once. It is highly recommended to set up a chat system for the gateway to work with at this point.

:::tip
Inside the container, run `little setup --portal` once — the refresh token persists in the mounted `~/.little` volume. See [Nous Portal](/integrations/nous-portal).
:::

## Running in gateway mode

Once configured, run the container in the background as a persistent gateway (Telegram, Discord, Slack, WhatsApp, etc.):

```sh
docker run -d \
  --name little \
  --restart unless-stopped \
  -v ~/.little:/opt/data \
  -p 8642:8642 \
  little-agent/Little-agent gateway run
```

Port 8642 exposes the gateway's [OpenAI-compatible API server](./features/api-server.md) and health endpoint. It's optional if you only use chat platforms (Telegram, Discord, etc.), but required if you want the dashboard or external tools to reach the gateway.

:::tip Gateway runs supervised
Inside the official Docker image, `gateway run` is **automatically supervised by s6-overlay**: if the gateway process crashes it's restarted within a couple of seconds without losing the container, and the dashboard (when `LITTLE_DASHBOARD=1` is set) is supervised alongside it. The `gateway run` CMD process itself is a `sleep infinity` heartbeat that keeps the container alive while s6 manages the actual gateway process — so `docker stop` still shuts everything down cleanly, but `docker logs` shows the supervised gateway's output.

You'll see a one-line breadcrumb in `docker logs` confirming the upgrade. To opt out — and get the historical "gateway is the container's main process, container exit = gateway exit" semantics — pass `--no-supervise` or set `LITTLE_GATEWAY_NO_SUPERVISE=1`. The opt-out is useful for CI smoke tests that want the container to exit with the gateway's status code; for production deployments the supervised default is strictly better.

This behavior applies to the s6-based image only. Earlier (tini-based) images still run `gateway run` as the foreground main process.
:::

:::note Where gateway logs go
Inside the s6 image, the supervised gateway's output is tee'd to two destinations:

- **`docker logs <container>`** — every line in real time (raw, no extra prefix). This is the same stream you'd get from a foreground gateway, so existing `docker logs --follow` / `--timestamps` / log-shipper integrations work unchanged.
- **`${LITTLE_HOME}/logs/gateways/<profile>/current`** (mapped to `~/.little/logs/gateways/<profile>/current` on the host via the volume mount) — rotated, with an ISO 8601 timestamp prepended per line. Rotation is 10 archives × 1 MB each, so it can't fill the disk. This is what `little logs` reads and what survives container restarts.

The per-profile reconciler keeps a separate audit log at `${LITTLE_HOME}/logs/container-boot.log` — one line per profile per container boot, recording whether each gateway was restored to its prior state.
:::

Note: the API server is gated on `API_SERVER_ENABLED=true`. To expose it beyond `127.0.0.1` inside the container, also set `API_SERVER_HOST=0.0.0.0` and an `API_SERVER_KEY` (minimum 8 characters — generate one with `openssl rand -hex 32`). Example:

```sh
docker run -d \
  --name little \
  --restart unless-stopped \
  -v ~/.little:/opt/data \
  -p 8642:8642 \
  -e API_SERVER_ENABLED=true \
  -e API_SERVER_HOST=0.0.0.0 \
  -e API_SERVER_KEY="$(openssl rand -hex 32)" \
  -e API_SERVER_CORS_ORIGINS='*' \
  little-agent/Little-agent gateway run
```

Opening any port on an internet facing machine is a security risk. You should not do it unless you understand the risks.

## Running the dashboard

The built-in web dashboard runs as an optional side-process inside the same container as the gateway. Set `LITTLE_DASHBOARD=1` to run the dashboard on container loopback (`127.0.0.1`) by default:

```sh
docker run -d \
  --name little \
  --restart unless-stopped \
  -v ~/.little:/opt/data \
  -p 8642:8642 \
  -e LITTLE_DASHBOARD=1 \
  little-agent/Little-agent gateway run
```

The entrypoint starts `little dashboard` in the background (running as the non-root `little` user) before `exec`-ing the main command. Dashboard output is prefixed with `[dashboard]` in `docker logs` so it's easy to separate from gateway logs.

| Environment variable | Description | Default |
|---------------------|-------------|---------|
| `LITTLE_DASHBOARD` | Set to `1` (or `true` / `yes`) to launch the dashboard alongside the main command | *(unset — dashboard not started)* |
| `LITTLE_DASHBOARD_HOST` | Bind address for the dashboard HTTP server | `127.0.0.1` |
| `LITTLE_DASHBOARD_PORT` | Port for the dashboard HTTP server | `9119` |
| `LITTLE_DASHBOARD_TUI` | Set to `1` to expose the in-browser Chat tab (embedded `little --tui` via PTY/WebSocket) | *(unset)* |

By default, the dashboard stays on loopback to avoid exposing the unauthenticated web surface over the network. To publish it intentionally, set `LITTLE_DASHBOARD_HOST=0.0.0.0` and configure your own trusted network boundary/reverse proxy. In that case you must explicitly add `--insecure` behavior by passing host/flags in your command path (the entrypoint no longer auto-enables insecure mode).

:::note
The dashboard runs as a supervised s6 service inside the container. If
the dashboard process crashes, s6-overlay restarts it automatically
after a short backoff — you'll see a new PID without needing to
restart the container. Logs and crash output are visible via
`docker logs <container>` (s6 forwards service stdout/stderr there).

Running the dashboard as a separate container is not supported: its
gateway-liveness detection requires a shared PID namespace with the
gateway process.
:::

## Running interactively (CLI chat)

To open an interactive chat session against a running data directory:

```sh
docker run -it --rm \
  -v ~/.little:/opt/data \
  little-agent/Little-agent
```

Or if you have already opened a terminal in your running container (via Docker Desktop for instance), just run:

```sh
/opt/little/.venv/bin/little
```

## Persistent volumes

The `/opt/data` volume is the single source of truth for all Little state. It maps to your host's `~/.little/` directory and contains:

| Path | Contents |
|------|----------|
| `.env` | API keys and secrets |
| `config.yaml` | All Little configuration |
| `SOUL.md` | Agent personality/identity |
| `sessions/` | Conversation history |
| `memories/` | Persistent memory store |
| `skills/` | Installed skills |
| `home/` | Per-profile HOME for Little tool subprocesses (`git`, `ssh`, `gh`, `npm`, and skill CLIs) |
| `cron/` | Scheduled job definitions |
| `hooks/` | Event hooks |
| `logs/` | Runtime logs |
| `skins/` | Custom CLI skins |

Skill CLIs that store credentials under `~` must be initialized against the subprocess HOME, not just the data-volume root. For example, the [xurl skill](./skills/bundled/social-media/social-media-xurl.md) stores OAuth state in `~/.xurl`; in the official Docker layout, Little tool calls read that as `/opt/data/home/.xurl`, so run manual xurl auth with `HOME=/opt/data/home` and verify with `HOME=/opt/data/home xurl auth status`.

:::warning
Never run two Little **gateway** containers against the same data directory simultaneously — session files and memory stores are not designed for concurrent write access.
:::

## Multi-profile support

Little supports [multiple profiles](../reference/profile-commands.md) — separate `~/.little/` directories that let you run independent agents (different SOUL, skills, memory, sessions, credentials) from a single installation. **When running under Docker, using Little' built-in multi-profile feature is not recommended.**

Instead, the recommended pattern is **one container per profile**, with each container bind-mounting its own host directory as `/opt/data`:

```sh
# Work profile
docker run -d \
  --name little-work \
  --restart unless-stopped \
  -v ~/.little-work:/opt/data \
  -p 8642:8642 \
  little-agent/Little-agent gateway run

# Personal profile
docker run -d \
  --name little-personal \
  --restart unless-stopped \
  -v ~/.little-personal:/opt/data \
  -p 8643:8642 \
  little-agent/Little-agent gateway run
```

Why separate containers over profiles in Docker:

- **Isolation** — each container has its own filesystem, process table, and resource limits. A crash, dependency change, or runaway session in one profile can't affect another.
- **Independent lifecycle** — upgrade, restart, pause, or roll back each agent separately (`docker restart little-work` leaves `little-personal` untouched).
- **Clean port and network separation** — each gateway binds its own host port; there's no risk of cross-talk between chat platforms or API servers.
- **Simpler mental model** — the container *is* the profile. Backups, migrations, and permissions all follow the bind-mounted directory, with no extra `--profile` flags to remember.
- **Avoids concurrent-write risk** — the warning above about never running two gateways against the same data directory still applies to profiles within a single container.

In Docker Compose, this just means declaring one service per profile with distinct `container_name`, `volumes`, and `ports`:

```yaml
services:
  little-work:
    image: little-agent/Little-agent:latest
    container_name: little-work
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
    volumes:
      - ~/.little-work:/opt/data

  little-personal:
    image: little-agent/Little-agent:latest
    container_name: little-personal
    restart: unless-stopped
    command: gateway run
    ports:
      - "8643:8642"
    volumes:
      - ~/.little-personal:/opt/data
```

## Environment variable forwarding

API keys are read from `/opt/data/.env` inside the container. You can also pass environment variables directly:

```sh
docker run -it --rm \
  -v ~/.little:/opt/data \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e OPENAI_API_KEY="sk-..." \
  little-agent/Little-agent
```

Direct `-e` flags override values from `.env`. This is useful for CI/CD or secrets-manager integrations where you don't want keys on disk.

:::note Looking for Docker as the **terminal backend**?
This page covers running Little itself inside Docker. If you want Little to execute the agent's `terminal` / `execute_code` calls inside a Docker sandbox container (one persistent container per Little process), that's a separate config block — `terminal.backend: docker` plus `terminal.docker_image`, `terminal.docker_volumes`, `terminal.docker_forward_env`, `terminal.docker_run_as_host_user`, and `terminal.docker_extra_args`. See [Configuration → Docker Backend](configuration.md#docker-backend) for the full set.
:::

## Docker Compose example

For persistent deployment with both the gateway and dashboard, a `docker-compose.yaml` is convenient:

```yaml
services:
  little:
    image: little-agent/Little-agent:latest
    container_name: little
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"   # gateway API
      - "9119:9119"   # dashboard (only reached when LITTLE_DASHBOARD=1)
    volumes:
      - ~/.little:/opt/data
    environment:
      - LITTLE_DASHBOARD=1
      # Uncomment to forward specific env vars instead of using .env file:
      # - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      # - OPENAI_API_KEY=${OPENAI_API_KEY}
      # - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: "2.0"
```

Start with `docker compose up -d` and view logs with `docker compose logs -f`. Dashboard output is prefixed with `[dashboard]` so it's easy to filter from gateway logs.

## Optional: Linux desktop audio bridge

Voice mode in Docker needs two separate things to work: Little must be allowed to probe audio devices inside the container, and the container must be able to reach your host audio server. The setup below covers the host audio plumbing for Linux desktops that expose a PulseAudio-compatible socket, including many PipeWire setups.

:::caution
This is a Linux desktop workaround, not a general Docker Desktop feature. It is useful when you already have host audio working and want CLI voice mode inside the Little container. If Little still reports `Running inside Docker container -- no audio devices`, use a build that includes Docker audio probing support for `PULSE_SERVER` / `PIPEWIRE_REMOTE`.
:::

First, create an ALSA config next to your Compose file:

```conf title="asound.conf"
pcm.!default {
    type pulse
    hint {
        show on
        description "Default ALSA Output (PulseAudio)"
    }
}

pcm.pulse {
    type pulse
}

ctl.!default {
    type pulse
}
```

Then build a small derived image with the ALSA PulseAudio plugin installed:

```dockerfile title="Dockerfile.audio"
FROM little-agent/Little-agent:latest

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends libasound2-plugins \
    && rm -rf /var/lib/apt/lists/*
```

Use that image in Compose and pass through the host user's PulseAudio socket and cookie:

```yaml
services:
  little:
    build:
      context: .
      dockerfile: Dockerfile.audio
    image: little-agent-audio
    container_name: little
    restart: unless-stopped
    command: gateway run
    volumes:
      - ~/.little:/opt/data
      - /run/user/${LITTLE_UID}/pulse:/run/user/${LITTLE_UID}/pulse
      - ~/.config/pulse/cookie:/tmp/pulse-cookie:ro
      - ./asound.conf:/etc/asound.conf:ro
    environment:
      - LITTLE_UID=${LITTLE_UID}
      - LITTLE_GID=${LITTLE_GID}
      - XDG_RUNTIME_DIR=/run/user/${LITTLE_UID}
      - PULSE_SERVER=unix:/run/user/${LITTLE_UID}/pulse/native
      - PULSE_COOKIE=/tmp/pulse-cookie
```

Start it with your host UID/GID so the container process can access the per-user audio socket:

```sh
export LITTLE_UID="$(id -u)"
export LITTLE_GID="$(id -g)"
docker compose up -d --build
```

To verify what PortAudio sees inside the container:

```sh
docker exec little /opt/little/.venv/bin/python -c "import sounddevice as sd; print(sd.query_devices())"
```

## Resource limits

The Little container needs moderate resources. Recommended minimums:

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| Memory | 1 GB | 2–4 GB |
| CPU | 1 core | 2 cores |
| Disk (data volume) | 500 MB | 2+ GB (grows with sessions/skills) |

Browser automation (Playwright/Chromium) is the most memory-hungry feature. If you don't need browser tools, 1 GB is sufficient. With browser tools active, allocate at least 2 GB.

Set limits in Docker:

```sh
docker run -d \
  --name little \
  --restart unless-stopped \
  --memory=4g --cpus=2 \
  -v ~/.little:/opt/data \
  little-agent/Little-agent gateway run
```

## What the Dockerfile does

The official image is based on `debian:13.4` and includes:

- Python 3 with all Little dependencies (`uv pip install -e ".[all]"`)
- Node.js + npm (for browser automation and WhatsApp bridge)
- Playwright with Chromium (`npx playwright install --with-deps chromium --only-shell`)
- ripgrep, ffmpeg, git, and `xz-utils` as system utilities
- **`docker-cli`** — so agents running inside the container can drive the host's Docker daemon (bind-mount `/var/run/docker.sock` to opt in) for `docker build`, `docker run`, container inspection, etc.
- **`openssh-client`** — enables the [SSH terminal backend](/user-guide/configuration#ssh-backend) from inside the container. The SSH backend shells out to the system `ssh` binary; without this, it failed silently in containerized installs.
- The WhatsApp bridge (`scripts/whatsapp-bridge/`)
- **[`s6-overlay`](https://github.com/just-containers/s6-overlay) v3** as PID 1 (replaces the older `tini`) — supervises the dashboard and per-profile gateways with auto-restart on crash, reaps zombie subprocesses, and forwards signals.

The container's `ENTRYPOINT` is s6-overlay's `/init`. On boot it:
1. Runs `/etc/cont-init.d/01-little-setup` (= `docker/stage2-hook.sh`) as root: optional UID/GID remap, fixes volume ownership, seeds `.env` / `config.yaml` / `SOUL.md` on first boot, syncs bundled skills.
2. Runs `/etc/cont-init.d/02-reconcile-profiles` (= `little_cli.container_boot`): walks `$LITTLE_HOME/profiles/<name>/`, recreates the per-profile gateway s6 service slot under `/run/service/gateway-<profile>/`, and auto-starts only those whose last recorded state was `running` (see [Per-profile gateway supervision](#per-profile-gateway-supervision)).
3. Starts the static `main-little` and `dashboard` s6-rc services.
4. Exec's the container's CMD as the main program (`/opt/little/docker/main-wrapper.sh`), which routes the arguments the user passed to `docker run`:
   - no args → `little` (the default)
   - first arg is an executable on PATH (e.g. `sleep`, `bash`) → exec it directly
   - anything else → `little <args>` (subcommand passthrough)
   The container exits when this main program exits, with its exit code.

:::warning Breaking change vs. pre-s6 images
The container ENTRYPOINT is now `/init` (s6-overlay), not `/usr/bin/tini`. All five documented `docker run` invocation patterns (no args, `chat -q "…"`, `sleep infinity`, `bash`, `--tui`) behave identically to the tini-based image. If you have a downstream wrapper that depended on tini-specific signal behavior or hard-coded `/usr/bin/tini --` invocation, pin to the previous image tag.
:::

:::warning Privilege model
Do not override the image entrypoint unless you keep `/init` (or, equivalently, the legacy `docker/entrypoint.sh` shim that forwards to the stage2 hook) in the command chain. s6-overlay's `/init` runs as root so it can chown the volume on first boot, then drops to the `little` user via `s6-setuidgid` for every supervised service AND for the main program. Starting `little gateway run` as root inside the official image is refused by default because it can leave root-owned files in `/opt/data` and break later dashboard or gateway starts. Set `LITTLE_ALLOW_ROOT_GATEWAY=1` only when you intentionally accept that risk.
:::

### Per-profile gateway supervision

Inside the container, each profile created with `little profile create <name>` automatically gets an s6-supervised gateway service registered at `/run/service/gateway-<name>/`. The lifecycle commands you'd run on the host work the same way:

```sh
little profile create coder            # registers gateway-coder s6 slot
little -p coder gateway start          # s6-svc -u  → supervised gateway
little -p coder gateway stop           # s6-svc -d  → service down
little -p coder gateway restart        # s6-svc -t  → SIGTERM the supervisor
little profile delete coder            # tears down the s6 slot
```

**Supervision benefits over the pre-s6 image:**

- Gateway crashes are auto-restarted by `s6-supervise` after a ~1s backoff.
- Dashboard crashes are auto-restarted (set `LITTLE_DASHBOARD=1` to start it).
- `docker restart` preserves running gateways: the cont-init reconciler reads `$LITTLE_HOME/profiles/<name>/gateway_state.json` and brings the slot back up if the last recorded state was `running`. Stopped gateways stay stopped.
- Per-profile gateway logs persist under `$LITTLE_HOME/logs/gateways/<profile>/current` (rotated by `s6-log`), and the reconciler's actions are appended to `$LITTLE_HOME/logs/container-boot.log` per boot.

`little status` inside the container reports `Manager: s6 (container supervisor)`. Use `/command/s6-svstat /run/service/gateway-<name>` for the raw supervisor view (note `/command/` is on PATH for supervision-tree processes only; pass the absolute path when calling from `docker exec`).

## Upgrading

Pull the latest image and recreate the container. Your data directory is untouched.

```sh
docker pull little-agent/Little-agent:latest
docker rm -f little
docker run -d \
  --name little \
  --restart unless-stopped \
  -v ~/.little:/opt/data \
  little-agent/Little-agent gateway run
```

Or with Docker Compose:

```sh
docker compose pull
docker compose up -d
```

## Skills and credential files

When using Docker as the execution environment (not the methods above, but when the agent runs commands inside a Docker sandbox — see [Configuration → Docker Backend](./configuration.md#docker-backend)), Little reuses a single long-lived container for all tool calls and automatically bind-mounts the skills directory (`~/.little/skills/`) and any credential files declared by skills into that container as read-only volumes. Skill scripts, templates, and references are available inside the sandbox without manual configuration, and because the container persists for the life of the Little process, any dependencies you install or files you write stay around for the next tool call.

The same syncing happens for SSH and Modal backends — skills and credential files are uploaded via rsync or the Modal mount API before each command.

## Installing more tools in the container

The official image ships with a curated set of utilities (see [What the Dockerfile does](#what-the-dockerfile-does)), but not every tool an agent might want is preinstalled. There are five recommended approaches, in increasing order of effort and durability.

### npm or Python tools — use `npx` or `uvx`

For any tool published to npm or PyPI, instruct Little to run it via `npx` (npm) or `uvx` (Python) and to remember that command in its persistent memory. If the tool needs a config file or credentials, instruct it to drop those under `/opt/data` (e.g. `/opt/data/<tool>/config.yaml`).

Dependencies are fetched on demand and cached for the life of the container. Configuration written under `/opt/data` survives container restarts because it lives on the bind-mounted host directory. The package cache itself is rebuilt after a `docker rm`, but `npx` and `uvx` re-fetch transparently the next time the tool runs.

### Other tools (apt packages, binaries) — install and remember

For anything outside npm or PyPI — `apt` packages, prebuilt binaries, language runtimes not already in the image — instruct Little how to install it (e.g. `apt-get update && apt-get install -y <package>`) and tell it to remember the install command. The tool persists for the rest of the container's lifetime, and Little will re-run the install command after a container restart when it next needs the tool.

This is a good fit for tools that are quick to install and used occasionally. For tools used constantly, prefer the next approach.

### Durable installs — build a derived image

When a tool must be available immediately on every container start with no re-install delay, build a new image that inherits from `little-agent/Little-agent` and installs the tool in a layer:

```dockerfile
FROM little-agent/Little-agent:latest

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends <your-package> \
    && rm -rf /var/lib/apt/lists/*
USER little
```

Build it and use it in place of the official image:

```sh
docker build -t my-little:latest .
docker run -d \
  --name little \
  --restart unless-stopped \
  -v ~/.little:/opt/data \
  -p 8642:8642 \
  my-little:latest gateway run
```

The entrypoint script and `/opt/data` semantics are inherited unchanged, so the rest of this page still applies. Remember to rebuild the image when pulling a newer upstream `little-agent/Little-agent`.

### Complex tools or multi-service stacks — run a sidecar container

For tools that bring their own service (a database, a web server, a queue, a headless browser farm) or that are too heavy to live inside the Little container, run them as a separate container on a shared Docker network. Little reaches the sidecar by container name, the same way it reaches a local inference server (see [Connecting to local inference servers](#connecting-to-local-inference-servers-vllm-ollama-etc)).

```yaml
services:
  little:
    image: little-agent/Little-agent:latest
    container_name: little
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
    volumes:
      - ~/.little:/opt/data
    networks:
      - little-net

  my-tool:
    image: example/my-tool:latest
    container_name: my-tool
    restart: unless-stopped
    networks:
      - little-net

networks:
  little-net:
    driver: bridge
```

From inside the Little container, the sidecar is reachable at `http://my-tool:<port>` (or whatever protocol it serves). This pattern keeps each service's lifecycle, resource limits, and upgrade cadence independent, and avoids bloating the Little image with dependencies that are only needed by one tool.

### Broadly useful tools — open an issue or pull request

If a tool is likely to be useful to most Little Agent users, consider contributing it upstream rather than carrying it in a private derived image. Open an issue or pull request on the [little-agent repository](https://github.com/little-agent/Little-agent) describing the tool and its use case. Tools that get bundled into the official image benefit every user and avoid the maintenance overhead of a downstream fork.

## Connecting to local inference servers (vLLM, Ollama, etc.)

When running Little in Docker and your inference server (vLLM, Ollama, text-generation-inference, etc.) is also running on the host or in another container, networking requires extra attention.

### Docker Compose (recommended)

Put both services on the same Docker network. This is the most reliable approach:

```yaml
services:
  vllm:
    image: vllm/vllm-openai:latest
    container_name: vllm
    command: >
      --model Qwen/Qwen2.5-7B-Instruct
      --served-model-name my-model
      --host 0.0.0.0
      --port 8000
    ports:
      - "8000:8000"
    networks:
      - little-net
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]

  little:
    image: little-agent/Little-agent:latest
    container_name: little
    restart: unless-stopped
    command: gateway run
    ports:
      - "8642:8642"
    volumes:
      - ~/.little:/opt/data
    networks:
      - little-net

networks:
  little-net:
    driver: bridge
```

Then in your `~/.little/config.yaml`, use the **container name** as the hostname:

```yaml
model:
  provider: custom
  model: my-model
  base_url: http://vllm:8000/v1
  api_key: "none"
```

:::tip Key points
- Use the **container name** (`vllm`) as the hostname — not `localhost` or `127.0.0.1`, which refer to the Little container itself.
- The `model` value must match the `--served-model-name` you passed to vLLM.
- Set `api_key` to any non-empty string (vLLM requires the header but doesn't validate it by default).
- Do **not** include a trailing slash in `base_url`.
:::

### Standalone Docker run (no Compose)

If your inference server runs directly on the host (not in Docker), use `host.docker.internal` on macOS/Windows, or `--network host` on Linux:

**macOS / Windows:**

```sh
docker run -d \
  --name little \
  -v ~/.little:/opt/data \
  -p 8642:8642 \
  little-agent/Little-agent gateway run
```

```yaml
# config.yaml
model:
  provider: custom
  model: my-model
  base_url: http://host.docker.internal:8000/v1
  api_key: "none"
```

**Linux (host networking):**

```sh
docker run -d \
  --name little \
  --network host \
  -v ~/.little:/opt/data \
  little-agent/Little-agent gateway run
```

```yaml
# config.yaml
model:
  provider: custom
  model: my-model
  base_url: http://127.0.0.1:8000/v1
  api_key: "none"
```

:::warning With `--network host`, the `-p` flag is ignored — all container ports are directly exposed on the host.
:::

### Verifying connectivity

From inside the Little container, confirm the inference server is reachable:

```sh
docker exec little curl -s http://vllm:8000/v1/models
```

You should see a JSON response listing your served model. If this fails, check:

1. Both containers are on the same Docker network (`docker network inspect little-net`)
2. The inference server is listening on `0.0.0.0`, not `127.0.0.1`
3. The port number matches

### Ollama

Ollama works the same way. If Ollama runs on the host, use `host.docker.internal:11434` (macOS/Windows) or `127.0.0.1:11434` (Linux with `--network host`). If Ollama runs in its own container on the same Docker network:

```yaml
model:
  provider: custom
  model: llama3
  base_url: http://ollama:11434/v1
  api_key: "none"
```

## Troubleshooting

### Container exits immediately

Check logs: `docker logs little`. Common causes:
- Missing or invalid `.env` file — run interactively first to complete setup
- Port conflicts if running with exposed ports

### "Permission denied" errors

The container's stage2 hook drops privileges to the non-root `little` user (UID 10000) via `s6-setuidgid` inside each supervised service. If your host `~/.little/` is owned by a different UID, set `LITTLE_UID`/`LITTLE_GID` to match your host user, or ensure the data directory is writable:

```sh
chmod -R 755 ~/.little
```

### Browser tools not working

Playwright needs shared memory. Add `--shm-size=1g` to your Docker run command:

```sh
docker run -d \
  --name little \
  --shm-size=1g \
  -v ~/.little:/opt/data \
  little-agent/Little-agent gateway run
```

### Gateway not reconnecting after network issues

The `--restart unless-stopped` flag handles most transient failures. If the gateway is stuck, restart the container:

```sh
docker restart little
```

### Checking container health

```sh
docker logs --tail 50 little          # Recent logs
docker run -it --rm little-agent/Little-agent:latest version     # Verify version
docker stats little                    # Resource usage
```
