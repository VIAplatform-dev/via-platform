# Plan B — testing it locally, without registering a domain

Plan B serves a seller's captured storefront from a **separate registrable domain**, so the
browser's same-origin policy isolates their JavaScript from VYA and their theme's own code can run.
That is what reaches 1-to-1 fidelity where the capture shim can only approximate.

You do **not** need to own a domain to build or verify any of it. `.test` is reserved by RFC 6761,
never resolves publicly, and — crucially — the browser treats `vyasites.test` as a *different
registrable domain* from `vyaplatform.test`, which is exactly the relationship the real domains will
have. Registration is a deployment step, not a development one.

## Setup (once)

```bash
sudo sh -c 'cat >> /etc/hosts' <<'EOF'
127.0.0.1  blummier.vyasites.test
127.0.0.1  test-import.vyasites.test
127.0.0.1  vyaplatform.test
EOF
```

Add to `.env.local`:

```
STORE_HOST_SUFFIX=vyasites.test
```

Then start a dev server. **This repo runs two**, and Plan B works on either:

| Command | Port | What it is |
|---|---|---|
| `npm run dev` | 3000 | the marketplace app |
| `npm run dev:os` | 3333 | the seller OS (middleware treats port 3333 as the getvya.ai host) |

A store hostname is resolved **before** the port-3333 OS heuristic, so an explicit store origin always
wins over the dev-port convenience — and `localhost:3333` / `getvya.ai` keep behaving exactly as they
did. Use whichever port you already have running; the examples below use 3333.

Unset the variable and Plan B switches off entirely — no host is a store origin, and captures go back
to storing no scripts.

## What you can prove without a browser

Every check below is a plain HTTP request with a `Host` header, so it needs no DNS and no TLS.

```bash
# The security boundary: VYA's own surfaces must not answer on a seller's origin.
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: blummier.vyasites.test' localhost:3333/admin/inventory      # 404
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: blummier.vyasites.test' localhost:3333/api/store/capture     # 404

# …and it fails CLOSED, so a route invented tomorrow is refused by default:
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: blummier.vyasites.test' localhost:3333/api/anything-new      # 404

# The theme's own endpoints reach VYA's Shopify-shaped implementations:
curl -s -H 'Host: blummier.vyasites.test' localhost:3333/cart.js
curl -s -H 'Host: blummier.vyasites.test' -X POST -H 'Content-Type: application/json' \
     -d '{"id":"<sourceVariantId>","quantity":1}' localhost:3333/cart/add.js

# A host that only looks like a store must not become one:
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: a.b.vyasites.test'        localhost:3333/   # 404
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: blummier.notvyasites.test' localhost:3333/  # 404
```

## What needs a browser

Load `http://blummier.vyasites.test:3333` after importing that store **with `STORE_HOST_SUFFIX`
set** (the capture only keeps the seller's scripts when Plan B is configured).

- Their own carousel, dropdowns and cart drawer work — no shim involved.
- DevTools → Network during add-to-cart → checkout: **zero requests to `*.myshopify.com` or
  `shop.app`**. That criterion is about what the *page* requests, so localhost proves it fully.
- Compare against `http://vyaplatform.test:3333/site/blummier` — the same stored capture, served on
  a VYA origin, must come back with **no scripts at all** (see `stripScripts`). That is the boundary
  that keeps a Plan B capture from becoming stored XSS on VYA's own domain.

## What genuinely needs the real domain

Only deployment-shaped things, none of which change the design:

- The Vercel wildcard domain and its certificate.
- Real HTTPS cookie semantics (`Secure`, `SameSite=None`) — localhost counts as a secure context, so
  a few edge cases differ.
- Production edge headers.

Switching over is one environment variable: `STORE_HOST_SUFFIX=vyasites.com`.
