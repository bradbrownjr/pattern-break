# Self-hosting

How to run the Pattern Break image on your own machine or on Unraid. A song here is a
module, a song file made in a music tracker. The image holds the built client, the bundled
songs, and the server: it serves the game and the leaderboard API from one port, and checks
every submitted run by playing it again. Development setup is in
[`DEVELOPMENT.md`](DEVELOPMENT.md).

The image is `ghcr.io/bradbrownjr/pattern-break`. It listens on port 8080, runs as the
non-root `node` user (uid 1000), and answers `GET /healthz` with 200 for health checks.
The leaderboards live in `/data`: mount a volume or a host folder there, or they are lost
when the container is replaced.

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

Installing the game as an app and playing offline need a secure context too: browsers run
the service worker that caches the game only there.

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
  -v pattern-break-data:/data ghcr.io/bradbrownjr/pattern-break:edge
```

The first line of the log says the port, the folder being served, and the data folder.
Settings, all optional:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port the server listens on inside the container. |
| `CLIENT_DIST` | `/app/packages/client/dist` | Folder of built client files. |
| `DATA_DIR` | `/data` | The database, stored replays, uploaded songs and the level cache. |
| `MUSIC_DIR` | `/app/music` | The bundled songs and their `manifest.json`. |
| `TRUST_PROXY` | unset | The reverse proxy's address, or `true`. Set it when a proxy is in front, so rate limits count each player's IP, not the proxy's. |

### The data folder

`/data` holds `pattern-break.sqlite` (players, songs and runs), `replays/` (each accepted
level's replay, named by its SHA-256), `songs/` (songs players uploaded so their runs could
be checked; never served) and `levels/` (a cache of analysed levels, safe to delete). A
named volume needs nothing more. A host folder must be writable by uid 1000:
`mkdir -p /srv/pattern-break && chown 1000:1000 /srv/pattern-break`.

Back it up by stopping the container and copying the folder; SQLite's `-wal` and `-shm`
files belong with the database.

## Docker Compose

[`deploy/docker-compose.yml`](../deploy/docker-compose.yml) has the port mapping, the data
volume, a restart policy, and the health check:

```sh
docker compose -f deploy/docker-compose.yml up -d
```

## Unraid

1. Add the template. Either copy [`deploy/unraid/pattern-break.xml`](../deploy/unraid/pattern-break.xml)
   to `/boot/config/plugins/dockerMan/templates-user/` on the server, or in Docker, Add
   Container, paste its raw URL into Template. The template points at the `edge` tag. The
   template URL it declares uses the repository's `HEAD`, so it follows the default branch.
2. In Docker, Add Container, pick `pattern-break` from the template list.
3. Leave the web UI port at 8080, or change it if 8080 is taken. The data path defaults to
   `/mnt/user/appdata/pattern-break`. Create it first and give it to uid 1000, or the
   server can't write there: `mkdir -p /mnt/user/appdata/pattern-break && chown 1000:1000
   /mnt/user/appdata/pattern-break`. Set Trust proxy to the reverse proxy's address if
   there is one. Apply.
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
