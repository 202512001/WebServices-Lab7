# API Gateway, Service Discovery & Cloud Deployment (Lab 7)

## Overview and relation to Lab 6

Lab 6 split the backend into three independently runnable services —
User, Product, Order — that called each other directly over a Docker
network, with an API Gateway mentioned only conceptually. **Lab 7 builds
that gateway for real**: it becomes the single public entry point,
service locations are read from configuration instead of hard-coded, and
the whole system is deployed to a real cloud platform so it's reachable
over the internet instead of only `localhost`.

No business logic changed — User, Product and Order Services are the
exact same code from Lab 6.

## Architecture

```
                 Client / Postman  (internet)
                          │
                          ▼
              ┌─────────────────────┐
              │   API Gateway :8080   │   ← only public port
              │  (routing, logging,   │
              │  502/503 handling)    │
              └───────────┬───────────┘
                           │  (Docker network: campus-network)
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  User Service      Product Service     Order Service
    :3001                :3002              :3003
  (internal only)    (internal only)    (internal only)
        │                  │                  │
        ▼                  ▼                  ▼
              MongoDB Atlas (cloud, per-service DBs)
```

Only `api-gateway` publishes a port to the host / internet. User,
Product and Order are reachable only from inside `campus-network`.

## Part A — Why an API Gateway?

Letting clients call User, Product and Order directly (as in Lab 6) means
every client has to know all three internal addresses, and any internal
restructuring (splitting a service, renaming one, moving a port) breaks
every client that hard-coded those addresses. A gateway gives clients
**one address to know**, hides how many services exist or how they're
organized behind that address, and gives a single place to add
cross-cutting concerns — logging every request, handling a downed
dependency gracefully, or later adding auth/rate-limiting — without
touching User/Product/Order's own code at all.

## Part B — Config-based service discovery

The gateway (`api-gateway/server.js`) builds its whole routing table from
a `SERVICE_REGISTRY` object populated purely from environment variables:
```js
const SERVICE_REGISTRY = {
  user: process.env.USER_SERVICE_URL || "http://localhost:3001",
  product: process.env.PRODUCT_SERVICE_URL || "http://localhost:3002",
  order: process.env.ORDER_SERVICE_URL || "http://localhost:3003",
};
```
No route handler contains a literal URL. **Proof it's config-driven, not
hard-coded:** stop the gateway, change `USER_SERVICE_URL` to point at a
different host/port (e.g. a relocated User Service container), restart —
the gateway now routes `/users` to the new location with zero code
changes, only a config change.

### Static config vs. dynamic service discovery

This lab's approach (env vars fixed at container start) is **static**:
someone has to know the new location and update the config, then restart
the gateway. A **dynamic** registry (Consul, Eureka, or Kubernetes' own
DNS) would let services register themselves on startup and deregister on
shutdown, so the gateway (or any caller) discovers current locations
automatically — no restart, no manual config edit, and it copes with
services that scale up/down or move between hosts on their own. Static
config is simpler and fine for a small, mostly-fixed set of services (like
this lab); dynamic discovery earns its complexity once services are
numerous, ephemeral, or auto-scaled.

## Gateway implementation details

- **Routing**: `http-proxy-middleware` forwards `/users/*`, `/products/*`,
  `/orders/*` to the matching backend, using `changeOrigin: true`.
- **Health check**: `GET /health` is handled directly by the gateway
  (never proxied) and reports the current service registry.
- **Request logging**: every proxied request logs method, path, target
  service, and the eventual response status/time.
- **Error handling**: `onError` on each proxy catches unreachable
  targets — `ECONNREFUSED`/`ECONNRESET` → **503 Service Unavailable**,
  anything else (timeout, DNS failure) → **502 Bad Gateway** — as a
  structured JSON body, never a hang or a crash.

## Running locally with Docker Compose

```bash
docker compose up -d
docker compose ps
```
Only `api-gateway` (port 8080) is reachable from the host. Test through
it — not the old direct ports, which are no longer published:

- `GET http://localhost:8080/health`
- `GET http://localhost:8080/users`
- `GET http://localhost:8080/products`
- `POST http://localhost:8080/orders` — same body shape as Lab 6.

Unreachable-service test:
```bash
docker compose stop user-service
```
Then `GET http://localhost:8080/users` → **503**. Restart with
`docker compose start user-service` to confirm recovery.

## Part C — Cloud deployment (Render.com)

Render's free tier supports deploying each Dockerfile as its own **Web
Service**, which is the simplest path here (Render doesn't run a full
`docker-compose.yml` directly on the free tier, so each service is
deployed individually, and they reach each other over **public HTTPS
URLs** instead of an internal Docker network name).

1. Push this project to a GitHub repository (Render deploys from Git).
2. On [render.com](https://render.com), sign up/log in, click **New → Web Service**, connect the repo.
3. For **each** of `user-service`, `product-service`, `order-service`:
   - Root directory: the service's folder (e.g. `user-service`).
   - Environment: **Docker** (Render detects the `Dockerfile`).
   - Instance type: Free.
   - Add the same environment variables used locally (e.g. `USER_SERVICE_PORT`).
   - Deploy — Render gives each service a public URL like
     `https://user-service-xxxx.onrender.com`.
4. For `order-service`, set its environment variables to the **public
   Render URLs** of User and Product (not the old Docker service names —
   there's no shared Docker network across separate Render services):
   ```
   USER_SERVICE_URL=https://user-service-xxxx.onrender.com
   PRODUCT_SERVICE_URL=https://product-service-xxxx.onrender.com
   ```
5. Deploy `api-gateway` the same way, with its env vars pointing at all
   three services' public Render URLs:
   ```
   USER_SERVICE_URL=https://user-service-xxxx.onrender.com
   PRODUCT_SERVICE_URL=https://product-service-xxxx.onrender.com
   ORDER_SERVICE_URL=https://order-service-xxxx.onrender.com
   ```
6. Render gives the gateway its own public URL, e.g.
   `https://api-gateway-xxxx.onrender.com` — **this is your public
   gateway URL** for the submission.
7. Re-run the Postman collection against this URL instead of
   `localhost:8080` to prove the full flow works over the internet.

**Free-tier limitation to document if hit:** Render's free web services
spin down after inactivity and take ~30-60s to "wake up" on the first
request afterward — note this in your README/reflection if you observe
it; it's expected free-tier behavior, not a bug.

## Reflection: what changed vs. Lab 6

In Lab 6, testing meant knowing three separate ports and calling each
service directly — anyone consuming the system had to understand its
internal shape. With the gateway, there's exactly one address to know,
and User/Product/Order aren't even reachable from outside the Docker
network anymore, which is a real security improvement, not just
convenience. Cloud deployment changed the operating model more than the
code: `localhost` service names stopped meaning anything, so inter-service
URLs had to become full public HTTPS addresses configured entirely
through environment variables — proving out the Part B config approach
was necessary, not optional, for a real deployment. It also introduced
new operational realities Lab 6 never had, like free-tier cold starts and
needing to manage multiple independent deployments instead of one
`docker compose up`.

## Troubleshooting notes

- Forgetting to also update `ORDER_SERVICE_URL`/etc. to Render's public
  URLs (leaving Docker-network names like `http://user-service:3001`)
  causes every gateway route to fail with 502/503 once deployed, since
  those hostnames don't resolve outside the original Docker network.
- `http-proxy-middleware`'s `onError` must send the response itself
  (`res.status(...).json(...)`) — without it, an unreachable target
  causes the request to hang until Postman's own timeout, not a clean
  502/503.
