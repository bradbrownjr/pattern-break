# Self-hosting

How to run the Pattern Break play-test image on your own machine or on Unraid. The image
holds the game only: the built client and a small static web server. A song here is a module,
a song file made in a music tracker; the game ships with one test song. There are no
leaderboards until milestone M5, which adds the API to this same image (see
[`ROADMAP.md`](ROADMAP.md)). Development setup is in [`DEVELOPMENT.md`](DEVELOPMENT.md).

The image is `ghcr.io/bradbrownjr/pattern-break`. It listens on port 8080, runs as a
non-root user, needs no volumes, and answers `GET /healthz` with 200 for health checks.

## Tags

| Tag | Built when | Use it for |
|---|---|---|
| `edge` | Every push to the default branch | Play-testing the latest work. Moves with each push. |
| `sha-<short sha>` | Every push to the default branch | Pinning to one commit, or rolling back. |
| `1.2.3` (the version) | A GitHub release is published | A fixed release. |
| `latest` | A full (not pre-release) GitHub release is published | The newest release. |

Until the first release exists, only `edge` and the `sha-` tags exist. Use `edge`.

## HTTPS is required

Open the game at `http://<server-ip>:8080` and the title screen appears, but starting a song
fails. Browsers expose the AudioWorklet (the game's audio engine) and `crypto.subtle` (the
SHA-256 hash that identifies a song) only in a secure context: a page served over HTTPS, or
from `localhost`. A plain `http://` address on your LAN is not secure. In Chromium the failure
shows as `Cannot read properties of undefined (reading 'addModule')`, because
`audioWorklet` does not exist there (checked 2026-11-08 against the image).

So put the container behind a reverse proxy that serves HTTPS. On Unraid, Nginx Proxy Manager
and SWAG are the common choices. Point a proxy host at `<server-ip>:8080`, give it a
certificate (a Let's Encrypt certificate needs a domain name, including one that only
resolves on your LAN through DNS), and open the HTTPS address. The game needs no special
headers or WebSocket settings from the proxy.

### Testing only: a Chrome flag

To try the game over plain HTTP, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
in Chrome, add `http://<server-ip>:8080` to the list, set the flag to Enabled, and relaunch.
That browser then treats the address as secure. It weakens a protection for that origin, so
use it only on a machine you trust, only for this address, and turn it off afterwards.

## Docker

```sh
docker run -d --name pattern-break --restart unless-stopped -p 8080:8080 \
  ghcr.io/bradbrownjr/pattern-break:edge
```

The first line of the log says the port and the folder being served. Settings, all optional:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port the server listens on inside the container. |
| `CLIENT_DIST` | `/app/packages/client/dist` | Folder of built client files. |

## Docker Compose

[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) has the port mapping, a restart
policy, and the health check:

```sh
docker compose -f deploy/docker-compose.yml up -d
```

## Unraid

1. Add the template. Either copy [`deploy/unraid/pattern-break.xml`](../deploy/unraid/pattern-break.xml)
   to `/boot/config/plugins/dockerMan/templates-user/` on the server, or in Docker, Add
   Container, paste its raw URL into Template. The template points at the `edge` tag. The
   template URL it declares uses the repository's `HEAD`, so it follows the default branch.
2. In Docker, Add Container, pick `pattern-break` from the template list.
3. Leave the web UI port at 8080, or change it if 8080 is taken. Apply.
4. Add a reverse proxy host for it with HTTPS (see above). The template's WebUI link opens
   the plain HTTP address, which only reaches the title screen.

The template has no icon, because the repository has no logo file yet.

## Making the package public

A new package on ghcr.io can start out private, so a pull from Unraid or another machine
fails with an authorization error until that is dealt with. This has not been checked against
GitHub's documentation for this repository; check it after the first publish. If it is
private, either:

- Open the package's page on GitHub (the repository's Packages section, then Package
  settings), and under Danger zone, change the visibility to public. Or
- Keep it private and log the server in to ghcr.io with a personal access token that has the
  `read:packages` scope: `docker login ghcr.io -u bradbrownjr`. On Unraid, run that in the
  terminal; the credentials are stored for later pulls.

The image's `org.opencontainers.image.source` label links the package to the repository.

## Updating

The `edge` tag moves, so pull again to get a new build.

- **Docker:** `docker pull ghcr.io/bradbrownjr/pattern-break:edge`, then stop, remove, and
  rerun the container with the same command.
- **Compose:** `docker compose -f deploy/docker-compose.yml pull`, then `up -d`.
- **Unraid:** Docker tab, Check for updates, then Apply update on the container.

Browsers cache the game's files under `/assets/` for a year, which is safe because their
names change with their content. `index.html` is never cached, so a reload picks up the new
build.

## Building the image yourself

```sh
docker build -t pattern-break .
docker run --rm -p 8080:8080 pattern-break
```

The build needs access to the npm registry. The image is built for linux/amd64 only. Adding
linux/arm64 means adding QEMU to the workflow (`docker/setup-qemu-action`) and a platform
entry, which slows the build because the arm64 steps are emulated; nothing here needs it yet.

To run the server against a local build without Docker: `pnpm build`, then `pnpm serve`.
