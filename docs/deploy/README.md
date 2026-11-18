# Publishing — the interface on Vercel, the backend in k3s (2026-11-18)

Prepared and tested locally; **nothing is deployed**. Committed and pushed on the user's request
(2026-11-18): backend `e20722f`, this repository `ffb33dd`. The backend push started the image
workflow (a public image on ghcr.io). Follows [A city per visitor](../visitor-city/README.md). No
geodata, no coordinates, no earlier phase's output touched.

## Update (2026-11-18, later): set up like the Airplane Mode backend; the stream is compressed

The user: "decide ONE fitting name; we can do as we did with the backend for Airplane Mode". Read
from that project's notes and, read-only, from the cluster (two arm64 Raspberry Pi nodes, k3s
v1.29.5, Traefik 2.10.7, cert-manager with the ClusterIssuer `letsencrypt-prod`, names on nip.io
for the public address). **Uncommitted in the backend repository; nothing applied to the cluster.**
This section replaces the placeholders and the two limits per address described below.

- **Name:** `api-norrkoping-simulator.213-66-61-225.nip.io` (same form as
  `api-airplane-mode.213-66-61-225.nip.io`; nip.io needs no DNS record).
- **Manifest** (`deploy/k8s/simulator.yaml`): that host, `letsencrypt-prod`, a plain Traefik ingress
  for `/api` and `/health` like Airplane Mode's, at most 8 cities, at most two processor cores and
  512 MB. The two limits per address are removed: behind k3s's built-in load balancer Traefik
  probably sees one internal address for every visitor (not verified), so they would have limited
  all visitors together. `kubectl apply --dry-run=client` on the cluster accepted the file.
- **Image for arm64:** the first published image was amd64 only and would not have started on the
  nodes. The Dockerfile now cross-compiles and the workflow publishes amd64 + arm64, tagged
  `latest` and `sha-<commit>`. A local arm64 build of the binary succeeds; the image itself is first
  built by the workflow.
- **The stream was measured, and is large.** Ten seconds of `/api/simulator/stream`:

  | Traffic | Uncompressed | gzip (whole file) |
  |---|---|---|
  | Start values (192 road vehicles) | 5.47 MB = 4.4 Mbit/s | 1.34 MB = 1.1 Mbit/s |
  | Heaviest (1 000 road vehicles, 40 trams, 12 trains) | 28.2 MB = 22.6 Mbit/s | 6.7 MB = 5.4 Mbit/s |

  The backend now compresses the stream (gzip, flushed after every snapshot) for clients that accept
  it; every browser does. New test in `internal/api/server_test.go`. Compression is per listener;
  its processor cost on the Pi is not measured.
- **Not like Airplane Mode in one respect:** there the interface reaches the backend through
  Vercel rewrites. Here the page talks to the backend directly (`VITE_API_BASE` + CORS), because
  about 0.5 GB an hour per visitor would otherwise pass through Vercel and count against its quota.
- **Roll-out is by hand** (`kubectl apply` over SSH). Airplane Mode's automatic roll-out uses a
  GitHub runner on the Pi that belongs to its repository only.
- **Checks:** backend `gofmt`, `go vet`, `go test -count=1 ./...` pass; Playwright `visitor-city`,
  `sse-reconnect`, `simulation` 5/5 against the compressing backend (the working tree then also
  held changes from other work in `index.html`, `src/App.svelte`, `src/lib/city.svelte.ts`).
- **Open:** the interface's address on Vercel is not known until the project exists; the manifest
  assumes `https://norrkoping-simulator-ui.vercel.app`. The home connection's upload speed decides
  how many visitors fit: 8 visitors are about 9 Mbit/s with the start traffic, up to 43 Mbit/s if
  all choose the heaviest.

## Deployed to the cluster (2026-11-18, evening): the backend is live

