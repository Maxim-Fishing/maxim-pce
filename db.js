/* =========================================================================
   NEXUS TOOLS · Capa de acceso a datos (db.js)
   -------------------------------------------------------------------------
   Un ÚNICO punto para hablar con Supabase (PostgREST). Reemplaza los ~126
   fetch(URL_SB + "/rest/v1/…") repartidos por el código. (Fase 1 del plan.)

   Cargar DESPUÉS de config.js y ANTES de nexus.js.

   Es autocontenida: lee la config de window.NEXUS_CONFIG y el token vigente de
   localStorage ("maxim_token"), que es donde nexus.js ya lo guarda/refresca.
   Convive con el código viejo: se puede migrar llamada por llamada, sin romper.

   API:
     DB.select(tabla, opts)        -> filas[]            (o {rows,total} si opts.count)
     DB.first(tabla, opts)         -> fila | null
     DB.insert(tabla, filas, opts) -> filas insertadas   (o null si returning:'minimal')
     DB.update(tabla, patch, opts) -> filas actualizadas
     DB.remove(tabla, opts)        -> filas borradas
     DB.count(tabla, opts)         -> número (HEAD + count=exact)
     DB.rpc(fn, params, opts)      -> resultado del RPC
     DB.raw(pathRelativo, init)    -> Response  (escape hatch para casos raros)

   opts (todas opcionales):
     select   : "id,codigo,descripcion"           columnas
     eq       : { categoria_id:"equipo", ... }     filtros de igualdad (col=eq.val)
     filters  : ["fecha_vencimiento=lt.2026-01-01"] filtros crudos PostgREST ya formateados
     order    : "created_at.desc"
     limit, offset : números
     count    : "exact" | "planned"                devuelve {rows,total}
     returning: 'minimal' (no devuelve filas) | false (idem)  · por defecto devuelve filas
     onConflict: "col"     · upsert:true            para insert con merge de duplicados
   ========================================================================= */
(function () {
  "use strict";
  var CFG = window.NEXUS_CONFIG || {};
  if (!CFG.URL_SB || !CFG.KEY) { console.error("db.js: falta window.NEXUS_CONFIG (config.js) antes de db.js."); }
  var BASE = (CFG.URL_SB || "") + "/rest/v1/";

  function token() { try { return localStorage.getItem("maxim_token") || ""; } catch (e) { return ""; } }

  function headers(extra) {
    var h = { "apikey": CFG.KEY, "Authorization": "Bearer " + token(), "Content-Type": "application/json" };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) h[k] = extra[k]; } }
    return h;
  }

  // Traduce opts -> querystring PostgREST
  function buildQuery(opts) {
    opts = opts || {};
    var p = [];
    if (opts.select) p.push("select=" + encodeURIComponent(opts.select));
    if (opts.eq) { for (var c in opts.eq) { if (opts.eq.hasOwnProperty(c)) p.push(encodeURIComponent(c) + "=eq." + encodeURIComponent(opts.eq[c])); } }
    if (opts.filters) opts.filters.forEach(function (f) { p.push(f); });     // ya vienen como col=op.val
    if (opts.order) p.push("order=" + encodeURIComponent(opts.order));
    if (opts.limit != null) p.push("limit=" + opts.limit);
    if (opts.offset != null) p.push("offset=" + opts.offset);
    if (opts.onConflict) p.push("on_conflict=" + encodeURIComponent(opts.onConflict));
    return p.length ? ("?" + p.join("&")) : "";
  }

  function makeErr(status, body) {
    var msg = (body && (body.message || body.error || body.hint)) || ("HTTP " + status);
    var e = new Error(msg); e.status = status; e.body = body; return e;
  }

  function preferHeader(method, opts) {
    var pref = [];
    if (opts.count) pref.push("count=" + opts.count);
    if (opts.upsert) pref.push("resolution=merge-duplicates");
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      if (opts.returning === "minimal" || opts.returning === false) pref.push("return=minimal");
      else pref.push("return=representation");
    }
    return pref.length ? { "Prefer": pref.join(",") } : null;
  }

  async function req(method, path, opts, body) {
    opts = opts || {};
    var r = await fetch(BASE + path, {
      method: method,
      headers: headers(preferHeader(method, opts)),
      body: (body != null) ? JSON.stringify(body) : undefined
    });
    if (method === "HEAD") {
      if (!r.ok) throw makeErr(r.status, null);
      var cr0 = r.headers.get("content-range") || "";
      return parseInt((cr0.split("/")[1] || "0"), 10) || 0;
    }
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok) throw makeErr(r.status, data);
    if (opts.count) {
      var cr = r.headers.get("content-range") || "";
      return { rows: data || [], total: parseInt((cr.split("/")[1] || "0"), 10) || 0 };
    }
    return data;
  }

  window.DB = {
    select: function (tabla, opts) { return req("GET", tabla + buildQuery(opts), opts); },
    first: function (tabla, opts) {
      opts = Object.assign({ limit: 1 }, opts || {});
      return req("GET", tabla + buildQuery(opts), {}).then(function (rows) { return (rows && rows[0]) || null; });
    },
    insert: function (tabla, filas, opts) { return req("POST", tabla + buildQuery({ onConflict: (opts || {}).onConflict }), opts || {}, filas); },
    update: function (tabla, patch, opts) { return req("PATCH", tabla + buildQuery(opts), opts || {}, patch); },
    remove: function (tabla, opts) { return req("DELETE", tabla + buildQuery(opts), opts || {}); },
    count: function (tabla, opts) {
      opts = opts || {};
      var q = buildQuery(Object.assign({ select: opts.select || "id" }, opts));
      return req("HEAD", tabla + q, { count: opts.count || "exact" });
    },
    rpc: function (fn, params, opts) { return req("POST", "rpc/" + fn, opts || {}, params || {}); },
    // Escape hatch: para consultas que aún no encajan en la API. path es relativo a /rest/v1/
    raw: function (path, init) { init = init || {}; init.headers = headers(init.headers); return fetch(BASE + path, init); },
    // Utilidades expuestas por compatibilidad / usos avanzados
    _headers: headers, _base: BASE, _token: token
  };
})();
