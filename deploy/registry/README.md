# `registry.vidocq.dev` — self-hosted Docker registry (Foix / Portainer)

A private, self-cleaning Docker registry for the Vidocq ecosystem, fronted by Nginx Proxy
Manager (NPM) at `https://registry.vidocq.dev`. The `vidocq-docs` CI pushes its image here;
Portainer pulls it to (re)deploy the docs stack.

The registry itself listens on plain HTTP `:5000` inside the `npm` Docker network — **NPM
terminates TLS**, so the registry container needs no certificate.

## 1. Prerequisites on the Foix host

The stack attaches both containers to your **existing Nginx Proxy Manager network**,
declared as the external network `reverseproxy_default` in `compose.yml`. Nothing to create
— that network already exists (it is NPM's Compose default network). If your NPM network has
a different name, change `name: reverseproxy_default` in `compose.yml` accordingly:

```bash
# Find the network your NPM container is attached to:
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' <your-npm-container>
```

DNS: point `registry.vidocq.dev` (A/AAAA or CNAME) at the Foix host, same as your other
NPM-served hosts.

## 2. Generate the two secrets

```bash
# (a) htpasswd line — bcrypt. Choose a CI username (e.g. vidocq-ci) and a strong password.
docker run --rm httpd:2.4-alpine htpasswd -Bbn vidocq-ci 'CHANGE_ME_STRONG_PASSWORD'
#   -> copy the WHOLE output line, e.g.  vidocq-ci:$2y$05$....

# (b) HTTP secret — any long random string.
openssl rand -hex 32
```

## 3. Deploy the stack in Portainer

Portainer → **Stacks → Add stack** → name `registry` → paste `deploy/registry/compose.yml`
(or point it at this repo path if you use a Git-backed stack). In the **Environment
variables** section add:

| Variable | Value |
| --- | --- |
| `REGISTRY_HTPASSWD` | the full htpasswd line from step 2a |
| `REGISTRY_HTTP_SECRET` | the random string from step 2b |

Deploy. Two containers come up: `vidocq-registry` and `vidocq-registry-gc`.

## 4. Nginx Proxy Manager — Proxy Host

NPM → **Hosts → Proxy Hosts → Add Proxy Host**:

- **Domain Names**: `registry.vidocq.dev`
- **Scheme**: `http` · **Forward Hostname**: `vidocq-registry` · **Forward Port**: `5000`
- **Block Common Exploits**: on · **Websockets Support**: on
- **SSL** tab: request a new Let's Encrypt certificate, **Force SSL** + **HTTP/2** on.
- **Advanced** tab → *Custom Nginx Configuration* (mandatory — image layers are large and
  default body limits would break pushes):

  ```nginx
  client_max_body_size 0;
  proxy_request_buffering off;
  chunked_transfer_encoding on;
  proxy_read_timeout 900;
  ```

Verify:

```bash
curl -u vidocq-ci:'PASSWORD' https://registry.vidocq.dev/v2/_catalog
# -> {"repositories":[]}   (empty until the first push)
```

## 5. Let Portainer pull from it

Portainer → **Registries → Add registry → Custom registry**:

- **Name**: `registry.vidocq.dev`
- **Registry URL**: `registry.vidocq.dev`
- **Authentication**: on, username `vidocq-ci` + the password.

The `vidocq-docs` stack then references images as `registry.vidocq.dev/vidocq-docs:...`.

## 6. CI credentials (Codeberg org secrets)

Add to the `Vidocq` org (or the `vidocq-docs` repo) secrets — convention: credentials go in
`secrets.*`, never `vars.*`:

| Secret | Value |
| --- | --- |
| `REGISTRY_USERNAME` | `vidocq-ci` |
| `REGISTRY_PASSWORD` | the password from step 2a |

The CI does `docker login registry.vidocq.dev` with these, builds, and pushes mutable tags.

## 7. Self-cleaning

- The CI pushes **mutable** tags only (`snapshot` on `main`, `latest`/`<version>` on tags).
  Each push re-points the tag and orphans the previous manifest.
- `vidocq-registry-gc` runs `registry garbage-collect --delete-untagged` weekly, freeing the
  orphaned blobs. `REGISTRY_STORAGE_DELETE_ENABLED=true` makes this possible.
- Force a run now (e.g. after a big cleanup):

  ```bash
  docker exec vidocq-registry-gc \
    registry garbage-collect --delete-untagged /etc/docker/registry/config.yml
  ```

> Online GC has a tiny race with a *concurrent* push (a blob being uploaded at the exact GC
> moment). For this low-write registry it is negligible; if you ever push heavily, stop
> `vidocq-registry` for the few seconds GC takes, or schedule GC at a quiet hour.

## Notes

- This stack lives under `vidocq-docs/deploy/registry/` for now because `vidocq-docs` is its
  first consumer; it is shared infra and can move to a dedicated `infra` repo later.
- `$$` in `compose.yml` is intentional: Compose unescapes it to a literal `$` for the shell
  inside the container (so `$REGISTRY_HTPASSWD` / `$(date)` run at container runtime, not at
  compose-interpolation time).