On the user's "Ja, driftsätt". Backend `21167a5` committed and pushed; Backend CI (with `-race`) and
the image workflow passed; the image has amd64 and arm64 variants and can be pulled without login.
Applied over SSH with the image `sha-21167a5b2ccbe447f8fcc921efa681a54d6a37a8`: a new namespace
`norrkoping-simulator` (deployment, service, ingress); nothing else in the cluster was changed.
The pod runs on the node `smeagol`; the certificate from `letsencrypt-prod` was ready within a
minute.

Checked from this machine against `https://api-norrkoping-simulator.213-66-61-225.nip.io`:

| Check | Result |
|---|---|
| `/health` | `{"status":"ok"}`, HTTP 200, valid certificate (the very first request, seconds after the certificate was issued, failed to connect; every later one succeeded) |
| `/api/simulator/world` | a running city |
| Stream as the assumed Vercel origin, own city | 200, `Content-Encoding: gzip`, `Access-Control-Allow-Origin` = that origin; 98 events and 1.41 MB in 10 s = 1.1 Mbit/s |
| Command from an origin not in the list | 403 |
| Preflight from the Vercel origin | 204 |
| Load | the pod used 32 m (3 % of a core) with the shared city only and 86 m with one visitor city being streamed and compressed; 135–153 MB. The Airplane Mode pod kept running |

Plain `http://` answers too (no redirect to HTTPS). **Still to do:** the interface on Vercel
(`VITE_API_BASE=https://api-norrkoping-simulator.213-66-61-225.nip.io`, `VITE_CITY_SESSIONS=1`), and
`ALLOWED_ORIGIN` in the manifest if the Vercel address is not
`https://norrkoping-simulator-ui.vercel.app`. A later backend release:
`sudo k3s kubectl -n norrkoping-simulator set image deployment/simulator simulator=ghcr.io/amarioo/norrkoping-simulator-backend:sha-<commit>`.

## The interface is live on Vercel (2026-11-18, evening)

On the user's "Ja, skapa det". Created through the Vercel connection, in the same team as
Airplane Mode: project `norrkoping-simulator-ui`, linked to the GitHub repository, framework Vite,
Node 24.x, install `npx --yes npm@11.10.1 ci` (as in CI), build `npm run build`, output `dist`;
`VITE_API_BASE=https://api-norrkoping-simulator.213-66-61-225.nip.io` and `VITE_CITY_SESSIONS=1` for
production and preview. First production deployment from `main` = `adb4b31`, ready in 38 s.

**Address: https://norrkoping-simulator-ui.vercel.app** (the address the backend already allowed, so
the manifest needed no change). Checked in the browser: public without login, "Simulatorn är
ansluten", an own city id, 202 vehicles on the map, the clock running; the pause button paused this
tab's city and changed to "Fortsätt simuleringen"; no console errors.

- **Every push to `main` in this repository now publishes to production** (the project is linked
  to the repository). See "Releasing later" for the order when the elevation data changes.
- Vercel's preview addresses for other branches are not in the backend's `ALLOWED_ORIGIN`; they
  will load but not connect.
- Not checked: several visitors at once, a phone, and Vercel's usage after real traffic.

## What is ready

