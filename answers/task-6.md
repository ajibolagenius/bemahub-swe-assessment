# Task 6 — Infrastructure

## Incident 1 — the invisible deploy

**Context:** A fix is deployed green, but the browser does not show the change. A colleague reports "it works for me".

**Order of checks:**

1. **Client-side Browser Cache and Service Worker**
   - **Check:** Open the page in a clean Private/Incognito window or run a hard reload with cache disabled (`Cmd+Shift+R` / DevTools Network tab with "Disable cache" checked). Check DevTools Application tab for an active Service Worker.
   - **Rules in/out:** If the update renders immediately, the issue is client-side caching (stale `index.html`, unhashed static bundles, or a caching Service Worker). If the change remains absent in incognito, local browser cache is ruled out.
2. **Edge CDN / Reverse Proxy Cache (e.g., Cloudflare, CloudFront, Nginx)**
   - **Check:** Inspect the HTTP response headers on the document and JS assets via `curl -I <url>` or DevTools (check `Age`, `CF-Cache-Status`, `X-Cache`, `ETag`, `Cache-Control`).
   - **Rules in/out:** A `HIT` header or long `max-age` confirms the CDN edge PoP is serving a cached prior release due to a missing post-deploy cache invalidation/purge step. (The colleague was either routed to a different edge PoP, bypassed cache, or had their cache evicted).
3. **Deployment Target / Routing / Staged Rollout**
   - **Check:** Verify the exact environment domain/URL the user vs colleague is accessing (e.g., staging vs production, branch preview vs canonical) and verify whether the deployment uses a canary or blue/green traffic split (e.g. 90/10 split where the colleague hit the new release pod while the user hit the old release pod).
   - **Rules in/out:** Inspecting the deployment commit SHA exposed in the response payload or HTML meta tags confirms whether both requests reached the same version.

---

## Incident 2 — 502 after deploy

**Context:** The app works locally. After deploying a feature reading a new configuration value, every API call returns 502 Bad Gateway while the container shows as running.

**Most likely causes and triage order:**

1. **Missing or Malformed Environment Variable / Secret**
   - **Cause:** The new feature requires a configuration key that exists in `.env.local` but was not added to the production environment variables, secret store, or container runtime config. On container startup (or on receiving the first request), the process crashes on undefined access (e.g. `TypeError: Cannot read properties of undefined` or Zod schema validation failure) and enters a continuous restart loop (`CrashLoopBackOff`), or exits immediately. Docker `ps` can momentarily show "Up (X seconds)" during crash loops.
   - **Confirm/Eliminate:** Check container logs (`docker logs <container-id>` or `kubectl logs`). Look for unhandled startup exceptions or missing env errors. Verify runtime environment variables with `docker exec <container-id> env`.
2. **Process Listening on Incorrect Host Interface or Port**
   - **Cause:** The configuration change modified or omitted the binding port/host (e.g. defaulting to `127.0.0.1` inside the container rather than `0.0.0.0`, or reading `PORT=undefined` and falling back to a port different from what the reverse proxy / ingress upstream is configured to forward to). The reverse proxy cannot connect to upstream and returns 502.
   - **Confirm/Eliminate:** Check `docker logs` for "Listening on ...". Inspect container port bindings via `docker port <container-id>` and check reverse proxy error logs (e.g. `/var/log/nginx/error.log` showing `connect() failed (111: Connection refused)`).
3. **Failing Health Check / Readiness Probe**
   - **Cause:** The upstream load balancer marks the container as unhealthy because the health check route invokes logic depending on the unconfigured setting, causing the reverse proxy to fail health checks and return 502 to clients.
   - **Confirm/Eliminate:** Check reverse proxy / load balancer target group health status and probe response codes.

---

## Incident 3 — the vanishing change

**Context:** A tool was installed directly inside a running test container to debug an issue. After the next deploy, the tool and fix vanished.

**What happened:**
Containers are **ephemeral and stateless** by design. When changes or packages are installed directly inside a running container instance (e.g. via `docker exec` and `apt-get`), they are written only to the container's temporary copy-on-write filesystem layer. When a new deployment occurs, the orchestrator terminates and deletes the old container instance and spins up a new container directly from the base image artifact. Any uncommitted runtime filesystem modifications that are not part of the image build or mounted persistent volumes are destroyed. Furthermore, if the "fix" was code modified directly inside the container rather than committed to Git, the new deployment re-built and ran the unpatched code from the repository.

**How the change should have been made:**
1. **If the tool is required permanently for diagnostics/monitoring:** Add the installation instruction directly into the `Dockerfile` (`RUN apt-get update && apt-get install -y <tool>`), or use a designated debug sidecar container / ephemeral debug pod (`kubectl debug`) rather than modifying production images.
2. **For the code fix:** Commit the bug fix to a branch in version control (Git), create a Pull Request with tests, merge it, and let the CI/CD pipeline build, test, and deploy a new immutable image version.
3. **For persistent data:** If the tool generated files or configuration needed across deployments, store them in a mounted external persistent volume (`volumes:` in Docker Compose or PVC in Kubernetes), never in the container's root layer.
