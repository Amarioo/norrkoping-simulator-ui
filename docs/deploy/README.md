# Publishing — the interface on Vercel, the backend in k3s (2026-11-18)

Prepared and tested locally; **nothing is published**. Committed on the user's request (2026-11-18);
the backend commit `e20722f` is local only until its push is allowed (the push publishes the image). Follows [A city per visitor](../visitor-city/README.md). No
geodata, no coordinates, no earlier phase's output touched.

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