- **Backend answers a page on another domain (CORS).** The origins in `ALLOWED_ORIGIN` (several
  separated by commas) may read the answers and the stream and send commands; the browser's
  advance question before a command (the "preflight", an `OPTIONS` request) is answered. Other
  origins are refused as before. Requests without an origin (command line, the dev server's proxy)
  work as before.
- **Backend as a container:** `Dockerfile` (one static binary with the map embedded, runs without
  root) and `.github/workflows/image.yml`, which on every push to `main` builds the image and
  publishes it as `ghcr.io/amarioo/norrkoping-simulator-backend:latest` (GitHub's registry).
- **k3s:** `deploy/k8s/simulator.yaml` in the backend repository: namespace, one copy of the
  backend (the old stops before the new starts, because the cities live in memory), service,
  HTTPS ingress through Traefik, and two limits per visitor address: at most 20 requests a second
  and 6 at the same time.
- **Interface:** `VITE_API_BASE` in the build is the backend's address; empty, everything is as
  before (the page's own address, the dev server's proxy).

## What the user must decide or do

1. **The backend's public host name**, for example `api.<your domain>`, with a DNS record that
   points to the cluster.
2. **How the cluster is reached from the internet** (an open port 443, or a tunnel). This machine
   has no connection to the cluster (no kubeconfig), so I could not look.
3. **HTTPS:** the manifest expects cert-manager with a ClusterIssuer (the name `letsencrypt` is a
   placeholder). If the cluster does it another way, the ingress's annotations change.
4. **Approve the commit and push.** The push to the backend's `main` starts the image workflow,
   which publishes a public image (the repository is public).

## Steps to publish (after the decisions)

1. Backend: replace the three placeholders at the top of `deploy/k8s/simulator.yaml`
   (`api.example.com`, `https://ui.example.com`, `letsencrypt`), push, wait for the image
   workflow, then `kubectl apply -f deploy/k8s/simulator.yaml`. Check
   `https://<api host>/health` answers `{"status":"ok"}`.
2. Vercel: import the `norrkoping-simulator-ui` repository (framework Vite, build `npm run build`,
   output `dist`, Node 24). Environment variables for Production:
   `VITE_API_BASE=https://<api host>` and `VITE_CITY_SESSIONS=1`.
3. Put the Vercel address (or the user's own domain for the interface) in `ALLOWED_ORIGIN` in the
   manifest and apply again. Only addresses listed there work; Vercel's preview addresses for
   branches do not, unless they are added.

## Releasing later

The interface refuses a backend whose elevation data has another revision ("Kartans och serverns
höjddata skiljer sig"). Vercel publishes at every push to this repository. When the map or the
elevation data changes, push the backend first, restart it in the cluster
(`kubectl -n norrkoping-simulator rollout restart deployment/simulator`), then push the interface.
Other changes can go in any order.

## Checks (2026-11-18)

| Check | Result |
|---|---|
| Backend `gofmt -l`, `go vet ./...`, `go test -count=1 ./...` | clean; pass, with a new test for the allowed origins, the preflight, the stream and strangers. `-race` **not run** locally (needs cgo); CI runs it |
| `npm run check` | 0 errors |
| `npm run build` | OK |
| `npm test` | 640/641; the known `police.test.ts` |
| Playwright against the new backend | `visitor-city`, `simulation`, `interface-u1`, `sse-reconnect`: 7/7. The other spec files **not run** |
| Across two addresses, in the running app | a production build with `VITE_API_BASE=http://127.0.0.1:8097/` and `VITE_CITY_SESSIONS=1` served on `127.0.0.1:5392`, backend on `8097` with `ALLOWED_ORIGIN=http://127.0.0.1:5392`: connected, own city id, pause through the interface answered "Paus uppdaterad.", no console errors. The same page opened as `localhost:5392` (not in the list) stayed on "Ansluter till simulatorn…", as intended |

## Not verified

- **The container image has not been built**: Docker was not running on this machine. The
  Dockerfile is first exercised by the image workflow.
- **The manifest has not been applied to any cluster.** The Traefik resource version
  (`traefik.io/v1alpha1`) fits current k3s; an old k3s uses `traefik.containo.us/v1alpha1`.
- **The build on Vercel has not been run.** The built site is 62 MB (mostly map data); the size
  limits of the user's Vercel plan are not checked.
- The stream through the cluster's ingress, and the two limits per address, are untested.
- Network traffic per visitor is not measured.

## Files

Backend: `internal/api/server.go`, `internal/api/server_test.go`, `Dockerfile`, `.dockerignore`,
`deploy/k8s/simulator.yaml`, `.github/workflows/image.yml`, `README.md`.
Interface: `src/lib/citySession.ts`.
