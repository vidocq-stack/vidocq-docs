package io.vidocq.docs;

import io.vidocq.chappe.api.Body;
import io.vidocq.chappe.api.Request;
import io.vidocq.chappe.api.Response;
import io.vidocq.chappe.api.Router;
import io.vidocq.chappe.api.Server;
import io.vidocq.chappe.api.StaticFileHandler;

import java.nio.file.Path;
import java.util.Map;

/**
 * Launcher minimal pour servir le site Antora compilé via Chappe.
 *
 * Variables d'environnement reconnues :
 *   CHAPPE_DOCROOT   répertoire racine du site (défaut : /var/www/vidocq-docs)
 *   CHAPPE_PORT      port d'écoute (défaut : 8080)
 *   CHAPPE_BIND      adresse de bind (défaut : 0.0.0.0)
 *   STAGING          si "true", ajoute X-Robots-Tag: noindex, nofollow
 *   CHAPPE_CACHE     valeur du Cache-Control (défaut : "max-age=3600, public")
 *
 * Tant que Chappe n'a pas de CLI standalone, ce launcher est la voie courte.
 */
public final class ChappeDocsServer {

    private ChappeDocsServer() {}

    public static void main(String[] args) throws Exception {
        var docroot = env("CHAPPE_DOCROOT", "/var/www/vidocq-docs");
        var port    = Integer.parseInt(env("CHAPPE_PORT", "8080"));
        var bind    = env("CHAPPE_BIND", "0.0.0.0");
        var cache   = env("CHAPPE_CACHE", "max-age=3600, public");
        var staging = Boolean.parseBoolean(env("STAGING", "false"));

        System.out.printf("[vidocq-docs] docroot=%s port=%d bind=%s staging=%s%n",
                docroot, port, bind, staging);

        var staticHandler = StaticFileHandler.builder()
                .addPath(Path.of(docroot))
                .cacheInMemory(true)
                .cacheControl(cache)
                .build();

        var router = Router.builder()
                .get("/healthz", req -> Response.ok("ok"))
                .mount("/", securityFilter(staticHandler, staging))
                .build();

        try (var server = Server.builder()
                .bind(bind)
                .port(port)
                .handler(router)
                .build()) {
            server.start();
            Thread.currentThread().join();
        }
    }

    private static io.vidocq.chappe.api.Handler securityFilter(
            io.vidocq.chappe.api.Handler delegate, boolean staging) {
        var defaultHeaders = Map.of(
                "X-Content-Type-Options", "nosniff",
                "Referrer-Policy", "strict-origin-when-cross-origin"
        );
        return (Request req) -> {
            Response resp = delegate.handle(req);
            var b = Response.builder()
                    .status(resp.status())
                    .body(resp.body() == null ? Body.empty() : resp.body());
            resp.headers().forEach(b::header);
            defaultHeaders.forEach(b::header);
            if (staging) {
                b.header("X-Robots-Tag", "noindex, nofollow");
            }
            return b.build();
        };
    }

    private static String env(String key, String def) {
        var v = System.getenv(key);
        return v == null || v.isBlank() ? def : v;
    }
}
