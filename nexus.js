  // Configuración central (ver config.js, cargado antes que este archivo).
  const CFG = window.NEXUS_CONFIG || {};
  if(!CFG.URL_SB || !CFG.KEY){ console.error("NEXUS: falta config.js (window.NEXUS_CONFIG). Cárgalo antes de nexus.js."); }
  const URL_SB = CFG.URL_SB;
  const KEY = CFG.KEY;
  const DRIVE_URL = CFG.DRIVE_URL;       // URL del Apps Script (Web App)
  const DRIVE_TOKEN = CFG.DRIVE_TOKEN;   // debe coincidir con el TOKEN del Apps Script
  const POR = 50;
  const LINEAS_OK = ["EL","EP","FB","SL","SW","WL","WS","WT"];
  const GRUPO = {EL:"WL",EP:"WL",SL:"WL",WL:"WL",FB:"WS",SW:"WS",WT:"WS",WS:"WS"};
  // Miembros de cada grupo (para filtrar por linea en Inventario y Dashboard)
  const GRUPOS = { WL:["EL","EP","SL","WL"], WS:["FB","SW","WT","WS"] };
  function grupoDe(it){ return GRUPO[String((it&&it.linea_codigo)||"").toUpperCase()] || ""; }
  // ===== Modo modulo: 'mtto' (herramientas/equipos/izaje) o 'it' (solo instrumentos) =====
  let MODULO='mtto';
  // Dias de aviso antes del vencimiento: izaje e instrumentos a 15, el resto a 10.
  const avisoDias = c => (c==='izaje' || c==='instrumento') ? 15 : 10;
  let token = localStorage.getItem("maxim_token") || null;
  let refreshToken = localStorage.getItem("maxim_refresh") || null;
  let refreshTimer = null;
  let usuario = JSON.parse(localStorage.getItem("maxim_user") || "null");
  let rolActual = "consulta";
  let pagina = 0, total = 0;
  let bases = [], unidades = [], modoNuevo = false, itemActual = null;
  let tipos = [], tiposPorNombre = {};
  let dashBuckets={venc:[],pv:[],ok:[]}, dashState="aten", dashTotalItems=0;

  const $ = s => document.querySelector(s);
  const esc = s => (s==null ? "" : String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"));

  // ---- Diálogos propios (reemplazan alert/confirm/prompt nativos) ----
  // Los diálogos nativos se ven pobres en móvil y prompt() no aparece en algunos
  // WebViews (la app corre como Web App). Estos respetan la paleta y sí funcionan.
  function uiDialog(opts){
    return new Promise(function(resolve){
      var o=document.createElement("div");
      o.setAttribute("style","position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom))");
      var card=document.createElement("div");
      card.setAttribute("style","width:min(420px,100%);background:var(--panel,#101114);border:1px solid var(--borde,#23252A);border-radius:12px;padding:20px;box-sizing:border-box;color:var(--texto,#e6e8ea);font-family:var(--sans);box-shadow:0 18px 50px rgba(0,0,0,.5)");
      var msg=document.createElement("div");
      msg.setAttribute("style","font-size:14.5px;line-height:1.5;white-space:pre-line;margin-bottom:16px;color:var(--txt-body,#e6e8ea)");
      msg.textContent=opts.mensaje||"";
      card.appendChild(msg);
      var input=null;
      if(opts.tipo==="prompt"){
        input=document.createElement("input");
        input.type="text"; input.value=opts.valor||"";
        input.setAttribute("style","width:100%;background:var(--negro,#0A0A0B);border:1px solid var(--borde-ctrl,#2a2d33);color:var(--texto,#e6e8ea);padding:11px 12px;border-radius:7px;font-size:15px;box-sizing:border-box;margin-bottom:16px;font-family:var(--sans)");
        card.appendChild(input);
      }
      var fila=document.createElement("div");
      fila.setAttribute("style","display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap");
      function cerrar(val){ if(o.parentNode) o.parentNode.removeChild(o); document.removeEventListener("keydown",onKey); resolve(val); }
      function onKey(e){
        if(e.key==="Escape"){ cerrar(opts.tipo==="prompt"?null:(opts.tipo==="confirm"?false:undefined)); }
        else if(e.key==="Enter"){ cerrar(opts.tipo==="prompt"?(input?input.value:""):(opts.tipo==="confirm"?true:undefined)); }
      }
      if(opts.tipo==="confirm"||opts.tipo==="prompt"){
        var bc=document.createElement("button");
        bc.type="button"; bc.textContent=opts.cancelar||"Cancelar";
        bc.setAttribute("style","min-height:44px;padding:0 16px;border-radius:7px;border:1px solid var(--borde-ctrl,#2a2d33);background:transparent;color:var(--txt2,#c2c5ca);font-weight:600;font-size:14px;cursor:pointer;font-family:var(--sans)");
        bc.addEventListener("click",function(){ cerrar(opts.tipo==="prompt"?null:false); });
        fila.appendChild(bc);
      }
      var bo=document.createElement("button");
      bo.type="button"; bo.textContent=opts.ok||"Aceptar";
      var col=opts.peligro? "var(--rojo,#e2483f)":"var(--naranja,#FF6600)";
      var colTx=opts.peligro? "#fff":"var(--sobre-acento,#000)";
      bo.setAttribute("style","min-height:44px;padding:0 18px;border-radius:7px;border:1px solid "+col+";background:"+col+";color:"+colTx+";font-weight:700;font-size:14px;cursor:pointer;font-family:var(--sans)");
      bo.addEventListener("click",function(){ cerrar(opts.tipo==="prompt"?(input?input.value:""):(opts.tipo==="confirm"?true:undefined)); });
      fila.appendChild(bo);
      card.appendChild(fila);
      o.appendChild(card);
      o.addEventListener("click",function(e){ if(e.target===o && (opts.tipo==="confirm"||opts.tipo==="prompt")) cerrar(opts.tipo==="prompt"?null:false); });
      document.body.appendChild(o);
      document.addEventListener("keydown",onKey);
      if(input){ input.focus(); input.select(); } else { bo.focus(); }
    });
  }
  function uiAlert(mensaje, opts){ opts=opts||{}; return uiDialog({tipo:"alert",mensaje:mensaje,ok:opts.ok||"Entendido",peligro:opts.peligro}); }
  function uiConfirm(mensaje, opts){ opts=opts||{}; return uiDialog({tipo:"confirm",mensaje:mensaje,ok:opts.ok||"Confirmar",cancelar:opts.cancelar,peligro:opts.peligro}); }
  function uiPrompt(mensaje, valor, opts){ opts=opts||{}; return uiDialog({tipo:"prompt",mensaje:mensaje,valor:valor||"",ok:opts.ok||"Guardar",cancelar:opts.cancelar}); }
  function headers(extra){
    const h = {"apikey":KEY,"Content-Type":"application/json"};
    if(token) h["Authorization"] = "Bearer "+token;
    return Object.assign(h, extra||{});
  }
  const esAdmin = () => rolActual === "admin";
  const puedeMant = () => rolActual === "admin" || rolActual === "operador";
  const hoyISO = () => new Date().toISOString().slice(0,10);

  // ---- Pantallas (previa / ingreso / guia / app) ----
  function mostrarPantalla(id){
    ["landing","login","hub","guia","app","appProc","appDD","appIT"].forEach(function(p){
      var el=document.getElementById(p); if(el) el.classList.toggle("hidden", p!==id);
    });
    window.scrollTo(0,0);
  }
  const verLanding = () => mostrarPantalla("landing");
  const verLogin   = () => mostrarPantalla("login");
  const verHub     = () => { mostrarPantalla("hub"); cargarInfografias(); };
  const verGuia    = () => mostrarPantalla("guia");
  const verAppReal = () => mostrarPantalla("app");
  function cerrarSesion(){
    token=null; usuario=null; refreshToken=null;
    if(refreshTimer){ clearTimeout(refreshTimer); refreshTimer=null; }
    localStorage.removeItem("maxim_token"); localStorage.removeItem("maxim_user"); localStorage.removeItem("maxim_refresh");
    verLanding();
  }

  // Mini-API para módulos externos (nexus-it.js): reutilizan sesión, rol y navegación.
  window.NEXUS_APP = {
    hub: function(){ verHub(); },
    salir: function(){ cerrarSesion(); },
    rol: function(){ return rolActual; },
    nombre: function(){ try{ return (usuario && (usuario.user_metadata && usuario.user_metadata.nombre)) || (usuario && usuario.email) || ($("#nombre") && $("#nombre").textContent) || ""; }catch(e){ return ""; } }
  };

  // ---- Sesión: renovación automática del token ----
  // El access_token de Supabase expira (~1h). Guardamos el refresh_token y
  // renovamos ~1 min antes de que caduque, para que ninguna operación falle
  // silenciosamente por sesión vencida. Si el refresh falla, se cierra sesión.
  function guardarSesion(d){
    token = d.access_token;
    if(d.refresh_token){ refreshToken = d.refresh_token; localStorage.setItem("maxim_refresh", refreshToken); }
    localStorage.setItem("maxim_token", token);
    if(d.user){ usuario = d.user; localStorage.setItem("maxim_user", JSON.stringify(usuario)); }
    const expiresIn = d.expires_in ? Number(d.expires_in) : 3600;
    programarRefresh(expiresIn);
  }
  function programarRefresh(expiresIn){
    if(refreshTimer){ clearTimeout(refreshTimer); refreshTimer=null; }
    // renovar 60 s antes de expirar (mínimo 30 s)
    const ms = Math.max((Number(expiresIn||3600) - 60), 30) * 1000;
    refreshTimer = setTimeout(function(){ refrescarSesion(); }, ms);
  }
  async function refrescarSesion(){
    if(!refreshToken) return false;
    try{
      const r = await fetch(URL_SB+"/auth/v1/token?grant_type=refresh_token",{
        method:"POST", headers:{"apikey":KEY,"Content-Type":"application/json"},
        body: JSON.stringify({refresh_token: refreshToken})
      });
      const d = await r.json().catch(function(){return {};});
      if(!r.ok || !d.access_token) throw new Error("refresh_failed");
      guardarSesion(d);
      return true;
    }catch(e){
      // El refresh_token ya no es válido: sesión terminada de verdad.
      cerrarSesion();
      return false;
    }
  }

  $("#btnLanding").addEventListener("click", verLogin);
  $("#btnVolver").addEventListener("click", function(e){ e.preventDefault(); verLanding(); });
  $("#modMtto").addEventListener("click", entrarApp);   // modulo Mtto Operativo -> app actual
  $("#modIT").addEventListener("click", function(){ if(window.NEXUS_IT && window.NEXUS_IT.entrar) window.NEXUS_IT.entrar(); else entrarIT(); }); // modulo Instrumentacion (IT) dedicado; fallback a la vista antigua
  var _mp=$("#modProc"); if(_mp) _mp.addEventListener("click", entrarPO); // modulo Procedimientos Operativos
  var _ph=$("#procHome"); if(_ph) _ph.addEventListener("click", verHub);
  var _ps=$("#procSalir"); if(_ps) _ps.addEventListener("click", cerrarSesion);
  var _md=$("#modDD"); if(_md) _md.addEventListener("click", entrarDD); // modulo Diseño y Dibujo
  var _dh=$("#ddHome"); if(_dh) _dh.addEventListener("click", verHub);
  var _ds=$("#ddSalir"); if(_ds) _ds.addEventListener("click", cerrarSesion);
  $("#navHome").addEventListener("click", verHub);       // volver al hub de modulos
  $("#hubSalir").addEventListener("click", cerrarSesion);
  // Menú de usuario del topbar (móvil): Volver / Guía / Salir
  var _tbMenu=$("#tbMenu"), _tbPop=$("#tbMenuPop");
  if(_tbMenu && _tbPop){
    _tbMenu.addEventListener("click", function(e){ e.stopPropagation(); var open=_tbPop.classList.toggle("hidden"); _tbMenu.setAttribute("aria-expanded", open?"false":"true"); });
    _tbPop.addEventListener("click", function(e){ e.stopPropagation(); });
    document.addEventListener("click", function(){ _tbPop.classList.add("hidden"); _tbMenu.setAttribute("aria-expanded","false"); });
  }
  var _tbHome=$("#tbHome"); if(_tbHome) _tbHome.addEventListener("click", verHub);
  var _tbGuia=$("#tbGuia"); if(_tbGuia) _tbGuia.addEventListener("click", verGuia);
  var _tbSalir=$("#tbSalir"); if(_tbSalir) _tbSalir.addEventListener("click", cerrarSesion);
  $("#gIr").addEventListener("click", entrarApp);
  $("#gIr2").addEventListener("click", entrarApp);
  $("#navGuia").addEventListener("click", verGuia);
  document.querySelectorAll(".rol-card[data-rol]").forEach(function(c){
    c.addEventListener("click", function(){
      c.classList.toggle("open");
      var m=c.querySelector(".rol-more");
      if(m) m.textContent = c.classList.contains("open") ? "Ocultar −" : "Ver qué puede hacer +";
    });
  });

  // ---- Login ----
  $("#formLogin").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn=$("#btnEntrar"), err=$("#loginErr"); const lbl=btn.textContent;
    err.classList.add("hidden"); btn.disabled=true; btn.textContent="Entrando…";
    try{
      const r = await fetch(URL_SB+"/auth/v1/token?grant_type=password",{
        method:"POST", headers:{"apikey":KEY,"Content-Type":"application/json"},
        body: JSON.stringify({email:$("#correo").value, password:$("#clave").value})
      });
      const d = await r.json();
      if(!r.ok || !d.access_token) throw new Error("bad");
      guardarSesion(d);
      await iniciar();
    }catch(ex){
      err.textContent = "No pudimos iniciar sesión. Revisa el correo y la contraseña.";
      err.classList.remove("hidden");
    }finally{ btn.disabled=false; btn.textContent=lbl; }
  });
  $("#salir").addEventListener("click", cerrarSesion);

  function codHTML(c){
    if(!c || c.length<9) return '<span class="cod">'+esc(c)+'</span>';
    return '<span class="cod"><span class="c1">'+c.slice(0,2)+'</span><span class="c2">'+c.slice(2,5)+'</span><span class="c3">'+c.slice(5,8)+'</span><span class="c4">'+c.slice(8)+'</span></span>';
  }
  const catNombre = c => c==="equipo" ? "Equipo de Presión" : (c==="izaje" ? "Izaje" : (c==="instrumento" ? "Instrumentación" : "Herramienta"));

  // ---- Cargas ----
  async function cargarPerfil(){
    try{
      const r = await fetch(URL_SB+"/rest/v1/profiles?select=nombre,rol&id=eq."+usuario.id, {headers:headers()});
      const d = await r.json();
      const p = (d && d[0]) || {nombre: usuario.email, rol:"consulta"};
      rolActual = p.rol || "consulta";
      const nom = p.nombre || usuario.email;
      $("#nombre").textContent = nom;
      $("#gNombre").textContent = "Hola, "+nom;
      $("#hNombre").textContent = "Hola, "+nom;
      const el = $("#rol"); el.textContent = rolActual; el.className = "rol "+rolActual;
      const gel = $("#gRol"); gel.textContent = rolActual; gel.className = "rol "+rolActual;
      const hel = $("#hRol"); hel.textContent = rolActual; hel.className = "rol "+rolActual;
      $("#nuevo").classList.toggle("hidden", !esAdmin());
    }catch(e){ $("#nombre").textContent = usuario.email; $("#gNombre").textContent = "Hola"; }
  }
  async function cargarLineas(){
    try{
      const r = await fetch(URL_SB+"/rest/v1/lineas?select=codigo,nombre&order=codigo",{headers:headers()});
      const d = await r.json();
      (d||[]).filter(l=>LINEAS_OK.includes(l.codigo)).forEach(l=>{
        const txt=l.codigo+(l.nombre?" — "+l.nombre:"");
        [ "#fLinea" ].forEach(sid=>{
          const o=document.createElement("option"); o.value=l.codigo; o.textContent=txt; $(sid).appendChild(o);
        });
      });
    }catch(e){}
  }
  async function cargarBasesUnidades(){
    try{
      const rb = await fetch(URL_SB+"/rest/v1/bases?select=id,nombre&order=nombre",{headers:headers()});
      bases = await rb.json();
      bases.forEach(b=>{ if(!$("#pBase")) return; const o=document.createElement("option"); o.value=String(b.id); o.textContent=b.nombre; $("#pBase").appendChild(o); });
      const ru = await fetch(URL_SB+"/rest/v1/unidades?select=id,nombre&order=nombre",{headers:headers()});
      unidades = await ru.json();
      const selU=$("#fUbi");
      if(selU){
        if(bases && bases.length){
          const g=document.createElement("optgroup"); g.label="Bases";
          bases.forEach(function(b){ const o=document.createElement("option"); o.value="b:"+b.id; o.textContent=b.nombre; g.appendChild(o); });
          selU.appendChild(g);
        }
        if(unidades && unidades.length){
          const g2=document.createElement("optgroup"); g2.label="Unidades";
          unidades.forEach(function(u){ const o=document.createElement("option"); o.value="u:"+u.id; o.textContent=u.nombre; g2.appendChild(o); });
          selU.appendChild(g2);
        }
      }
    }catch(e){ bases=bases||[]; unidades=unidades||[]; }
  }
  // Tipos de herramienta (para el filtro con búsqueda al escribir)
  async function cargarTipos(){
    try{
      const r = await fetch(URL_SB+"/rest/v1/tipos_item?select=codigo_tipo,nombre&order=nombre",{headers:headers()});
      tipos = await r.json() || [];
    }catch(e){ tipos = []; }
    tiposPorNombre = {};
    const dl = document.createElement("datalist"); dl.id = "listaTipos";
    const vistos = {};
    tipos.forEach(t=>{
      const nom = String(t.nombre || t.codigo_tipo);
      const key = nom.toLowerCase();
      (tiposPorNombre[key] = tiposPorNombre[key] || []).push(t.codigo_tipo);
      if(!vistos[key]){ vistos[key]=1; const o=document.createElement("option"); o.value=nom; dl.appendChild(o); }
    });
    const old = document.getElementById("listaTipos"); if(old) old.remove();
    document.body.appendChild(dl);
  }
  // Convierte lo escrito en el filtro de tipo a una lista de codigos_tipo.
  // null = sin filtro ; ["__SINEQ__"] = escribio algo sin coincidencia (resultado vacio)
  function codigosDeTipo(v){
    const raw = (v||"").trim(); if(!raw) return null;
    const low = raw.toLowerCase();
    if(tiposPorNombre[low]) return tiposPorNombre[low];
    const up = raw.toUpperCase();
    let codes = tipos.filter(t=>t.codigo_tipo===up).map(t=>t.codigo_tipo);
    if(codes.length) return codes;
    codes = tipos.filter(t=>String(t.nombre||"").toLowerCase().indexOf(low)>=0).map(t=>t.codigo_tipo);
    return codes.length ? codes : ["__SINEQ__"];
  }

  // ---- Inventario ----
  let timer=null;
  const debounce = fn => { clearTimeout(timer); timer=setTimeout(fn,300); };
  async function buscar(){
    $("#cargando").classList.remove("hidden");
    const q=((document.getElementById("invBuscar") ? document.getElementById("invBuscar").value : $("#q").value) || "").trim(), estado=invEstado, cat=$("#fCategoria").value;
    if(document.getElementById("q")) $("#q").value=q;
    const ubi=$("#fUbi").value;
    const grp=GRUPOS[$("#fLinea").value];
    const tipoCodes=codigosDeTipo($("#fTipo").value);
    let url=URL_SB+"/rest/v1/items?select=id,codigo,codigo_ant,descripcion,estado,linea_codigo,tipo_codigo,categoria_id,sn,fabricante,medida,anio,presion,base_id,unidad_id,lineas(nombre),tipos_item(nombre),bases(nombre),unidades(nombre)&order=codigo";
    if(MODULO==='it'){ url += "&categoria_id=eq.instrumento"; }
    else if(cat==='izaje'){ /* izaje no tiene línea: se filtra por categoría más abajo */ }
    else if(grp){ url += "&linea_codigo=in.("+grp.join(",")+")"; }
    else if(q){ /* búsqueda global: sin filtro de línea para hallar también izaje */ }
    else { url += "&or=(linea_codigo.in.("+LINEAS_OK.join(",")+"),categoria_id.eq.izaje)"; }
    if(q){ const t=encodeURIComponent("*"+q+"*"); url+="&or=(codigo.ilike."+t+",sn.ilike."+t+",descripcion.ilike."+t+")"; }
    if(cat){ if(MODULO==='it') url+="&subtipo=eq."+encodeURIComponent('"'+cat+'"'); else url+="&categoria_id=eq."+cat; }
    if(estado) url+="&estado=eq."+estado;
    if(ubi){ const pref=ubi.slice(0,2), id=ubi.slice(2); if(pref==="b:") url+="&base_id=eq."+id; else if(pref==="u:") url+="&unidad_id=eq."+id; }
    if(tipoCodes) url+="&tipo_codigo=in.("+tipoCodes.map(encodeURIComponent).join(",")+")";
    url+=(invExtra||"");
    url+="&limit="+POR+"&offset="+(pagina*POR);
    try{
      const r=await fetch(url,{headers:headers({"Prefer":"count=exact"})});
      if(r.status===401){ $("#salir").click(); return; }
      const rango=r.headers.get("content-range");
      total = rango && rango.includes("/") ? parseInt(rango.split("/")[1]) : 0;
      const items=await r.json()||[];
      window.invDocs={}; window.invMant={};
      if(items.length){
        const ids=items.map(x=>x.id).join(",");
        try{ const rd=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=item_id,tipo&item_id=in.("+ids+")",{headers:headers()});
          if(rd.ok){ (await rd.json()).forEach(function(d){ if(!window.invDocs[d.item_id]) window.invDocs[d.item_id]={n:0}; if(["coc","ficha_tecnica","manual"].indexOf(d.tipo)>=0) window.invDocs[d.item_id].n++; }); }
        }catch(e){}
        // Ciclo vigente por ítem (para la columna "Últ. mant." con semáforo)
        try{ const rc=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=item_id,fecha_realizado,fecha_vencimiento&vigente=eq.true&item_id=in.("+ids+")",{headers:headers()});
          if(rc.ok){ (await rc.json()).forEach(function(c){ var prev=window.invMant[c.item_id]; if(!prev || String(c.fecha_vencimiento||"")>String(prev.fv||"")) window.invMant[c.item_id]={fr:c.fecha_realizado, fv:c.fecha_vencimiento}; }); }
        }catch(e){}
      }
      pintar(items);
    }catch(e){ $("#filas").innerHTML='<tr><td colspan="5" class="inv-vacio">No se pudo cargar.</td></tr>'; }
    finally{ $("#cargando").classList.add("hidden"); }
  }
  // ===== Inventario: render de filas, paginador, chips y detalle =====
  let invExtra="", invChip="todos", invSelId=null, invEstado="";
  // Celda "Último mantenimiento" con semáforo: verde=al día, ámbar=por vencer, rojo=vencido, gris=sin ciclo.
  function mantCelda(it){
    var m=(window.invMant&&window.invMant[it.id])||null;
    if(!m){ return '<span class="mant sr" title="Sin ciclo registrado">—</span>'; }
    var fecha=m.fr?fechaDMY(m.fr):"—";
    if(!m.fv){ return '<span class="mant sr" title="Sin fecha de vencimiento">'+fecha+'</span>'; }
    var hoy=new Date(); hoy.setHours(0,0,0,0);
    var fv=new Date(String(m.fv).slice(0,10)+"T00:00:00");
    var aviso=(it.categoria_id==='instrumento'||it.categoria_id==='izaje')?15:10;
    var lim=new Date(hoy.getTime()+aviso*86400000);
    var cls='ok', tit='Al día';
    if(fv<hoy){ cls='venc'; tit='VENCIDO'; }
    else if(fv<=lim){ cls='pv'; tit='Por vencer'; }
    return '<span class="mant '+cls+'" title="'+tit+' · vence '+fechaDMY(m.fv)+'">'+fecha+'</span>';
  }
  function pintar(items){
    const tb=$("#filas"); tb.innerHTML="";
    if(!items.length){ tb.innerHTML='<tr><td colspan="5" class="inv-vacio">No hay &iacute;tems que coincidan.</td></tr>'; }
    else items.forEach(function(it){
      const ubic=(it.unidades&&it.unidades.nombre)||(it.bases&&it.bases.nombre)||"—";
      const tipo=(it.tipos_item&&it.tipos_item.nombre)||it.tipo_codigo||"—";
      const desc=it.descripcion||"Sin descripción";
      const docs=(window.invDocs&&window.invDocs[it.id])||{n:0};
      const pct=Math.round((docs.n/3)*100);
      const cls=pct>=100?'good':(pct>=67?'mid':'low');
      const tr=document.createElement("tr"); tr.className="inv-row";
      if(it.id===invSelId) tr.classList.add("sel");
      tr.innerHTML='<td class="c-cod">'+codHTML(it.codigo)+'</td>'+
        '<td class="c-tipo"><div class="inv-tipo">'+esc(tipo)+'</div><div class="inv-desc">'+esc(desc)+'</div></td>'+
        '<td class="c-ubi">'+esc(ubic)+'</td>'+
        '<td class="c-mant">'+mantCelda(it)+'</td>'+
        '<td class="c-doc"><span class="doc-pct '+cls+'">'+pct+'%</span></td>';
      tr.addEventListener("click", function(){ seleccionarItem(it, tr); });
      tb.appendChild(tr);
    });
    $("#conteo").textContent = total.toLocaleString("es-CO");
    renderPagerInv();
  }
  function renderPagerInv(){
    const paginas=Math.max(Math.ceil(total/POR),1);
    const desde= total? (pagina*POR+1):0, hasta=Math.min((pagina+1)*POR, total);
    $("#invRango").textContent = total ? (desde+"–"+hasta+" DE "+total.toLocaleString("es-CO")) : "0 ÍTEMS";
    const cont=$("#invPager"); cont.innerHTML="";
    function boton(txt,pg,dis,act){
      const b=document.createElement("button"); b.className="inv-pg"+(act?" on":""); b.textContent=txt; b.type="button";
      if(dis) b.disabled=true; else b.addEventListener("click", function(){ pagina=pg; buscar(); });
      cont.appendChild(b);
    }
    boton("‹", pagina-1, pagina===0, false);
    let ini=Math.max(0, pagina-2), fin=Math.min(paginas-1, ini+4); ini=Math.max(0, fin-4);
    for(let i=ini;i<=fin;i++){ boton(String(i+1), i, false, i===pagina); }
    boton("›", pagina+1, (pagina+1)>=paginas, false);
  }
  function seleccionarItem(it, tr){
    invSelId=it.id;
    document.querySelectorAll("#filas tr").forEach(function(r){ r.classList.remove("sel"); });
    if(tr) tr.classList.add("sel");
    const ubic=(it.unidades&&it.unidades.nombre)||(it.bases&&it.bases.nombre)||"—";
    const cat=(it.categoria_id==="equipo")?"Equipo de presión":(it.categoria_id==="izaje"?"Izaje":(it.categoria_id==="instrumento"?"Instrumentación":"Herramienta"));
    const tipo=(it.tipos_item&&it.tipos_item.nombre)||it.tipo_codigo||"—";
    $("#invDetVacio").classList.add("hidden");
    $("#invDetBody").classList.remove("hidden");
    $("#invDetCod").textContent=it.codigo||"";
    $("#invDetNom").textContent=it.descripcion||"";
    const pares=[
      ["Línea", esc(it.linea_codigo||"—")],
      ["Tipo", esc(tipo)],
      ["Categoría", cat],
      ["Ubicación", esc(ubic)],
      ["S/N", esc(it.sn||"—")],
      ["Estado", '<span class="badge '+esc(it.estado||"")+'">'+esc((it.estado||"").replace(/_/g," "))+'</span>']
    ];
    $("#invDetPairs").innerHTML=pares.map(function(p){ return '<div class="inv-pair"><span class="k">'+p[0]+'</span><span class="v">'+p[1]+'</span></div>'; }).join("");
    $("#invDetAbrir").onclick=function(){ abrirFicha(it); };
    $("#invDetMant").onclick=function(){ abrirFicha(it); };
    if(window.matchMedia("(max-width:1240px)").matches){ $("#invDetalle").classList.add("open"); }
  }
  async function cargarChipsInv(){
    const hoyISOs=new Date().toISOString().slice(0,10);
    const base=(MODULO==='it')
      ? "categoria_id=eq.instrumento"
      : "or=(linea_codigo.in.(EL,EP,FB,SL,SW,WL,WS,WT),categoria_id.eq.izaje)";
    const cTodos=await contarRest("items",base);
    const cAct=await contarRest("items","estado=eq.activo&"+base);
    const cCampo=await contarRest("items","unidad_id=not.is.null&"+base);
    const cVenc=await contarCiclos("vigente=eq.true&fecha_vencimiento=lt."+hoyISOs);
    const cBaja=await contarRest("items","estado=eq.inactivo&"+base);
    const chips=[
      {k:"todos",  t:"TODOS",        n:cTodos},
      {k:"activos",t:"ACTIVOS",      n:cAct},
      {k:"campo",  t:"EN CAMPO",     n:cCampo},
      {k:"vencido",t:"MTTO VENCIDO", n:cVenc},
      {k:"baja",   t:"BAJA",         n:cBaja}
    ];
    $("#invChips").innerHTML=chips.map(function(c){
      return '<button class="inv-chip'+(c.k===invChip?" on":"")+'" type="button" data-chip="'+c.k+'">'+c.t+' <b>'+c.n.toLocaleString("es-CO")+'</b></button>';
    }).join("");
    $("#invChips").querySelectorAll("[data-chip]").forEach(function(b){ b.addEventListener("click", function(){ setChipInv(b.getAttribute("data-chip")); }); });
  }
  async function idsVencidos(){
    try{
      const hoyISOs=new Date().toISOString().slice(0,10);
      const base=URL_SB+"/rest/v1/ciclos_mantenimiento?select=item_id&vigente=eq.true&fecha_vencimiento=lt."+hoyISOs+"&order=item_id.asc";
      const out=[]; const PAG=1000; let desde=0;
      // Paginación por rangos hasta traerlos todos (antes: limit=500 truncaba el filtro).
      // Tope de seguridad: 20 páginas (20k) para no colgar el navegador.
      for(let i=0;i<20;i++){
        const r=await fetch(base+"&limit="+PAG+"&offset="+desde,{headers:headers()});
        if(!r.ok) break;
        const d=await r.json()||[];
        for(let k=0;k<d.length;k++){ if(d[k].item_id!=null) out.push(d[k].item_id); }
        if(d.length<PAG) break;
        desde+=PAG;
      }
      return [...new Set(out)];
    }catch(e){ return []; }
  }
  async function setChipInv(k){
    invChip=k;
    if(k==="todos"){ invExtra=""; invEstado=""; }
    else if(k==="activos"){ invExtra=""; invEstado="activo"; }
    else if(k==="baja"){ invExtra=""; invEstado="inactivo"; }
    else if(k==="campo"){ invExtra="&unidad_id=not.is.null"; invEstado=""; }
    else if(k==="vencido"){ invEstado=""; const ids=await idsVencidos(); invExtra = ids.length ? ("&id=in.("+ids.join(",")+")") : "&id=eq.-1"; }
    document.querySelectorAll("#invChips [data-chip]").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-chip")===k); });
    pagina=0; buscar();
  }

  // ---- Panel de vencimientos ----

  function docCard(nombre, con, total){ con=con||0; const sin=Math.max(total-con,0);
    return '<div class="kpi"><div class="n">'+con.toLocaleString("es-CO")+'</div><div class="t">con '+nombre+' &middot; sin: '+sin.toLocaleString("es-CO")+'</div></div>'; }
  function barra(tipo,n,max){ const w=Math.max(Math.round(n/max*100),2);
    return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0"><span style="width:210px;font-size:13px;color:var(--tenue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(tipo)+'</span><span style="flex:1;background:var(--panel2);border-radius:4px;height:10px;overflow:hidden"><span style="display:block;height:100%;width:'+w+'%;background:var(--naranja)"></span></span><span style="width:64px;text-align:right;font-weight:700">'+n.toLocaleString("es-CO")+'</span></div>'; }


  function donutSVG(venc,pv,ok,sr){
    var tot=venc+pv+ok+sr||1, r=52, C=2*Math.PI*r, off=0;
    function seg(val,color,state){ if(val<=0) return ""; var f=val/tot, dash=f*C;
      var s='<circle r="'+r+'" cx="70" cy="70" fill="none" stroke="'+color+'" stroke-width="20" stroke-dasharray="'+dash+' '+(C-dash)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 70 70)" data-seg="'+state+'" style="cursor:pointer"></circle>';
      off+=dash; return s; }
    return '<svg width="150" height="150" viewBox="0 0 140 140">'+
      '<circle r="'+r+'" cx="70" cy="70" fill="none" stroke="var(--panel2)" stroke-width="20"></circle>'+
      seg(venc,"var(--rojo)","venc")+seg(pv,"var(--ambar)","pv")+seg(ok,"var(--verde)","ok")+seg(sr,"#3a3f47","sr")+
      '<text x="70" y="66" text-anchor="middle" fill="var(--texto)" font-size="20" font-weight="800">'+(venc+pv+ok+sr).toLocaleString("es-CO")+'</text>'+
      '<text x="70" y="84" text-anchor="middle" fill="var(--tenue)" font-size="10">ítems</text></svg>';
  }
  function setupDashboard(){
    var panel=$("#panel"); if(!panel) return;
    document.querySelectorAll("#dbAlertas [data-alert]").forEach(function(b){ if(!b.getAttribute("data-bound")){ b.setAttribute("data-bound","1"); b.addEventListener("click",async function(){
      var a=b.getAttribute("data-alert");
      var hoy=new Date().toISOString().slice(0,10);
      var aviso=(MODULO==='it')?15:10;
      var dLim=new Date(Date.now()+aviso*86400000).toISOString().slice(0,10);
      if(a==="venc"){ var ids=await idsCiclosCond("vigente=eq.true&fecha_vencimiento=lt."+hoy); drillInventario(ids.length?"&id=in.("+ids.join(",")+")":"&id=eq.-1","Vencidos"); }
      else if(a==="pv"){ var ids=await idsCiclosCond("vigente=eq.true&fecha_vencimiento=gte."+hoy+"&fecha_vencimiento=lte."+dLim); drillInventario(ids.length?"&id=in.("+ids.join(",")+")":"&id=eq.-1","Por vencer ("+aviso+" días)"); }
      else if(a==="off"){ drillInventario("&estado=eq.fuera_servicio", (MODULO==='it'?"Instrumentos":"Ítems")+" fuera de servicio"); }
      else if(a==="inc"){ var ids=await idsCiclosCond("datos_formulario->>incompleto=eq.true"); drillInventario(ids.length?"&id=in.("+ids.join(",")+")":"&id=eq.-1","Mantenimiento incompleto"); }
      else if(a==="doc"){ irPanel("inventario"); }
    }); }});
    if(!$("#donut")){
      var cardsFirst=panel.querySelector(".cards");
      var d=document.createElement("div"); d.id="donut"; d.style.cssText="display:flex;justify-content:center;margin:6px 0 14px";
      if(cardsFirst) panel.insertBefore(d, cardsFirst);
    }
    ["venc","pv","ok","sr"].forEach(function(s){
      var el=panel.querySelector(".kpi."+s);
      if(el && !el.getAttribute("data-lig")){ el.setAttribute("data-lig","1"); el.addEventListener("click", function(){ renderDetalle(s); }); }
    });
    var secs=panel.querySelectorAll(".seccion");
    for(var i=0;i<secs.length;i++){ if(secs[i].textContent.indexOf("Requieren")>=0){ secs[i].id="pDetTitulo"; break; } }
  }
  function renderDetalle(state){
    dashState=state;
    ["venc","pv","ok","sr"].forEach(function(s){
      var el=document.querySelector("#panel .kpi."+s);
      if(el) el.classList.toggle("sel", s===state || (state==="aten" && (s==="venc"||s==="pv")));
    });
    var tit=$("#pDetTitulo"); var lista=[];
    if(state==="aten"){ lista=dashBuckets.venc.concat(dashBuckets.pv); if(tit) tit.textContent="Requieren atención"; }
    else if(state==="venc"){ lista=dashBuckets.venc; if(tit) tit.textContent="Vencidos"; }
    else if(state==="pv"){ lista=dashBuckets.pv; if(tit) tit.textContent=(MODULO==='it'?"Por vencer (15 días)":"Por vencer (10 días · Izaje 15)"); }
    else if(state==="ok"){ lista=dashBuckets.ok; if(tit) tit.textContent="Al día"; }
    else if(state==="sr"){ if(tit) tit.textContent="Sin registro"; renderSinRegistro(); return; }
    var tb=$("#pFilas"); tb.innerHTML="";
    if(lista.length===0){ tb.innerHTML='<tr><td colspan="5" class="vacio">Sin ítems en este estado.</td></tr>'; return; }
    lista.forEach(function(a){
      var it=a.c.items; var baseN=(it.bases&&it.bases.nombre)||"—";
      var aviso=avisoDias(it&&it.categoria_id);
      var dtxt = a.dias<0 ? ("Vencido hace "+Math.abs(a.dias)+"d") : (a.dias<=aviso ? ("Faltan "+a.dias+"d") : ("En "+a.dias+"d"));
      var cls = a.dias<0 ? "rojo" : (a.dias<=aviso ? "ambar" : "");
      var tr=document.createElement("tr");
      tr.innerHTML='<td>'+codHTML(it.codigo)+'</td><td class="desc">'+esc(it.descripcion)+'</td><td>'+esc(baseN)+'</td><td>'+esc(a.c.fecha_vencimiento)+'</td><td><span class="dias '+cls+'">'+dtxt+'</span></td>';
      tr.addEventListener("click", function(){ fetchItemYFicha(it.id); });
      tb.appendChild(tr);
    });
  }
  function renderSinRegistro(){
    var tb=$("#pFilas");
    tb.innerHTML='<tr><td colspan="5" class="vacio">Son los ítems sin ningún mantenimiento registrado (la mayoría por ahora). <a href="#" id="verInvSR" style="color:var(--naranja2)">Verlos en Inventario</a></td></tr>';
    var a=$("#verInvSR"); if(a) a.addEventListener("click", function(e){ e.preventDefault(); irPanel("inventario"); });
  }

  async function cargarPanel(){
    $("#pCargando").classList.remove("hidden");
    setupDashboard();
    const grupo=$("#pLinea").value, cat=$("#pCategoria").value, base=$("#pBase").value;
    const grpLineas=GRUPOS[grupo];
    const tipoCodes=codigosDeTipo($("#pTipo").value);
    // Izaje no tiene línea: se incluye por categoría en vez de por línea.
    let filtroLinea;
    if(MODULO==='it') filtroLinea="&items.categoria_id=eq.instrumento";
    else if(cat==='izaje') filtroLinea="&items.categoria_id=eq.izaje";
    else if(grpLineas) filtroLinea="&items.linea_codigo=in.("+grpLineas.join(",")+")";
    else filtroLinea="&items.or=(linea_codigo.in.("+LINEAS_OK.join(",")+"),categoria_id.eq.izaje)";
    let itemFiltro = filtroLinea;
    if(MODULO!=='it' && cat && cat!=='izaje') itemFiltro+="&items.categoria_id=eq."+cat;
    if(base) itemFiltro+="&items.base_id=eq."+base;
    if(tipoCodes) itemFiltro+="&items.tipo_codigo=in.("+tipoCodes.join(",")+")";
    // total de items segun filtro (para "sin registro")
    let itemsUrl=URL_SB+"/rest/v1/items?select=id";
    if(MODULO==='it') itemsUrl+="&categoria_id=eq.instrumento";
    else if(cat==='izaje') itemsUrl+="&categoria_id=eq.izaje";
    else if(grpLineas) itemsUrl+="&linea_codigo=in.("+grpLineas.join(",")+")";
    else itemsUrl+="&or=(linea_codigo.in.("+LINEAS_OK.join(",")+"),categoria_id.eq.izaje)";
    if(MODULO!=='it' && cat && cat!=='izaje') itemsUrl+="&categoria_id=eq."+cat;
    if(base) itemsUrl+="&base_id=eq."+base;
    if(tipoCodes) itemsUrl+="&tipo_codigo=in.("+tipoCodes.join(",")+")";
    let totalItems=0;
    try{
      const ri=await fetch(itemsUrl,{method:"HEAD",headers:headers({"Prefer":"count=exact"})});
      const rg=ri.headers.get("content-range"); totalItems = rg&&rg.includes("/") ? parseInt(rg.split("/")[1]) : 0;
    }catch(e){}
    // Métricas de estado + completitud: server-side vía RPC (misma fuente que el otro panel).
    // Antes se contaba en el cliente sobre un fetch de ciclos con limit=2000, que se
    // truncaba a escala. Ahora los conteos vienen exactos del RPC; los ciclos se traen
    // solo para poblar el detalle (listas por estado).
    let R={};
    try{
      const body={p_linea: grupo||null, p_categoria: (MODULO==='it'?'instrumento':(cat||null)), p_base: base?parseInt(base):null, p_tipo: tipoCodes||null};
      const rr=await fetch(URL_SB+"/rest/v1/rpc/dashboard_resumen",{method:"POST",headers:headers(),body:JSON.stringify(body)});
      if(rr.ok) R=await rr.json();
    }catch(e){}
    const venc=(R.vencidos)||0, pv=(R.por_vencer)||0, ok=(R.al_dia)||0;
    const sr = Math.max(totalItems - (venc+pv+ok), 0);
    // Detalle: ciclos vigentes ordenados por urgencia (para la tabla de detalle).
    // Los conteos de arriba ya no dependen de esta lista.
    let cUrl=URL_SB+"/rest/v1/ciclos_mantenimiento?select=id,fecha_vencimiento,fecha_realizado,items!inner(id,codigo,descripcion,linea_codigo,categoria_id,base_id,bases(nombre))&vigente=eq.true"+itemFiltro+"&order=fecha_vencimiento.asc&limit=5000";
    let ciclos=[];
    try{ const rc=await fetch(cUrl,{headers:headers()}); if(rc.ok) ciclos=await rc.json(); }catch(e){}
    const hoy=new Date(hoyISO());
    const bVenc=[],bPv=[],bOk=[];
    ciclos.forEach(c=>{
      const v=new Date(c.fecha_vencimiento);
      const dias=Math.round((v-hoy)/86400000);
      const aviso=avisoDias(c.items&&c.items.categoria_id);
      if(v<hoy){ bVenc.push({c,dias}); }
      else if(dias<=aviso){ bPv.push({c,dias}); }
      else { bOk.push({c,dias}); }
    });
    dashBuckets={venc:bVenc,pv:bPv,ok:bOk}; dashTotalItems=totalItems;
    $("#kVenc").textContent=venc.toLocaleString("es-CO"); $("#kPv").textContent=pv.toLocaleString("es-CO"); $("#kOk").textContent=ok.toLocaleString("es-CO"); $("#kSr").textContent=sr.toLocaleString("es-CO");
    const nAlerta=venc+pv;
    const ptA=$("#ptAlerta"); ptA.textContent=nAlerta; ptA.classList.toggle("hidden", nAlerta===0);
    const don=$("#donut");
    if(don){ don.innerHTML=donutSVG(venc,pv,ok,sr); don.querySelectorAll("[data-seg]").forEach(function(s){ s.addEventListener("click", function(){ renderDetalle(s.getAttribute("data-seg")); }); }); }
    renderDetalle(dashState);
    // Completitud documental y cantidades por tipo (reutiliza el mismo R del RPC)
    try{
      const T=(R&&R.total)||0;
      $("#docCards").innerHTML = docCard("COC",R&&R.con_coc,T)+docCard("Ficha técnica",R&&R.con_ficha,T)+docCard("Manual O&M",R&&R.con_manual,T);
      const ptt=(R&&R.por_tipo)||[]; const mx=ptt.length?ptt[0].n:1;
      $("#porTipo").innerHTML = ptt.length ? ptt.map(x=>barra(x.tipo,x.n,mx)).join("") : '<div class="vacio">Sin datos.</div>';
    }catch(e){ $("#porTipo").innerHTML=""; }
    $("#pCargando").classList.add("hidden");
  }

  async function fetchItemYFicha(id){
    try{
      const r=await fetch(URL_SB+"/rest/v1/items?select=id,codigo,codigo_ant,descripcion,estado,linea_codigo,tipo_codigo,categoria_id,sn,fabricante,medida,anio,presion,base_id,unidad_id,lineas(nombre),tipos_item(nombre),bases(nombre),unidades(nombre)&id=eq."+id,{headers:headers()});
      const d=await r.json(); if(d&&d[0]) abrirFicha(d[0]);
    }catch(e){}
  }

  // ---- Ficha ----
  function campoInput(id, label, val, tipo){
    return '<label>'+label+(esAdmin()
      ? '<input id="'+id+'" type="'+(tipo||"text")+'" value="'+esc(val)+'">'
      : '<div class="ro">'+(esc(val)||"—")+'</div>')+'</label>';
  }
  function campoSelect(id, label, val, opciones){
    if(!esAdmin()){
      const t=(opciones.find(o=>o.v===val)||{t:val}).t;
      return '<label>'+label+'<div class="ro">'+(esc(t)||"—")+'</div></label>';
    }
    let o=opciones.map(op=>'<option value="'+esc(op.v)+'"'+(op.v===val?" selected":"")+'>'+esc(op.t)+'</option>').join("");
    return '<label>'+label+'<select id="'+id+'">'+o+'</select></label>';
  }

  async function abrirFicha(it){
    modoNuevo=false; itemActual=it;
    $("#mTitulo").textContent = "Ficha del ítem";
    $("#mSub").innerHTML = codHTML(it.codigo)+' &nbsp; '+esc((it.tipos_item&&it.tipos_item.nombre)||it.tipo_codigo||"");
    $("#mCampos").innerHTML =
      '<div class="row2">'+
        campoSelect("f_cat","Categoría", it.categoria_id||"herramienta",[{v:"herramienta",t:"Herramienta"},{v:"equipo",t:"Equipo de Presión"},{v:"izaje",t:"Izaje"},{v:"instrumento",t:"Instrumentación"}])+
        campoSelect("f_estado","Estado", it.estado||"activo",[{v:"activo",t:"Activo"},{v:"en_mantenimiento",t:"En mantenimiento"},{v:"fuera_servicio",t:"Fuera de servicio"},{v:"inactivo",t:"Inactivo"}])+
      '</div>'+
      '<div id="mCampEsp">'+camposEspItem(it.categoria_id||"herramienta", it)+'</div>'+
      baseUniRow(it)+
      (esAdmin() ? '<label>Agregar unidad nueva<div class="unidad-add"><input id="f_uni_nueva" placeholder="Nombre de la unidad"><button class="btn2" id="f_uni_btn" type="button">Agregar</button></div></label>' : '');
    if(esAdmin()){ var _fcE=$("#f_cat"); if(_fcE) _fcE.addEventListener("change", function(){ $("#mCampEsp").innerHTML=camposEspItem(_fcE.value, it); }); }
    $("#mMsg").className="msg hidden";
    $("#mDescargarPDF").classList.remove("hidden");
    $("#mGuardar").classList.toggle("hidden", !esAdmin());
    $("#mAdminAcciones").classList.toggle("hidden", !esAdmin() || modoNuevo);
    $("#mDarBaja").classList.toggle("hidden", !esAdmin() || modoNuevo || String(it.estado||"") === "inactivo");
    $("#mEliminarDef").classList.toggle("hidden", !esAdmin() || modoNuevo);
    if(esAdmin()) $("#f_uni_btn").addEventListener("click", agregarUnidad);
    configurarUbicacionExclusiva();
    // mantenimiento
    $("#mMantForm").classList.add("hidden");
    $("#mMantBox").classList.remove("hidden");
    $("#mMantAbrir").classList.toggle("hidden", !puedeMant());
    $("#mVerFormWL").classList.add("hidden");
    $("#mIzajeBox").classList.add("hidden");
    $("#mInstrBox").classList.add("hidden");
    $("#mMantAbrir").textContent = esInstrumento() ? "Registrar calibración" : (esIzaje() ? "Recertificar" : "Registrar mantenimiento");
    $("#mFecha").value = hoyISO();
    cicloVigente = null;
    $("#mDocsBox").classList.remove("hidden");
    cargarDocsEstaticos();
    $("#mDocsDin").innerHTML="";
    cargarEstadoMant(it.id);
    cargarHistorialItem(it.id);
    cargarMttoIT(it);
    $("#modalBg").classList.remove("hidden");
  }

  // ---- Mantenimiento IT (módulo nuevo, solo lectura · Fase 1) ----
  async function cargarMttoIT(it){
    var box=$("#mMttoIT"); if(!box) return;
    if(!esInstrumento()){ box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var cod=it.codigo||"", anio=new Date().getFullYear();
    setupMttoITForms(cod);
    $("#itFicha").innerHTML='<div class="rs-empty">Cargando…</div>';
    $("#itMatriz").innerHTML=''; $("#itPrograma").innerHTML=''; $("#itHistIT").innerHTML='';
    var eq=null; try{ eq=await DB.first("mtto_equipo",{eq:{codigo:cod}}); }catch(e){}
    var tipo=(eq&&eq.tipo_equipo)||(it.tipo_codigo||"");
    // Ficha
    if(eq){
      var pares=[["Tipo",esc(eq.tipo_equipo||"—")],["Modelo/Ref",esc(eq.modelo||eq.referencia||"—")],
        ["Serie",esc(eq.serie||"—")],["Marca",esc(eq.marca||"—")],["Ubicación",esc(eq.ubicacion_unidad||"—")],
        ["Vence calibración",eq.vence_calibracion?fechaDMY(eq.vence_calibracion):"—"],
        ["Vida útil",esc(eq.vida_util||"—")],["Estado",esc(eq.estado||"—")]];
      $("#itFicha").innerHTML='<div class="inv-pairs">'+pares.map(function(p){return '<div class="inv-pair"><span class="k">'+p[0]+'</span><span class="v">'+p[1]+'</span></div>';}).join("")+'</div>';
    }else{
      $("#itFicha").innerHTML='<div class="rs-empty">Sin ficha de Mantenimiento IT para '+esc(cod)+'. (¿Se corrió la importación?)</div>';
    }
    // Matriz por tipo
    try{
      var mtz=tipo?await DB.select("mtto_matriz",{eq:{tipo_equipo:tipo},order:"orden.asc"}):[];
      if(mtz&&mtz.length){
        var crit={A:"Ajustar",B:"Calibración",C:"Cambiar/recargar",D:"Engrase/Lubric.",E:"Verif. Funcionamiento",F:"Revisar Filtros",I:"Inspeccionar/Corregir",L:"Limpiar",S:"Verif. Partes/Conex.",V:"Verif. Color/Textura"};
        var rr=mtz.map(function(m){function c(v){return v?('<b title="'+esc(crit[v]||v)+'">'+esc(v)+'</b>'):'·';}
          return '<tr><td>'+esc(m.sistema||"")+'</td><td>'+esc(m.componente||"")+'</td><td class="ct">'+c(m.c1)+'</td><td class="ct">'+c(m.c2)+'</td><td class="ct">'+c(m.c4)+'</td><td class="ct">'+c(m.c6)+'</td></tr>';}).join("");
        $("#itMatriz").innerHTML='<div style="overflow-x:auto"><table class="it-tab"><thead><tr><th>Sistema</th><th>Componente</th><th>C1<br>1m</th><th>C2<br>3m</th><th>C4<br>6m</th><th>C6<br>12m</th></tr></thead><tbody>'+rr+'</tbody></table></div><p class="sub" style="margin-top:6px">A Ajustar·B Calibración·C Cambiar·D Engrase·E Verif.func.·F Filtros·I Inspeccionar·L Limpiar·S Verif.partes·V Verif.color</p>';
      }else{ $("#itMatriz").innerHTML='<div class="rs-empty">Sin matriz para el tipo «'+esc(tipo||"—")+'».</div>'; }
    }catch(e){ $("#itMatriz").innerHTML='<div class="rs-empty">No se pudo cargar la matriz.</div>'; }
    // Programa del año
    try{
      var pr=await DB.select("mtto_programa",{eq:{codigo:cod,anio:anio},order:"mes.asc"});
      if(pr&&pr.length){
        var meses=["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        var chips=pr.map(function(p){var ok=(p.estado==='ejecutado');
          var txt=meses[p.mes||0]+' '+(p.ciclo||'')+(ok?(' ✓'+(p.fecha_ejecutado?(' '+fechaDMY(p.fecha_ejecutado)):'')):'');
          return '<span class="it-chip '+(ok?'ok':'')+'">'+esc(txt)+'</span>';}).join(" ");
        $("#itPrograma").innerHTML='<div class="it-chips">'+chips+'</div>';
      }else{ $("#itPrograma").innerHTML='<div class="rs-empty">Sin programa '+anio+' para este equipo.</div>'; }
    }catch(e){ $("#itPrograma").innerHTML='<div class="rs-empty">No se pudo cargar el programa.</div>'; }
    // Historial: reportes + fallas
    try{
      var reps=[],fls=[];
      try{ reps=await DB.select("mtto_reporte",{eq:{codigo:cod},order:"fecha.desc"}); }catch(e){}
      try{ fls =await DB.select("mtto_falla",{eq:{codigo:cod},order:"fecha.desc"}); }catch(e){}
      var arr=[];
      (reps||[]).forEach(function(r){arr.push({t:r.fecha,k:'rep',d:r});});
      (fls||[]).forEach(function(r){arr.push({t:r.fecha,k:'fal',d:r});});
      arr.sort(function(a,b){return String(b.t||'').localeCompare(String(a.t||''));});
      if(arr.length){
        $("#itHistIT").innerHTML=arr.map(function(x){
          if(x.k==='rep'){var r=x.d; return '<div class="it-hi"><span class="it-badge rep">MTTO</span> <b>'+fechaDMY(r.fecha)+'</b> · '+esc(r.tipo_trabajo||'mantenimiento')+(r.no_certificado?(' · Cert '+esc(r.no_certificado)):'')+(r.ubicacion?(' · '+esc(r.ubicacion)):'')+'<div class="it-hi-d">'+esc(r.descripcion_trabajo||'')+'</div></div>';}
          var f=x.d; return '<div class="it-hi"><span class="it-badge '+(f.estado==='cerrada'?'fcl':'fab')+'">FALLA'+(f.estado==='cerrada'?' ✓':'')+'</span> <b>'+fechaDMY(f.fecha)+'</b>'+(f.unidad?(' · '+esc(f.unidad)):'')+(f.quien_reporta?(' · '+esc(f.quien_reporta)):'')+'<div class="it-hi-d">'+esc(f.descripcion||'')+(f.descripcion_cierre?('<br><i>Cierre: '+esc(f.descripcion_cierre)+'</i>'):'')+'</div></div>';
        }).join("");
      }else{ $("#itHistIT").innerHTML='<div class="rs-empty">Sin reportes ni fallas registrados.</div>'; }
    }catch(e){ $("#itHistIT").innerHTML='<div class="rs-empty">No se pudo cargar el historial.</div>'; }
  }

  // ---- Mantenimiento IT · escritura (Fase 2) ----
  function setupMttoITForms(cod){
    var acc=$("#itAcc"); if(acc) acc.classList.toggle("hidden", !puedeMant());
    var fm=$("#itFormMtto"), ff=$("#itFormFalla");
    if(fm) fm.classList.add("hidden"); if(ff) ff.classList.add("hidden");
    var im=$("#imMsg"); if(im) im.className="msg hidden";
    var ifm=$("#ifMsg"); if(ifm) ifm.className="msg hidden";
    if(!puedeMant()) return;
    $("#itBtnMtto").onclick=function(){ ff.classList.add("hidden"); fm.classList.toggle("hidden");
      $("#imFecha").value=hoyISO(); $("#imFileStatus").textContent=""; };
    $("#itBtnFalla").onclick=function(){ fm.classList.add("hidden"); ff.classList.toggle("hidden");
      $("#ifFecha").value=hoyISO(); $("#ifFileStatus").textContent=""; };
    $("#imCancelar").onclick=function(){ fm.classList.add("hidden"); };
    $("#ifCancelar").onclick=function(){ ff.classList.add("hidden"); };
    $("#imGuardar").onclick=function(){ guardarMttoReporte(cod); };
    $("#ifGuardar").onclick=function(){ guardarMttoFalla(cod); };
  }
  function safeName(s){ return String(s||"archivo").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9._-]+/g,"_").slice(0,80); }
  async function subirAdjuntoMtto(carpeta, cod, file){
    if(!file) return null;
    var path="mtto/"+carpeta+"/"+safeName(cod)+"/"+Date.now()+"_"+safeName(file.name);
    return await subirArchivo(path, file);
  }
  function msg(el, txt, ok){ var e=$(el); if(!e) return; e.textContent=txt; e.className="msg "+(ok?"ok":"err"); }
  async function guardarMttoReporte(cod){
    if(!puedeMant()) return;
    var fecha=$("#imFecha").value||hoyISO();
    var cert=$("#imCert").value.trim();
    var btn=$("#imGuardar"); btn.disabled=true; msg("#imMsg","Guardando…",true);
    try{
      var f=$("#imFile").files[0]||null, adj=null;
      if(f){ $("#imFileStatus").textContent="Subiendo adjunto…"; adj=await subirAdjuntoMtto("reporte",cod,f); $("#imFileStatus").textContent="Adjunto listo."; }
      var costoV=$("#imCosto").value; costoV = costoV===""?null:Number(costoV);
      var fila={ codigo:cod, consecutivo:(cert||null), no_certificado:(cert||null),
        fecha:fecha, ciclo:($("#imCiclo").value||null), tipo_trabajo:$("#imTipo").value,
        ubicacion:($("#imUbic").value.trim()||null), costo:costoV,
        tecnico:($("#imTecnico").value.trim()||null), descripcion_trabajo:($("#imDesc").value.trim()||null),
        adjunto_path:adj, origen:'app' };
      var ins=await DB.insert("mtto_reporte", fila);
      var repId=(ins&&ins[0]&&ins[0].id)||null;
      // marcar el programa del mes/ciclo como ejecutado
      var ciclo=$("#imCiclo").value;
      if(ciclo){ var mes=parseInt(fecha.slice(5,7),10), an=parseInt(fecha.slice(0,4),10);
        try{ await DB.update("mtto_programa",
          { fecha_ejecutado:fecha, reporte_id:repId, estado:'ejecutado' },
          { eq:{ codigo:cod, anio:an, mes:mes, ciclo:ciclo, estado:'programado' } }); }catch(_e){}
      }
      msg("#imMsg","Mantenimiento guardado ✓",true);
      $("#itFormMtto").classList.add("hidden");
      ["imCert","imUbic","imCosto","imTecnico","imDesc"].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=""; });
      var _fi=$("#imFile"); if(_fi) _fi.value="";
      cargarMttoIT(itemActual);
    }catch(e){ msg("#imMsg","No se pudo guardar: "+(e&&e.message||e),false); }
    finally{ btn.disabled=false; }
  }
  async function guardarMttoFalla(cod){
    if(!puedeMant()) return;
    var fecha=$("#ifFecha").value||hoyISO();
    var desc=$("#ifDesc").value.trim();
    if(!desc){ msg("#ifMsg","Escribe la descripción de la falla.",false); return; }
    var btn=$("#ifGuardar"); btn.disabled=true; msg("#ifMsg","Guardando…",true);
    try{
      var f=$("#ifFile").files[0]||null, sop=null;
      if(f){ $("#ifFileStatus").textContent="Subiendo soporte…"; sop=await subirAdjuntoMtto("falla",cod,f); $("#ifFileStatus").textContent="Soporte listo."; }
      var fila={ codigo:cod, codigo_serial_texto:cod, unidad:($("#ifUnidad").value.trim()||null),
        fecha:fecha, quien_reporta:($("#ifQuien").value.trim()||null), proceso:($("#ifProc").value||null),
        descripcion:desc, soporte_path:sop, estado:'abierta', origen:'app' };
      await DB.insert("mtto_falla", fila);
      msg("#ifMsg","Reporte de falla guardado ✓",true);
      $("#itFormFalla").classList.add("hidden");
      ["ifUnidad","ifQuien","ifDesc"].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=""; });
      var _fi=$("#ifFile"); if(_fi) _fi.value="";
      cargarMttoIT(itemActual);
    }catch(e){ msg("#ifMsg","No se pudo guardar: "+(e&&e.message||e),false); }
    finally{ btn.disabled=false; }
  }

  // ---- Indicadores IT · resumen mensual (Fase 3) ----
  var _indMetas=null;
  function abrirIndicadoresIT(){
    var selM=$("#indMes"), selA=$("#indAnio");
    if(selM && !selM.options.length){
      var meses=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
      selM.innerHTML=meses.map(function(m,i){ return '<option value="'+(i+1)+'">'+m+'</option>'; }).join("");
    }
    if(selA && !selA.options.length){
      var y=new Date().getFullYear(); var opt="";
      for(var a=y;a>=y-3;a--) opt+='<option value="'+a+'">'+a+'</option>';
      selA.innerHTML=opt;
    }
    var now=new Date();
    if(selM) selM.value=String(now.getMonth()+1);
    if(selA) selA.value=String(now.getFullYear());
    $("#indBody").innerHTML='<div class="rs-empty">Elige el periodo y genera el resumen.</div>';
    $("#modalInd").classList.remove("hidden");
    generarIndicadoresIT();
  }
  function pad2(n){ return (n<10?"0":"")+n; }
  async function cnt(tabla, opts){ try{ return await DB.count(tabla, opts||{}); }catch(e){ return 0; } }
  async function generarIndicadoresIT(){
    var mes=parseInt($("#indMes").value,10)||(new Date().getMonth()+1);
    var anio=parseInt($("#indAnio").value,10)||new Date().getFullYear();
    var body=$("#indBody"); body.innerHTML='<div class="rs-empty">Calculando…</div>';
    var d1=anio+"-"+pad2(mes)+"-01";
    var nm=(mes===12)?(anio+1)+"-01-01":(anio+"-"+pad2(mes+1)+"-01");
    var hoy=hoyISO(); var d30=new Date(); d30.setDate(d30.getDate()+30); var hoy30=d30.toISOString().slice(0,10);
    try{
      if(!_indMetas){ try{ var cat=await DB.select("mtto_indicador",{}); _indMetas={}; (cat||[]).forEach(function(k){ _indMetas[k.codigo]=k; }); }catch(e){ _indMetas={}; } }
      var metaProg=(_indMetas["MTO-04"]&&_indMetas["MTO-04"].meta)||0.8;
      var metaFall=(_indMetas["MTO-03"]&&_indMetas["MTO-03"].meta)||0.8;
      var progTot=await cnt("mtto_programa",{eq:{anio:anio,mes:mes}});
      var progEje=await cnt("mtto_programa",{eq:{anio:anio,mes:mes,estado:"ejecutado"}});
      var falTot=await cnt("mtto_falla",{filters:["fecha=gte."+d1,"fecha=lt."+nm]});
      var falCer=await cnt("mtto_falla",{filters:["fecha=gte."+d1,"fecha=lt."+nm,"estado=eq.cerrada"]});
      var falAbi=await cnt("mtto_falla",{eq:{estado:"abierta"}});
      var repMes=await cnt("mtto_reporte",{filters:["fecha=gte."+d1,"fecha=lt."+nm]});
      var calVen=await cnt("mtto_equipo",{select:"codigo",filters:["vence_calibracion=lt."+hoy]});
      var calPor=await cnt("mtto_equipo",{select:"codigo",filters:["vence_calibracion=gte."+hoy,"vence_calibracion=lte."+hoy30]});
      var equip =await cnt("mtto_equipo",{select:"codigo"});
      var pctProg=progTot?progEje/progTot:null;
      var pctFall=falTot?falCer/falTot:null;
      function kpi(cod,nom,pct,meta,detalle){
        var has=(pct!=null); var ok=has&&pct>=meta;
        var val=has?Math.round(pct*100)+"%":"—";
        return '<div class="ind-card '+(has?(ok?"ok":"bad"):"")+'">'
          +'<div class="ind-cod">'+esc(cod)+'</div><div class="ind-nom">'+esc(nom)+'</div>'
          +'<div class="ind-val">'+val+'</div>'
          +'<div class="ind-meta">Meta '+Math.round(meta*100)+'% · '+esc(detalle)+'</div></div>';
      }
      function stat(nom,val,cls){ return '<div class="ind-card '+(cls||"")+'"><div class="ind-nom">'+esc(nom)+'</div><div class="ind-val">'+val+'</div></div>'; }
      body.innerHTML=''
        +'<div class="ind-grid">'
          +kpi("MTO-04","Cumplimiento del programa",pctProg,metaProg,progEje+" de "+progTot+" programados")
          +kpi("MTO-03","Fallas solucionadas",pctFall,metaFall,falCer+" cerradas de "+falTot)
        +'</div>'
        +'<div class="ind-grid" style="margin-top:10px">'
          +stat("Reportes de mtto (mes)",repMes)
          +stat("Fallas del mes",falTot)
          +stat("Fallas abiertas (total)",falAbi,falAbi>0?"warn":"")
          +stat("Calibración vencida",calVen,calVen>0?"bad":"ok")
          +stat("Por vencer (30 días)",calPor,calPor>0?"warn":"")
          +stat("Equipos registrados",equip)
        +'</div>'
        +'<p class="sub" style="margin-top:10px">MTO-01 (Intervención de oportunidades) y MTO-02 (Intervención de riesgos) son cuatrimestrales y se registran manualmente en el tablero MF-F-DE-030.</p>';
    }catch(e){ body.innerHTML='<div class="rs-empty">No se pudo calcular: '+esc(e&&e.message||String(e))+'</div>'; }
  }

  let histAbierto=null;
  function fechaDMY(iso){ if(!iso) return "Sin fecha"; var s=String(iso).slice(0,10).split("-"); return (s.length===3)?(s[2]+"-"+s[1]+"-"+s[0]):String(iso); }
  async function cargarHistorialItem(itemId){
    const box=$("#mHistorial"); if(!box) return;
    box.innerHTML='<div class="rs-empty">Consultando historial…</div>';
    try{
      const r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id,fecha_realizado,fecha_vencimiento,metodo,vigente,datos_formulario&item_id=eq."+itemId+"&order=fecha_realizado.desc&limit=50",{headers:headers()});
      const d=r.ok?await r.json():[];
      if(!d.length){ box.innerHTML='<div class="rs-empty">Sin historial registrado.</div>'; return; }
      var ids=d.map(function(x){return x.id;}).filter(Boolean); var docs=[];
      if(ids.length){ try{ var dr=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,ciclo_id,tipo,archivo_path&ciclo_id=in.("+ids.join(',')+")",{headers:headers()}); docs=dr.ok?await dr.json():[]; }catch(_e){} }
      var docsPor={}; docs.forEach(function(q){(docsPor[q.ciclo_id]||(docsPor[q.ciclo_id]=[])).push(q);});
      const nombres={reporte_mantenimiento:'Reporte de mantenimiento',reporte_falla:'Reporte de falla',ndt:'Reporte NDT',prueba_presion:'PH',espesores:'Espesores',prueba_dureza:'Prueba de dureza',certificado_inspeccion:'Certificado de inspección'};
      const puede=puedeMant(); const admin=esAdmin();
      box.innerHTML=d.map(function(x){
        const abierto=(String(x.id)===String(histAbierto));
        const dl=docsPor[x.id]||[];
        const datos=x.datos_formulario||{};
        const nrep=String(datos.n_reporte||'');
        const tipoRaw=String(datos.tipo_mantenimiento||'').toLowerCase();
        const prevRaw=String(datos.ciclo_preventivo||'').toUpperCase();
        let tipoLabel='Mantenimiento';
        if(tipoRaw==='correctivo') tipoLabel='Correctivo';
        else if(tipoRaw==='preventivo') tipoLabel='Preventivo'+(prevRaw?' '+prevRaw:'');
        else if(tipoRaw==='recertificacion') tipoLabel='Recertificación';
        const codTxt=(tipoRaw==='recertificacion' && datos.codigo_nuevo)
          ? ' · Código: '+esc(String(datos.codigo_nuevo))+((datos.codigo_anterior && datos.codigo_anterior!==datos.codigo_nuevo)?' (antes '+esc(String(datos.codigo_anterior))+')':'')
          : '';
        const estado=x.vigente?'<span class="badge activo">VIGENTE</span>':'<span class="badge inactivo">HISTÓRICO</span>';
        const filas = dl.length
          ? dl.map(function(q){
              const clave=esc(x.id)+'|'+esc(q.tipo)+'|'+esc(q.id);
              let acc='<a href="#" class="hd-ver" data-ver="'+esc(q.archivo_path)+'">Ver</a>';
              if(puede) acc+='<button type="button" class="hd-chg" data-hchg="'+clave+'">Cambiar</button>'
                +'<button type="button" class="hd-del" data-hdel="'+clave+'" data-hpath="'+esc(q.archivo_path||'')+'" data-hnrep="'+esc(nrep)+'">Eliminar</button>';
              return '<div class="hd-doc"><span class="hd-ic">📄</span><span class="hd-n">'+esc(nombres[q.tipo]||q.tipo)+'</span><span class="hd-acc">'+acc+'</span></div>';
            }).join("")
          : '<div class="hd-vacio">No hay documentos asociados a este ciclo.</div>';
        const pie = admin ? '<div class="hd-ciclo-foot"><button type="button" class="hd-delciclo" data-hdelciclo="'+esc(x.id)+'">🗑 Eliminar ciclo</button></div>' : '';
        return '<div class="hist-acc'+(abierto?' open':'')+'" data-ciclo="'+esc(x.id)+'">'
          +'<button type="button" class="hist-head" data-acc="'+esc(x.id)+'">'
            +'<span class="hh-tit"><b>'+esc(tipoLabel)+'</b> / '+esc(fechaDMY(x.fecha_realizado))+codTxt+'</span>'
            +'<span class="hh-meta">'+estado+'<span class="hh-count">'+dl.length+' '+(dl.length===1?'documento':'documentos')+'</span><span class="hh-chev">▼</span></span>'
          +'</button>'
          +'<div class="hist-body"><div class="hist-body-in">'+filas+pie+'</div></div>'
        +'</div>';
      }).join("");
      box.querySelectorAll("[data-acc]").forEach(function(btn){
        btn.addEventListener("click",function(){
          var cont=btn.closest(".hist-acc"); var abrir=!cont.classList.contains("open");
          box.querySelectorAll(".hist-acc.open").forEach(function(o){ o.classList.remove("open"); });
          if(abrir){ cont.classList.add("open"); histAbierto=cont.getAttribute("data-ciclo"); }
          else histAbierto=null;
        });
      });
      box.querySelectorAll("[data-hchg]").forEach(function(b){ b.addEventListener("click",function(){ var p=b.getAttribute("data-hchg").split("|"); histCambiarDoc(p[0],p[1],p[2]); }); });
      box.querySelectorAll("[data-hdel]").forEach(function(b){ b.addEventListener("click",function(){ var p=b.getAttribute("data-hdel").split("|"); histEliminarDoc(p[0],p[1],p[2],b.getAttribute("data-hpath"),b.getAttribute("data-hnrep")); }); });
      box.querySelectorAll("[data-hdelciclo]").forEach(function(b){ b.addEventListener("click",function(){ histEliminarCiclo(b.getAttribute("data-hdelciclo")); }); });
      enlazarSlots(box);
    }catch(e){ box.innerHTML='<div class="rs-empty">No se pudo cargar el historial.</div>'; }
  }
  // ===== Acciones del acordeón de historial (funciona en cualquier ciclo, no solo el vigente) =====
  let histPend=null;
  function histCambiarDoc(cicloId, tipo, docId){
    if(!puedeMant()){ mostrarMsg("No tienes permiso para cambiar documentos.",false); return; }
    histPend={cicloId:cicloId, tipo:tipo, docId:docId};
    var fp=$("#histFile"); if(!fp) return; fp.value=""; fp.click();
  }
  async function histEliminarDoc(cicloId, tipo, id, path, nrep){
    if(!puedeMant()){ mostrarMsg("No tienes permiso para eliminar documentos.",false); return; }
    if(!id){ mostrarMsg("No se puede eliminar: documento sin identificador.",false); return; }
    if(!(await uiConfirm("¿Deseas eliminar este documento?\nEsta acción no se puede deshacer.",{ok:"Eliminar",peligro:true}))) return;
    try{
      if(path && !/^https?:\/\//i.test(path)){ try{ await fetch(URL_SB+"/storage/v1/object/documentos/"+encPath(path),{method:"DELETE",headers:headers()}); }catch(_e){} }
      var r=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:headers({"Prefer":"return=representation"})});
      var dd=r.ok?await r.json():[];
      if(!r.ok || !dd.length){ throw new Error("No se pudo eliminar el registro (posible restricción de permisos/RLS)."); }
      if(DRIVE_URL){
        var esArchivoNexus = path && !/^https?:\/\//i.test(path);
        var esPdfCorporativo = (tipo==="reporte_mantenimiento" && path && /^https?:\/\//i.test(path));
        if(esArchivoNexus || esPdfCorporativo){
          try{
            var nombreDrive = (tipo==="reporte_mantenimiento") ? ("MF-F-MTO-025_"+String(nrep||cicloId)+".pdf") : ("dinamico_"+tipo);
            await fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"delete_file",token:DRIVE_TOKEN,categoria:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,ciclo:cicloId,filename:nombreDrive})});
          }catch(_e){}
        }
      }
      mostrarMsg("Documento eliminado.",true);
      histAbierto=String(cicloId);
      cargarHistorialItem(itemActual.id);
      if(cicloVigente && String(cicloVigente.id)===String(cicloId)) cargarDocsDinamicos();
    }catch(e){ mostrarMsg(e.message||"No se pudo eliminar el documento.",false); }
  }
  async function histEliminarCiclo(cicloId){
    if(!esAdmin()){ mostrarMsg("Solo un administrador puede eliminar ciclos.",false); return; }
    if(!(await uiConfirm("⚠️ ELIMINAR CICLO\nEsta acción eliminará el ciclo de mantenimiento y los documentos asociados a él.\n¿Deseas continuar?",{ok:"Eliminar ciclo",peligro:true}))) return;
    try{
      var dr=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,tipo,archivo_path&ciclo_id=eq."+encodeURIComponent(cicloId),{headers:headers()});
      var docs=dr.ok?await dr.json():[];
      for(var i=0;i<docs.length;i++){
        var q=docs[i];
        if(q.archivo_path && !/^https?:\/\//i.test(q.archivo_path)){ try{ await fetch(URL_SB+"/storage/v1/object/documentos/"+encPath(q.archivo_path),{method:"DELETE",headers:headers()}); }catch(_e){} }
        try{ await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+encodeURIComponent(q.id),{method:"DELETE",headers:headers({"Prefer":"return=minimal"})}); }catch(_e){}
        if(DRIVE_URL && q.tipo!=="reporte_mantenimiento"){ try{ await fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"delete_file",token:DRIVE_TOKEN,categoria:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,ciclo:cicloId,filename:"dinamico_"+q.tipo})}); }catch(_e){} }
      }
      var cr=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?id=eq."+encodeURIComponent(cicloId),{method:"DELETE",headers:headers({"Prefer":"return=representation"})});
      var cd=cr.ok?await cr.json():[];
      if(!cr.ok || !cd.length){ mostrarMsg("Los documentos se eliminaron, pero el ciclo no se pudo borrar. Revisa la política RLS de DELETE en ciclos_mantenimiento.",false); }
      else{ mostrarMsg("Ciclo eliminado.",true); }
      histAbierto=null;
      if(cicloVigente && String(cicloVigente.id)===String(cicloId)){ cicloVigente=null; cicloDatos=null; try{ cargarEstadoMant(itemActual.id); }catch(_e){} }
      cargarHistorialItem(itemActual.id);
    }catch(e){ mostrarMsg(e.message||"No se pudo eliminar el ciclo.",false); }
  }

  async function cargarEstadoMant(itemId){
    const el=$("#mMantEstado"); el.textContent="Consultando…";
    try{
      const r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id,fecha_realizado,fecha_vencimiento,metodo,datos_formulario&item_id=eq."+itemId+"&vigente=eq.true&limit=1",{headers:headers()});
      const d=await r.json();
      if(d&&d[0]){
        cicloVigente={id:d[0].id, fecha_realizado:d[0].fecha_realizado, metodo:d[0].metodo}; cicloDatos=d[0].datos_formulario||null; cargarDocsDinamicos();
        $("#mVerFormWL").classList.toggle("hidden", !(d[0].metodo==="formulario" && grupoDe(itemActual)==="WL"));
        $("#mVerFormWL").textContent = puedeMant() ? "Editar formulario" : "Ver formulario";
        const v=new Date(d[0].fecha_vencimiento); const hoy=new Date(hoyISO());
        const dias=Math.round((v-hoy)/86400000);
        const aviso = esIzaje() ? 15 : 10;
        const est = dias<0 ? ("VENCIDO hace "+Math.abs(dias)+" días") : (dias<=aviso ? ("Por vencer en "+dias+" días") : ("Al día ("+dias+" días)"));
        el.innerHTML = "Último: "+d[0].fecha_realizado+" &middot; Vence: "+d[0].fecha_vencimiento+" &middot; <b>"+est+"</b>";
      } else { cicloVigente=null; cicloDatos=null; $("#mVerFormWL").classList.add("hidden"); el.textContent = "Sin mantenimiento registrado."; $("#mDocsDin").innerHTML=""; }
    }catch(e){ el.textContent=""; }
  }

  function resetMttoDraft(){
    mttoDraft={tipo:null,preventivo:null,reportMethod:null,reportFile:null,fallaFile:null,ndtFile:null,phFile:null,online:false,formComplete:false,cycleCreated:false,editingCycle:false};
    ["mRepStatus","mFallaStatus","mNdtStatus","mPhStatus","mPrevRegla","mPreventivoReq"].forEach(function(id){var e=$("#"+id);if(e)e.textContent="";});
    ["mRepFormBtn","mRepFileBtn","mRepPhotoBtn","mFallaBtn","mNdtBtn","mPhBtn"].forEach(function(id){var e=$("#"+id);if(e)e.disabled=false;});
    ["mRepFile","mRepPhoto","mFallaFile","mNdtFile","mPhFile"].forEach(function(id){var e=$("#"+id);if(e)e.value="";});
  }
  function categoriaItem(){ return String(itemActual&&itemActual.categoria_id||"herramienta").toLowerCase(); }
  function esIzaje(){ return categoriaItem()==="izaje"; }
  function esInstrumento(){ return categoriaItem()==="instrumento"; }
  function reglaPreventiva(){
    var c=categoriaItem(), p=mttoDraft.preventivo;
    if(p==="C2") return {ok:true, req:["reporte_mantenimiento"], txt:"C2 · aplica a herramientas y equipos de presión. Obligatorio: Reporte de mantenimiento."};
    if(p==="C4") return {ok:c==="herramienta", req:["reporte_mantenimiento","ndt"], txt:"C4 · aplica únicamente a herramientas. Obligatorios: Reporte de mantenimiento + Reporte NDT."};
    if(p==="C6") return {ok:c==="equipo", req:["reporte_mantenimiento","ndt","prueba_presion"], txt:"C6 · aplica únicamente a equipos de presión. Obligatorios: Reporte de mantenimiento + Reporte NDT + PH."};
    return {ok:false,req:[],txt:""};
  }
  function actualizarFlujoMtto(){
    var tipo=$("#mTipoMant").value, prev=$("#mTipoPrev").value;
    mttoDraft.tipo=tipo; mttoDraft.preventivo=prev;
    $("#mPrevBox").classList.toggle("hidden",tipo!=="preventivo");
    $("#mCorrectivoBox").classList.toggle("hidden",tipo!=="correctivo");
    $("#mPreventivoBox").classList.toggle("hidden",tipo!=="preventivo");
    $("#mFallaBox").classList.toggle("hidden",tipo!=="correctivo");
    $("#mNdtBox").classList.add("hidden"); $("#mPhBox").classList.add("hidden");
    $("#mRepMantBox").classList.toggle("hidden",!tipo || (tipo==="preventivo"&&!prev));
    if(tipo==="preventivo"&&prev){
      var r=reglaPreventiva();
      $("#mPrevRegla").textContent=r.ok?r.txt:"Este tipo no aplica a la categoría seleccionada.";
      $("#mPreventivoReq").textContent=r.txt;
      // Mostrar siempre los espacios de carga correspondientes a C4/C6.
      // Si la categoría no aplica, el selector ya bloquea el guardado, pero
      // el usuario sigue viendo claramente qué documentos corresponden al ciclo.
      $("#mNdtBox").classList.toggle("hidden",!(prev==="C4"||prev==="C6"));
      $("#mPhBox").classList.toggle("hidden",prev!=="C6");
    }
  }
  function elegirReporte(method){
    // El reporte de mantenimiento admite UNA sola modalidad. Si el usuario
    // cambia de modalidad antes de guardar, se limpia la anterior.
    if(mttoDraft.reportMethod && mttoDraft.reportMethod!==method){
      mttoDraft.reportFile=null;
      mttoDraft.online=false;
      mttoDraft.formComplete=false;
      ["mRepFile","mRepPhoto"].forEach(function(id){var e=$("#"+id);if(e)e.value="";});
    }
    mttoDraft.reportMethod=method;
    $("#mRepStatus").textContent=method==="formulario"?"Seleccionado: Formulario en línea":
      "Seleccionado: "+(method==="foto"?"Foto directa":"Archivo adjunto");
    ["mRepFormBtn","mRepFileBtn","mRepPhotoBtn"].forEach(function(id){
      var b=$("#"+id); if(b) b.disabled=false;
    });
    if(method==="archivo"){ $("#formWLbg").classList.add("hidden"); $("#mRepFile").click(); }
    if(method==="foto"){ $("#formWLbg").classList.add("hidden"); $("#mRepPhoto").click(); }
    if(method==="formulario"){
      mttoDraft.online=true;
      if(grupoDe(itemActual)==="WL") abrirFormWL(null,false); else $("#mObs").focus();
    }
  }
  function validarArchivo(file, label){
    if(!file) return false;
    var ok=/^(application\/pdf|image\/|application\/(msword|vnd.openxmlformats-officedocument\.|vnd.ms-excel|vnd.openxmlformats-officedocument.spreadsheetml))/i.test(file.type||"") || /\.(pdf|png|jpe?g|webp|doc|docx|xls|xlsx)$/i.test(file.name||"");
    if(!ok){ mostrarMsg(label+" debe ser PDF, imagen o archivo Office.",false); return false; }
    return true;
  }
  async function subirDocCiclo(tipo,file){
    if(!cicloVigente||!file) throw new Error("No hay ciclo");
    var ext=(file.name.split(".").pop()||((file.type||"").split("/")[1]||"bin")).toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
    var path=rutaBase()+"/ciclo_"+cicloVigente.id+"/dinamico_"+tipo+"_"+Date.now()+"."+ext;
    await subirArchivo(path,file);
    var rq=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id&ciclo_id=eq."+cicloVigente.id+"&tipo=eq."+tipo,{headers:headers()});
    var ex=await rq.json();
    if(ex&&ex[0]) await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({archivo_path:path})});
    else await fetch(URL_SB+"/rest/v1/documentos_dinamicos",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({ciclo_id:cicloVigente.id,tipo:tipo,archivo_path:path})});
    reflejarDrive({categoria:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,ciclo:cicloVigente.id,filename:"dinamico_"+tipo+"."+ext},file);
  }
  async function procesarArchivoDraft(tipo,file,statusId){
    if(!validarArchivo(file,"El documento")) return;
    mttoDraft[tipo+"File"]=file;
    $("#"+statusId).textContent="Seleccionado: "+file.name;
    // Si ya existe ciclo, se guarda inmediatamente; si no, queda preparado para después de crear el ciclo.
    if(cicloVigente && mttoDraft.cycleCreated){ try{ await subirDocCiclo(tipo,file); cargarDocsDinamicos(); }catch(e){ mostrarMsg("No se pudo cargar el documento.",false); } }
  }
  $("#mMantAbrir").addEventListener("click", function(){
    if(esInstrumento()){ abrirRegCalib(); return; }
    if(esIzaje()){ abrirRecertIzaje(); return; }
    resetMttoDraft(); $("#mMantForm").classList.toggle("hidden"); actualizarFlujoMtto();
  });
  function abrirRegCalib(){
    $("#mInstrFecha").value=hoyISO();
    $("#mInstrVence").value="";
    $("#mInstrNum").value="";
    $("#mInstrFile").value="";
    $("#mInstrFileStatus").textContent="";
    var m=$("#mInstrMsg"); m.textContent=""; m.className="msg hidden";
    $("#mInstrBox").classList.toggle("hidden");
  }
  async function guardarCalibracion(){
    if(!itemActual) return;
    var m=$("#mInstrMsg");
    var msg=function(t,ok){ m.textContent=t; m.className="msg "+(ok?"ok":"bad"); m.classList.remove("hidden"); };
    var ctrl=$("#mInstrTipo").value;
    var fReal=$("#mInstrFecha").value;
    var fVence=$("#mInstrVence").value;
    var nCert=($("#mInstrNum").value||"").trim();
    var file=$("#mInstrFile").files[0];
    if(!fReal){ msg("Indica la fecha de calibración/verificación.",false); return; }
    if(!fVence){ msg("Indica la fecha de vencimiento (la que trae el certificado).",false); return; }
    if(file && !validarArchivo(file,"El certificado")) return;
    var btn=$("#mInstrGuardar"); var prev=btn.textContent; btn.disabled=true; btn.textContent="Guardando…";
    try{
      var datos={tipo_control:ctrl, n_certificado:nCert||null, incompleto:!file};
      if(!file){ datos.documentos_faltantes=[docCalibKey(ctrl)]; }
      var body={p_item_id:itemActual.id,p_fecha_realizado:fReal,p_fecha_vencimiento:fVence,p_metodo:ctrl,p_datos:datos};
      var r=await fetch(URL_SB+"/rest/v1/rpc/registrar_calibracion",{method:"POST",headers:headers(),body:JSON.stringify(body)});
      if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error(e.message||"No se pudo registrar la calibración."); }
      var ciclo=await r.json();
      cicloVigente={id:ciclo,fecha_realizado:fReal,metodo:ctrl}; cicloDatos=datos;
      if(file){ await subirDocCiclo(docCalibKey(ctrl),file); }
      msg(file?"Calibración registrada con su certificado.":"Calibración registrada. Queda INCOMPLETA hasta subir el certificado.",true);
      cargarEstadoMant(itemActual.id); cargarHistorialItem(itemActual.id); cargarDocsDinamicos();
      setTimeout(function(){ $("#mInstrBox").classList.add("hidden"); },1200);
      buscar();
    }catch(e){ msg(e.message||"No se pudo registrar la calibración.",false); }
    finally{ btn.disabled=false; btn.textContent=prev; }
  }
  $("#mInstrGuardar").addEventListener("click", guardarCalibracion);
  $("#mInstrFile").addEventListener("change", function(){ var f=this.files[0]; $("#mInstrFileStatus").textContent = f ? ("Seleccionado: "+f.name) : ""; });
  function abrirRecertIzaje(){
    $("#mIzajeFecha").value=hoyISO();
    $("#mIzajeCodigo").value="";
    $("#mIzajeCert").value="";
    $("#mIzajeCertStatus").textContent="";
    var m=$("#mIzajeMsg"); m.textContent=""; m.className="msg hidden";
    $("#mIzajeBox").classList.toggle("hidden");
  }
  async function guardarRecertIzaje(){
    if(!itemActual) return;
    var m=$("#mIzajeMsg");
    var msg=function(t,ok){ m.textContent=t; m.className="msg "+(ok?"ok":"bad"); m.classList.remove("hidden"); };
    var fecha=$("#mIzajeFecha").value;
    var codNuevo=($("#mIzajeCodigo").value||"").trim();
    var file=$("#mIzajeCert").files[0];
    if(!fecha){ msg("Indica la fecha de la recertificación.",false); return; }
    if(!codNuevo){ msg("Escribe el nuevo código (precinto).",false); return; }
    if(!file){ msg("Adjunta el Certificado de inspección.",false); return; }
    if(!validarArchivo(file,"El certificado")) return;
    var btn=$("#mIzajeGuardar"); var prev=btn.textContent; btn.disabled=true; btn.textContent="Guardando…";
    try{
      var body={p_item_id:itemActual.id,p_codigo_nuevo:codNuevo,p_fecha_realizado:fecha,p_datos:{}};
      var r=await fetch(URL_SB+"/rest/v1/rpc/recertificar_izaje",{method:"POST",headers:headers(),body:JSON.stringify(body)});
      if(!r.ok){ var e=await r.json().catch(function(){return{};}); throw new Error(e.message||"No se pudo recertificar."); }
      var res=await r.json();
      var codAnterior=itemActual.codigo;
      itemActual.codigo_ant=codAnterior;
      itemActual.codigo=res.codigo_nuevo||codNuevo;
      cicloVigente={id:res.ciclo_id,fecha_realizado:fecha,metodo:"recertificacion"};
      cicloDatos={tipo_mantenimiento:"recertificacion",codigo_anterior:codAnterior,codigo_nuevo:itemActual.codigo};
      await subirDocCiclo("certificado_inspeccion",file);
      var borrar=(res.paths_borrados||[]);
      for(var i=0;i<borrar.length;i++){ var p=borrar[i]; if(p && !/^https?:\/\//i.test(p)){ try{ await borrarStorage(p); }catch(_e){} } }
      $("#mSub").innerHTML = codHTML(itemActual.codigo)+' &nbsp; '+esc((itemActual.tipos_item&&itemActual.tipos_item.nombre)||itemActual.tipo_codigo||"");
      msg("Recertificación guardada. Nuevo código: "+itemActual.codigo+".",true);
      cargarEstadoMant(itemActual.id); cargarHistorialItem(itemActual.id); cargarDocsDinamicos();
      setTimeout(function(){ $("#mIzajeBox").classList.add("hidden"); },1000);
      buscar();
    }catch(e){ msg(e.message||"No se pudo recertificar.",false); }
    finally{ btn.disabled=false; btn.textContent=prev; }
  }
  $("#mIzajeGuardar").addEventListener("click", guardarRecertIzaje);
  $("#mIzajeCert").addEventListener("change", function(){ var f=this.files[0]; $("#mIzajeCertStatus").textContent = f ? ("Seleccionado: "+f.name) : ""; });
  $("#mDocsCicloBtn").addEventListener("click",function(){$("#mDocsDin").scrollIntoView({behavior:"smooth",block:"nearest"});});
  $("#mHistBtn").addEventListener("click",function(){$("#mHistBox").scrollIntoView({behavior:"smooth",block:"nearest"});});
  $("#mTipoMant").addEventListener("change", actualizarFlujoMtto);
  $("#mTipoPrev").addEventListener("change", actualizarFlujoMtto);
  $("#mRepFormBtn").addEventListener("click",function(){elegirReporte("formulario");});
  $("#mRepFileBtn").addEventListener("click",function(){elegirReporte("archivo");});
  $("#mRepPhotoBtn").addEventListener("click",function(){elegirReporte("foto");});
  $("#mRepFile").addEventListener("change",function(e){procesarArchivoDraft("report",e.target.files[0],"mRepStatus");});
  $("#mRepPhoto").addEventListener("change",function(e){procesarArchivoDraft("report",e.target.files[0],"mRepStatus");});
  $("#mFallaBtn").addEventListener("click",function(){$("#mFallaFile").click();});
  $("#mNdtBtn").addEventListener("click",function(){$("#mNdtFile").click();});
  $("#mPhBtn").addEventListener("click",function(){$("#mPhFile").click();});
  $("#mFallaFile").addEventListener("change",function(e){procesarArchivoDraft("falla",e.target.files[0],"mFallaStatus");});
  $("#mNdtFile").addEventListener("change",function(e){procesarArchivoDraft("ndt",e.target.files[0],"mNdtStatus");});
  $("#mPhFile").addEventListener("change",function(e){procesarArchivoDraft("ph",e.target.files[0],"mPhStatus");});
  $("#mMantGuardar").addEventListener("click", async function(){
    if(!itemActual) return;
    if(mttoDraft.cycleCreated) { mostrarMsg("Este mantenimiento ya fue guardado. Usa los botones de documentos para reemplazar archivos.",true); return; }
    var btn=$("#mMantGuardar"), tipo=$("#mTipoMant").value, prev=$("#mTipoPrev").value;
    if(!tipo){mostrarMsg("Selecciona Correctivo o Preventivo.",false);return;}
    if(tipo==="preventivo"&&!prev){mostrarMsg("Selecciona el tipo preventivo.",false);return;}
    if(tipo==="preventivo"&&!reglaPreventiva().ok){mostrarMsg("El tipo preventivo seleccionado no aplica a la categoría.",false);return;}

    // Puede existir solo uno de los documentos. El ciclo se crea igualmente y
    // queda INCOMPLETO hasta que lleguen los faltantes.
    if(mttoDraft.reportMethod==="formulario" && !mttoDraft.formComplete){
      mostrarMsg("El Formulario en línea debe estar completamente diligenciado.",false);return;
    }
    var tieneAlgunDocumento=!!(mttoDraft.reportMethod||mttoDraft.reportFile||mttoDraft.fallaFile||mttoDraft.ndtFile||mttoDraft.phFile);
    if(!tieneAlgunDocumento){mostrarMsg("Debes anexar al menos un documento o diligenciar el formulario.",false);return;}

    var regla=tipo==="preventivo"?reglaPreventiva():{req:["reporte_mantenimiento","reporte_falla"]};
    var faltantes=regla.req.slice();
    if(mttoDraft.reportMethod==="formulario" || mttoDraft.reportFile){
      faltantes=faltantes.filter(function(x){return x!=="reporte_mantenimiento";});
    }
    if(mttoDraft.fallaFile) faltantes=faltantes.filter(function(x){return x!=="reporte_falla";});
    if(mttoDraft.ndtFile) faltantes=faltantes.filter(function(x){return x!=="ndt";});
    if(mttoDraft.phFile) faltantes=faltantes.filter(function(x){return x!=="prueba_presion";});
    var incompleto=faltantes.length>0;
    btn.disabled=true;
    try{
      var metodo=mttoDraft.reportMethod==="formulario"?"formulario":(mttoDraft.reportMethod?
        (mttoDraft.reportMethod==="foto"?"foto":"anexo") : "anexo");
      var datos={observaciones:( $("#mObs").value||"").trim(),tipo_mantenimiento:tipo,ciclo_preventivo:prev||null,
        metodo_reporte:metodo,incompleto:incompleto,documentos_faltantes:faltantes};
      var body={p_item_id:itemActual.id,p_linea_codigo:itemActual.linea_codigo,p_fecha_realizado:$("#mFecha").value||hoyISO(),p_metodo:metodo,p_datos:datos};
      var r=await fetch(URL_SB+"/rest/v1/rpc/renovar_mantenimiento",{method:"POST",headers:headers(),body:JSON.stringify(body)});
      if(!r.ok){var e=await r.json().catch(function(){return{};});throw new Error(e.message||"error");}
      var ciclo=await r.json(); cicloVigente={id:ciclo,fecha_realizado:body.p_fecha_realizado,metodo:metodo}; cicloDatos=datos;
      if(mttoDraft.reportMethod!=="formulario"&&mttoDraft.reportFile) await subirDocCiclo("reporte_mantenimiento",mttoDraft.reportFile);
      if(mttoDraft.fallaFile) await subirDocCiclo("reporte_falla",mttoDraft.fallaFile);
      if(mttoDraft.ndtFile) await subirDocCiclo("ndt",mttoDraft.ndtFile);
      if(mttoDraft.phFile) await subirDocCiclo("prueba_presion",mttoDraft.phFile);
      mttoDraft.cycleCreated=true;
      mostrarMsg(incompleto?"Mantenimiento registrado. Queda INCOMPLETO hasta cargar: "+faltantes.join(", "):"Mantenimiento registrado y documentación completa.",true);
      cargarDocsDinamicos(); cargarEstadoMant(itemActual.id); cargarHistorialItem(itemActual.id);
    }catch(e){mostrarMsg("No se pudo registrar el mantenimiento. "+(e.message||""),false);}finally{btn.disabled=false;}
  });

  function baseUniRow(it){
    it=it||{};
    var baseOpts=[{v:"",t:"— Sin base —"}].concat(bases.map(function(b){return {v:String(b.id),t:b.nombre};}));
    var uniOpts=[{v:"",t:"— Sin unidad —"}].concat(unidades.map(function(u){return {v:String(u.id),t:u.nombre};}));
    return '<div class="row2">'+campoSelect("f_base","Base", it.base_id?String(it.base_id):"", baseOpts)+campoSelect("f_uni","Unidad", it.unidad_id?String(it.unidad_id):"", uniOpts)+'</div>';
  }
  function camposEspItem(cat, it){
    it=it||{};
    if(cat==='instrumento'){
      return campoInput("f_desc","Descripción / Elemento", it.descripcion||"")+
        '<div class="row2">'+campoInput("f_subtipo","Tipo de instrumento (manómetro, spooler…)", it.subtipo||"")+campoInput("f_fab","Marca", it.fabricante||"")+'</div>'+
        '<div class="row2">'+campoInput("f_sn","S/N (serie)", it.sn||"")+campoInput("f_med","Medida / Rango", it.medida||"")+'</div>'+
        '<div class="row2">'+campoInput("f_anio","Año", it.anio||"","number")+campoSelect("f_condicion","Condición", it.condicion||"",[{v:"",t:"—"},{v:"USADO",t:"Usado"},{v:"NUEVO",t:"Nuevo"}])+'</div>';
    }
    if(cat==='izaje'){
      return campoInput("f_desc","Elemento (grillete, estrobo, eslinga…)", it.descripcion||"")+
        '<div class="row2">'+campoSelect("f_material","Material", it.material||"",[{v:"",t:"—"},{v:"ACERO",t:"Acero"},{v:"SINTÉTICA",t:"Sintética"}])+campoInput("f_subtipo","Tipo (ojo-ojo, ancla…)", it.subtipo||"")+'</div>'+
        '<div class="row2">'+campoInput("f_med","Medida", it.medida||"")+campoInput("f_fab","Marca", it.fabricante||"")+'</div>'+
        '<div class="row2">'+campoSelect("f_condicion","Condición", it.condicion||"",[{v:"",t:"—"},{v:"USADO",t:"Usado"},{v:"NUEVO",t:"Nuevo"}])+campoInput("f_anio","Año", it.anio||"","number")+'</div>';
    }
    var tipoNombre=(it.tipos_item&&it.tipos_item.nombre)||it.tipo_codigo||"";
    return (esAdmin() ? '<label>Tipo <span class="tipo-ayuda">(compartido por los códigos con las mismas 3 letras'+(it.tipo_codigo?': '+esc(it.tipo_codigo):'')+')</span><input id="f_tipo_nombre" type="text" value="'+esc(tipoNombre)+'"></label>' : '<label>Tipo <div class="ro">'+(esc(tipoNombre)||"—")+'</div></label>')+
      campoInput("f_desc","Descripción", it.descripcion||"")+
      '<div class="row2">'+campoInput("f_sn","S/N", it.sn||"")+campoInput("f_fab","Fabricante", it.fabricante||"")+'</div>'+
      '<div class="row2">'+campoInput("f_med","Medida", it.medida||"")+campoInput("f_anio","Año", it.anio||"","number")+'</div>'+
      campoInput("f_pres","Presión", it.presion||"");
  }
  function abrirNuevo(){
    modoNuevo=true; itemActual=null;
    $("#mTitulo").textContent = "Nuevo ítem";
    var _esIT=(MODULO==='it');
    $("#mSub").textContent = _esIT ? "Completa los datos del instrumento. El código es el código nuevo MF." : "Completa los datos. Para Izaje el código es el precinto (ej. LCS5257).";
    $("#mCampos").innerHTML =
      campoInput("f_codigo","Código","") +
      '<p class="sub" id="f_cod_help" style="margin:-4px 0 8px"></p>' +
      '<div class="row2">'+
        campoSelect("f_cat","Categoría", _esIT?"instrumento":"herramienta",[{v:"herramienta",t:"Herramienta"},{v:"equipo",t:"Equipo de Presión"},{v:"izaje",t:"Izaje"},{v:"instrumento",t:"Instrumentación"}])+
        campoSelect("f_estado","Estado","activo",[{v:"activo",t:"Activo"},{v:"en_mantenimiento",t:"En mantenimiento"},{v:"fuera_servicio",t:"Fuera de servicio"},{v:"inactivo",t:"Inactivo"}])+
      '</div>'+
      '<div id="mCampEsp"></div>'+
      baseUniRow(null);
    var _rn=function(){ var c=$("#f_cat").value; $("#mCampEsp").innerHTML=camposEspItem(c,null); var h=$("#f_cod_help"); if(h) h.textContent = (c==='instrumento') ? "Escribe el código nuevo MF del instrumento. Ej: IMMAN600W0051" : (c==='izaje') ? "Escribe el precinto certificador. Ej: LCS5257" : "El código define línea (2 letras) y tipo (3 letras). Ej: SLHPT140X0001"; };
    _rn();
    $("#f_cat").addEventListener("change", _rn);
    // En el módulo IT el alta es siempre de instrumentos: se fija la categoría.
    if(_esIT){ var _fc=$("#f_cat"); if(_fc){ _fc.value="instrumento"; _fc.disabled=true; } _rn(); }
    $("#mMsg").className="msg hidden";
    $("#mDescargarPDF").classList.add("hidden");
    configurarUbicacionExclusiva();
    $("#mMantBox").classList.add("hidden");
    $("#mDocsBox").classList.add("hidden");
    $("#mGuardar").classList.remove("hidden");
    $("#mAdminAcciones").classList.add("hidden");
    $("#modalBg").classList.remove("hidden");
  }

  async function agregarUnidad(){
    const nom = ($("#f_uni_nueva").value||"").trim(); if(!nom) return;
    try{
      const r=await fetch(URL_SB+"/rest/v1/unidades",{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({nombre:nom})});
      const d=await r.json(); if(!r.ok) throw new Error("");
      const nueva=d[0]; unidades.push(nueva); unidades.sort((a,b)=>a.nombre.localeCompare(b.nombre));
      const sel=$("#f_uni"); const o=document.createElement("option"); o.value=String(nueva.id); o.textContent=nueva.nombre; o.selected=true; sel.appendChild(o);
      $("#f_uni_nueva").value=""; mostrarMsg("Unidad agregada.", true);
    }catch(e){ mostrarMsg("No se pudo agregar la unidad.", false); }
  }

  function valOrNull(id){ const el=$("#"+id); if(!el) return null; const v=(el.value||"").trim(); return v===""?null:v; }

  function configurarUbicacionExclusiva(){
    const baseEl=$("#f_base"), uniEl=$("#f_uni");
    if(!baseEl || !uniEl) return;
    const aplicar=function(origen){
      if(origen==="base" && baseEl.value){
        uniEl.value=""; uniEl.disabled=true; uniEl.title="Deshabilitado porque el ítem está ubicado en una base.";
      }else if(origen==="unidad" && uniEl.value){
        baseEl.value=""; baseEl.disabled=true; baseEl.title="Deshabilitado porque el ítem está ubicado en una unidad.";
      }else if(!baseEl.value && !uniEl.value){
        baseEl.disabled=false; uniEl.disabled=false; baseEl.title=""; uniEl.title="";
      }else if(baseEl.value){
        uniEl.disabled=true; baseEl.disabled=false;
      }else if(uniEl.value){
        baseEl.disabled=true; uniEl.disabled=false;
      }
    };
    baseEl.addEventListener("change",function(){aplicar("base");});
    uniEl.addEventListener("change",function(){aplicar("unidad");});
    // Si existiera un registro antiguo con ambas ubicaciones, no permitimos seguir editándolo como doble ubicación.
    if(baseEl.value && uniEl.value){
      uniEl.value="";
    }
    aplicar(baseEl.value ? "base" : (uniEl.value ? "unidad" : ""));
  }

  async function evaluarHistorialItem(id){
    const out={ciclos:0,estaticos:0,dinamicos:0};
    try{ const r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id&item_id=eq."+encodeURIComponent(id)+"&limit=1",{headers:headers()}); if(r.ok){ const d=await r.json(); out.ciclos=d.length?1:0; } }catch(e){}
    try{ const r=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=id&item_id=eq."+encodeURIComponent(id)+"&limit=1",{headers:headers()}); if(r.ok){ const d=await r.json(); out.estaticos=d.length?1:0; } }catch(e){}
    return out;
  }
  async function darDeBajaItem(){
    if(!esAdmin() || !itemActual) return;
    const cod=itemActual.codigo||"este equipo";
    if(!(await uiConfirm("¿Dar de baja " + cod + "?\n\nLa herramienta no se eliminará. Quedará INACTIVA y conservará toda su Hoja de Vida e historial.",{ok:"Dar de baja"}))) return;
    try{
      const r=await fetch(URL_SB+"/rest/v1/items?id=eq."+encodeURIComponent(itemActual.id),{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({estado:"inactivo",base_id:null,unidad_id:null})});
      if(!r.ok){ const e=await r.json().catch(function(){return{};}); throw new Error(e.message||"No se pudo dar de baja la herramienta."); }
      const filas=await r.json().catch(function(){return[];});
      if(!filas || !filas.length) throw new Error("No se aplicó el cambio. Verifica que tu usuario tenga permisos (rol admin).");
      mostrarMsg("Herramienta dada de baja. Se conserva su historial.",true);
      setTimeout(async()=>{ $("#modalBg").classList.add("hidden"); await buscar(); },700);
    }catch(e){mostrarMsg(e.message||"No se pudo dar de baja.",false);}
  }
  async function eliminarItemDefinitivo(){
    if(!esAdmin() || !itemActual) return;
    const chk=await evaluarHistorialItem(itemActual.id);
    if(chk.ciclos||chk.estaticos){
      await uiAlert("Esta herramienta tiene historial o documentos asociados.\n\nNo se permite el borrado definitivo. Utiliza 'Dar de baja' para conservar la trazabilidad.");
      return;
    }
    const cod=itemActual.codigo||"este equipo";
    if(!(await uiConfirm("ELIMINACIÓN DEFINITIVA\n\n¿Eliminar " + cod + " de la base de datos?\n\nEsta acción no debe usarse si necesitas conservar trazabilidad.",{ok:"Eliminar",peligro:true}))) return;
    try{
      const r=await fetch(URL_SB+"/rest/v1/items?id=eq."+encodeURIComponent(itemActual.id),{method:"DELETE",headers:headers({"Prefer":"return=representation"})});
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"No se pudo eliminar."); }
      const filas=await r.json().catch(function(){return[];});
      if(!filas || !filas.length) throw new Error("No se eliminó ninguna fila. Verifica permisos (rol admin) o si existen registros relacionados que lo impiden.");
      $("#modalBg").classList.add("hidden"); await buscar(); mostrarMsg("Herramienta eliminada.",true);
    }catch(e){await uiAlert("No se pudo eliminar definitivamente. Si existe cualquier relación en la base de datos, utiliza 'Dar de baja'.\n\n"+(e.message||""));}
  }

  async function guardar(){
    const btn=$("#mGuardar"); btn.disabled=true;
    const baseVal=valOrNull("f_base");
    const uniVal=valOrNull("f_uni");
    if(baseVal && uniVal){
      mostrarMsg("Una herramienta no puede estar ubicada simultáneamente en una Base y una Unidad.", false);
      btn.disabled=false; return;
    }
    const cuerpo={
      descripcion: valOrNull("f_desc"), sn: valOrNull("f_sn"), fabricante: valOrNull("f_fab"),
      medida: valOrNull("f_med"), anio: valOrNull("f_anio")?parseInt(valOrNull("f_anio")):null,
      presion: valOrNull("f_pres"), categoria_id: $("#f_cat").value, estado: $("#f_estado").value,
      material: valOrNull("f_material"), subtipo: valOrNull("f_subtipo"), condicion: valOrNull("f_condicion"),
      base_id: baseVal?parseInt(baseVal):null,
      unidad_id: uniVal?parseInt(uniVal):null
    };
    try{
      if(modoNuevo){
        const codigo=(valOrNull("f_codigo")||"").toUpperCase();
        if(cuerpo.categoria_id==="izaje" || cuerpo.categoria_id==="instrumento"){
          if(!codigo){ mostrarMsg("El código es obligatorio.", false); btn.disabled=false; return; }
          cuerpo.codigo=codigo; cuerpo.linea_codigo=null; cuerpo.tipo_codigo=null;
          if(cuerpo.categoria_id==="izaje") cuerpo.cvtools="CVTOOLS2";
          const r=await fetch(URL_SB+"/rest/v1/items",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify(cuerpo)});
          if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"error"); }
        }else{
          if(codigo.length<9){ mostrarMsg("El código debe tener al menos 9 caracteres.", false); btn.disabled=false; return; }
          const linea=codigo.slice(0,2), tipo=codigo.slice(2,5);
          if(!LINEAS_OK.includes(linea)){ mostrarMsg("La línea "+linea+" no está habilitada.", false); btn.disabled=false; return; }
          const tipoNombre=(valOrNull("f_tipo_nombre")||tipo).trim();
          const existente=await fetch(URL_SB+"/rest/v1/tipos_item?select=codigo_tipo,nombre,categoria_id&codigo_tipo=eq."+encodeURIComponent(tipo)+"&limit=1",{headers:headers()});
          const tiposExistentes=existente.ok?(await existente.json()||[]):[];
          if(!tiposExistentes.length){
            const rt=await fetch(URL_SB+"/rest/v1/tipos_item",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({codigo_tipo:tipo,nombre:tipoNombre,categoria_id:cuerpo.categoria_id})});
            if(!rt.ok){ const e=await rt.json().catch(()=>({})); throw new Error(e.message||"No se pudo crear el tipo"); }
          }
          cuerpo.codigo=codigo; cuerpo.linea_codigo=linea; cuerpo.tipo_codigo=tipo; cuerpo.cvtools="CVTOOLS2";
          const r=await fetch(URL_SB+"/rest/v1/items",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify(cuerpo)});
          if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"error"); }
        }
      }else{
        const r=await fetch(URL_SB+"/rest/v1/items?id=eq."+itemActual.id,{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(cuerpo)});
        if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"error"); }
        const filasEd=await r.json().catch(function(){return[];});
        if(!filasEd || !filasEd.length) throw new Error("No se aplicaron los cambios. Verifica tus permisos (rol admin).");
        const tipoNombre=(valOrNull("f_tipo_nombre")||"").trim();
        const tipoActual=String(itemActual.tipo_codigo||"").toUpperCase();
        if(tipoNombre && tipoActual){
          const rt=await fetch(URL_SB+"/rest/v1/tipos_item?codigo_tipo=eq."+encodeURIComponent(tipoActual),{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({nombre:tipoNombre})});
          if(!rt.ok){ const e=await rt.json().catch(()=>({})); throw new Error(e.message||"No se pudo actualizar el tipo"); }
        }
      }
      mostrarMsg("Guardado correctamente.", true);
      setTimeout(async ()=>{ $("#modalBg").classList.add("hidden"); await buscar(); }, 700);
    }catch(e){ mostrarMsg("No se pudo guardar. "+(e.message&&e.message.includes("duplicate")?"Ese código ya existe.":""), false); }
    finally{ btn.disabled=false; }
  }
  function mostrarMsg(t, ok){ const m=$("#mMsg"); m.textContent=t; m.className="msg "+(ok?"ok":"bad"); }

  function ubicAdminMsg(t,ok){ const m=$("#ubicMsg"); m.textContent=t; m.className="msg "+(ok?"ok":"bad"); m.classList.remove("hidden"); }
  async function cargarUbicAdmin(){
    const tipo=$("#ubicTipo").value; const tabla=tipo==="base"?"bases":"unidades"; const arr=tipo==="base"?bases:unidades;
    const cont=$("#ubicLista"); cont.innerHTML='<div class="loc-empty">Consultando…</div>';
    try{
      const r=await fetch(URL_SB+"/rest/v1/"+tabla+"?select=id,nombre&order=nombre",{headers:headers()});
      const data=await r.json(); if(!r.ok) throw new Error("No se pudieron consultar las ubicaciones.");
      const rows=await Promise.all((data||[]).map(async function(x){
        const campo=tipo==="base"?"base_id":"unidad_id";
        let n=0; try{const q=await fetch(URL_SB+"/rest/v1/items?select=id&"+campo+"=eq."+x.id+"&limit=1",{headers:headers({"Prefer":"count=exact"})}); const cr=q.headers.get("content-range"); if(cr&&cr.includes("/")){n=parseInt(cr.split("/")[1])||0;} else {const d=await q.json();n=(d||[]).length;}}catch(e){}
        return {x:x,n:n};
      }));
      cont.innerHTML=rows.map(function(r){
        // El botón no se bloquea por el contador visual: la validación real se hace
        // nuevamente al pulsar Eliminar. Así evitamos falsos positivos por caché,
        // conteos desactualizados o respuestas sin Content-Range.
        const tiene=r.n>0;
        return '<div class="loc-row"><div><div class="loc-name">'+esc(r.x.nombre)+'</div><div class="loc-count">'+r.n+' herramienta(s) asignada(s)</div></div><button class="btn2" type="button" data-rename-ubic="'+r.x.id+'">Renombrar</button><button class="btn-danger'+(tiene?'':' loc-danger')+'" type="button" data-del-ubic="'+r.x.id+'">'+ (tiene?'Verificar y eliminar':'Eliminar') +'</button></div>';
      }).join("") || '<div class="loc-empty">No hay ubicaciones.</div>';
      cont.querySelectorAll("[data-del-ubic]").forEach(function(b){b.addEventListener("click",function(){eliminarUbicacion(tipo,parseInt(b.dataset.delUbic,10));});});
      cont.querySelectorAll("[data-rename-ubic]").forEach(function(b){b.addEventListener("click",function(){renombrarUbicacion(tipo,parseInt(b.dataset.renameUbic,10));});});
    }catch(e){cont.innerHTML='<div class="loc-empty">No se pudo cargar la lista.</div>';}
  }
  async function renombrarUbicacion(tipo,id){
    if(!esAdmin()) return; const tabla=tipo==="base"?"bases":"unidades"; const arr=tipo==="base"?bases:unidades; const actual=(arr.find(x=>x.id===id)||{}).nombre||"";
    const nom=await uiPrompt("Nuevo nombre de la ubicación:",actual); if(nom===null) return; const v=nom.trim(); if(!v) return;
    try{const r=await fetch(URL_SB+"/rest/v1/"+tabla+"?id=eq."+id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({nombre:v})});if(!r.ok)throw 0; await cargarBasesUnidades(); await cargarUbicAdmin(); ubicAdminMsg("Ubicación actualizada.",true);}catch(e){ubicAdminMsg("No se pudo renombrar la ubicación.",false);}
  }
  async function eliminarUbicacion(tipo,id){
    if(!esAdmin()) return; const tabla=tipo==="base"?"bases":"unidades"; const campo=tipo==="base"?"base_id":"unidad_id";
    try{
      // Validación definitiva: consultar los IDs sin depender de Content-Range.
      // Esto evita que una ubicación vacía aparezca erróneamente como ocupada.
      const q=await fetch(URL_SB+"/rest/v1/items?select=id&"+campo+"=eq."+encodeURIComponent(id),{headers:headers()});
      const d=await q.json();
      if(!q.ok) throw new Error("No se pudo verificar si la ubicación está vacía.");
      if(Array.isArray(d) && d.length){
        await uiAlert("No se puede eliminar: todavía hay "+d.length+" herramienta(s) asignada(s) a esta ubicación.");
        await cargarUbicAdmin();
        return;
      }
      const nombre=((tipo==="base"?bases:unidades).find(x=>x.id===id)||{}).nombre||"la ubicación";
      if(!(await uiConfirm("¿Eliminar "+nombre+"?\n\nLa ubicación está vacía. Las herramientas e historiales no serán eliminados.",{ok:"Eliminar",peligro:true}))) return;
      const r=await fetch(URL_SB+"/rest/v1/"+tabla+"?id=eq."+id,{method:"DELETE",headers:headers({"Prefer":"return=minimal"})});if(!r.ok)throw 0;
      await cargarBasesUnidades(); await cargarUbicAdmin(); ubicAdminMsg("Ubicación eliminada.",true); await buscar();
    }catch(e){ubicAdminMsg("No se pudo eliminar la ubicación.",false);}
  }
  function abrirUbicAdmin(){if(!esAdmin())return;$("#ubicMsg").className="msg hidden";$("#ubicNueva").value="";$("#ubicAdminBg").classList.remove("hidden");cargarUbicAdmin();}
  async function agregarUbicAdmin(){
    if(!esAdmin())return; const tipo=$("#ubicTipo").value; const tabla=tipo==="base"?"bases":"unidades"; const v=$("#ubicNueva").value.trim(); if(!v){ubicAdminMsg("Escribe un nombre.",false);return;}
    try{const r=await fetch(URL_SB+"/rest/v1/"+tabla,{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({nombre:v})});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||"");}$("#ubicNueva").value="";await cargarBasesUnidades();await cargarUbicAdmin();ubicAdminMsg("Ubicación agregada.",true);}catch(e){ubicAdminMsg("No se pudo agregar. Puede que ya exista.",false);}
  }

  // ---- Navegación interna app ----
  // ===== Router del shell (hash: #/mtto-operativo/:panel) =====
  const PANELES = {
    resumen:      {el:"vResumen", tit:"Resumen",      sub:"ESTADO DE LA OPERACION",    load:function(){ cargarResumen(); }},
    inventario:   {el:"vInv",     tit:"Inventario",   sub:"INVENTARIO DE ITEMS",       load:function(){ buscar(); cargarChipsInv(); }},
    movilizacion: {el:"vMov",     tit:"Movilizacion", sub:"DESPACHOS Y RETORNOS",      load:function(){ prepararMov(); cargarHistorial(); cargarMovKpis(); }},
    dashboard:    {el:"panel",    tit:"Dashboard",    sub:"INDICADORES",               load:function(){ cargarDashboard(); }},
    fabricantes:  {el:"vFab",     tit:"Fabricantes",  sub:"DOCUMENTOS POR FABRICANTE", load:function(){ prepararFab(); }}
  };
  const ORDEN_PANELES = ["resumen","inventario","movilizacion","dashboard","fabricantes"];
  function panelDeHash(){ var m=(location.hash||"").match(/mtto-operativo\/([a-z]+)/i); var p=m?m[1].toLowerCase():""; return PANELES[p]?p:"resumen"; }
  function irPanel(p){ if(!PANELES[p]) p="resumen"; location.hash="#/mtto-operativo/"+p; }
  function setAvatar(){
    var n=($("#nombre").textContent||"").trim(); var ini="--";
    if(n){ var ps=n.split(/\s+/); ini=((ps[0]&&ps[0][0])||"")+((ps[1]&&ps[1][0])||""); ini=ini.toUpperCase()||"--"; }
    var a=$("#sideAva"); if(a) a.textContent=ini;
    var ta=$("#tbAva"); if(ta) ta.textContent=ini;
    var mn=$("#tbMenuNom"); if(mn) mn.textContent=n||"";
    var mr=$("#tbMenuRol"); if(mr){ var rl=$("#rol"); mr.textContent=(rl?rl.textContent:"")||""; }
  }
  // Opciones originales del filtro "Categoría" (modo Mtto Operativo).
  var _CAT_OPCIONES_MTTO='<option value="">Todas las categorías</option><option value="equipo">Equipo de Presión</option><option value="herramienta">Herramienta</option><option value="izaje">Izaje</option>';
  var _tiposITCache=null;
  // En IT, el filtro "Categoría" se reutiliza como "Tipo de instrumento" (subtipo). En Mtto vuelve a lo original.
  async function configurarFiltroTipoInstrumento(){
    var sel=$("#fCategoria"); if(!sel) return;
    if(MODULO!=='it'){
      if(sel.getAttribute("data-modo")!=="mtto"){ sel.innerHTML=_CAT_OPCIONES_MTTO; sel.value=""; sel.title="Categoría"; sel.setAttribute("data-modo","mtto"); }
      return;
    }
    sel.title="Tipo de instrumento";
    if(sel.getAttribute("data-modo")==="it") return; // ya poblado
    // De una vez (sincrono) dejamos el filtro en "Todos los tipos" para que buscar() no use un valor viejo del modo Mtto.
    sel.innerHTML='<option value="">Todos los tipos</option>'; sel.value=""; sel.setAttribute("data-modo","it");
    if(!_tiposITCache){
      try{
        var r=await fetch(URL_SB+"/rest/v1/items?select=subtipo&categoria_id=eq.instrumento&limit=5000",{headers:headers()});
        var d=r.ok?await r.json():[];
        var set={}; d.forEach(function(x){ var k=(x.subtipo&&x.subtipo.trim()); if(k) set[k]=1; });
        _tiposITCache=Object.keys(set).sort(function(a,b){ return a.localeCompare(b,'es'); });
      }catch(e){ _tiposITCache=[]; }
    }
    sel.innerHTML='<option value="">Todos los tipos</option>'+_tiposITCache.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join("");
  }
  function renderPanel(){
    var p=panelDeHash();
    ORDEN_PANELES.forEach(function(k){ var d=$("#"+PANELES[k].el); if(d) d.classList.toggle("hidden", k!==p); });
    document.querySelectorAll("[data-panel]").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-panel")===p); });
    $("#tbTitulo").textContent = (MODULO==='it' ? "Instrumentación · " : "") + PANELES[p].tit;
    $("#tbSub").textContent = PANELES[p].sub;
    var esInv=(p==="inventario");
    $("#q").classList.toggle("hidden", !esInv);
    $("#nuevo").classList.toggle("hidden", !(esInv && esAdmin()));
    if(esInv){
      // En IT no hay lineas: se oculta ese filtro. El desplegable "Categoria" se reutiliza como "Tipo de instrumento".
      var _fl=$("#fLinea"); if(_fl) _fl.classList.toggle("hidden", MODULO==='it');
      // El filtro "Tipo" (por tipo_codigo) no aplica a instrumentos: se oculta en IT.
      var _ft=$("#fTipo"); if(_ft){ _ft.classList.toggle("hidden", MODULO==='it'); _ft.setAttribute("placeholder", "Tipo de herramienta…"); }
      configurarFiltroTipoInstrumento();
    }
    $("#btnSincNdt").classList.toggle("hidden", !(p==="resumen" && esAdmin()));
    $("#btnSincPh").classList.toggle("hidden", !(p==="resumen" && esAdmin()));
    $("#btnSincCoc").classList.toggle("hidden", !(p==="resumen" && esAdmin()));
    var _bind=$("#btnIndIT"); if(_bind) _bind.classList.toggle("hidden", !(MODULO==='it' && p==="resumen"));
    setAvatar();
    try{ PANELES[p].load(); }catch(e){}
  }
  function entrarApp(){
    if(MODULO!=='mtto'){ MODULO='mtto'; fabTree=null; }
    mostrarPantalla("app");
    if(!/mtto-operativo/i.test(location.hash)){ location.hash="#/mtto-operativo/resumen"; }
    renderPanel();
  }
  function entrarIT(){
    if(MODULO!=='it'){ MODULO='it'; fabTree=null; }
    mostrarPantalla("app");
    location.hash="#/mtto-operativo/inventario";
    renderPanel();
  }
  // Modulo Procedimientos Operativos: pantalla propia, reusa la vista vProc.
  function entrarPO(){
    var mount=$("#procMount"), v=$("#vProc");
    if(mount && v && v.parentNode!==mount){ mount.appendChild(v); }
    if(v) v.classList.remove("hidden");
    var hn=$("#hNombre"), hr=$("#hRol");
    if($("#pNombre")) $("#pNombre").textContent = hn?hn.textContent:"";
    if($("#pRol")){ $("#pRol").textContent = hr?hr.textContent:""; $("#pRol").className = hr?hr.className:"rol"; }
    mostrarPantalla("appProc");
    cargarProcedimientos();
  }
  // ===== Panel Resumen (Paso 2) =====
  let _rsBound=false;
  function bindResumen(){
    if(_rsBound) return; _rsBound=true;
    $("#rsBandaBtn").addEventListener("click", function(){ irPanel("inventario"); });
    $("#rsVerInv").addEventListener("click", function(){ irPanel("inventario"); });
    $("#rsRegistrar").addEventListener("click", function(){ irPanel("inventario"); });
    document.querySelectorAll("#vResumen [data-goto]").forEach(function(b){ b.addEventListener("click", function(){ irPanel(b.getAttribute("data-goto")); }); });
  }
  async function contarRest(tabla, filtro){
    // MIGRADO a la capa de datos (db.js). Antes: fetch(URL_SB + "/rest/v1/…" HEAD count=exact).
    // DB.count construye la misma petición (HEAD · select=id · Prefer:count=exact) en un solo lugar.
    try{ return await DB.count(tabla, { filters: filtro ? filtro.split("&") : [] }); }
    catch(e){ return 0; }
  }
  // Cuenta ciclos_mantenimiento respetando el modulo activo.
  // En modo 'it' hace join items!inner y filtra por categoria=instrumento; en 'mtto' cuenta todos.
  async function contarCiclos(cond){
    var sel = (MODULO==='it') ? "id,items!inner(id)" : "id";
    var extra = (MODULO==='it') ? "&items.categoria_id=eq.instrumento" : "";
    try{
      var u=URL_SB+"/rest/v1/ciclos_mantenimiento?select="+sel+"&"+cond+extra;
      var r=await fetch(u,{method:"HEAD",headers:headers({"Prefer":"count=exact"})});
      var cr=r.headers.get("content-range")||"";
      return cr.includes("/") ? (parseInt(cr.split("/")[1],10)||0) : 0;
    }catch(e){ return 0; }
  }
  // Filtro de items segun modulo: 'it' -> solo instrumentos; 'mtto' -> lineas validas (sin izaje, como el original).
  function scopeItemsMod(){ return (MODULO==='it') ? "categoria_id=eq.instrumento" : LINEAS_IN; }
  const LINEAS_IN = "linea_codigo=in.(EL,EP,FB,SL,SW,WL,WS,WT)";
  async function cargarResumen(){
    bindResumen();
    var meses=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
    var f=new Date();
    $("#rsBandaSobre").textContent = "TURNO DIURNO · "+f.getDate()+" "+meses[f.getMonth()]+" · 06:00–18:00";
    var hoy=new Date(); hoy.setHours(0,0,0,0);
    var hoyISOs=hoy.toISOString().slice(0,10);
    var d15=new Date(hoy.getTime()+15*86400000).toISOString().slice(0,10);
    var esIT=(MODULO==='it');
    var scope=scopeItemsMod();
    // conteos reales (ligeros, HEAD). contarCiclos ya respeta el modulo.
    var vencidos = await contarCiclos("vigente=eq.true&fecha_vencimiento=lt."+hoyISOs);
    var prox15   = await contarCiclos("vigente=eq.true&fecha_vencimiento=gte."+hoyISOs+"&fecha_vencimiento=lte."+d15);
    var enCampo  = await contarRest("items","unidad_id=not.is.null&"+scope);
    var total    = await contarRest("items",scope);
    var fuera    = await contarRest("items","estado=eq.fuera_servicio&"+scope);
    var disp     = total ? Math.round((total-fuera)/total*1000)/10 : 0;
    // banda de estado segun estado real
    var banda=$("#rsBanda");
    var sust=esIT?"instrumento":"equipo";
    if(vencidos>0){
      banda.classList.remove("calm");
      $("#rsBandaTit").textContent = vencidos+" "+sust+(vencidos>1?"s":"")+" requiere"+(vencidos>1?"n":"")+" acción hoy";
      $("#rsBandaBtn").classList.remove("hidden");
    } else {
      banda.classList.add("calm");
      $("#rsBandaTit").textContent = esIT ? "Sin calibraciones/verificaciones vencidas hoy" : "Sin mantenimientos vencidos hoy";
      $("#rsBandaBtn").classList.add("hidden");
    }
    // KPIs
    var kpis=[
      {n:vencidos, t:esIT?"VENCIDOS":"MTTO VENCIDO", crit:true},
      {n:prox15, t:"PRÓXIMOS 15 D"},
      {n:enCampo, t:"EN CAMPO"},
      {n:total.toLocaleString("es-CO"), t:esIT?"INSTRUMENTOS":"ÍTEMS EN INVENTARIO"},
      {n:disp.toLocaleString("es-CO")+"%", t:"DISPONIBILIDAD"}
    ];
    $("#rsKpis").innerHTML = kpis.map(function(k){
      return '<div class="rs-kpi'+(k.crit?" crit":"")+'"><div class="rs-kpi-n">'+k.n+'</div><div class="rs-kpi-t">'+k.t+'</div></div>';
    }).join("");
    cargarResumenProximos(hoy);
    cargarResumenMov();
  }
  async function cargarResumenProximos(hoy){
    try{
      var join=(MODULO==='it')?"items!inner":"items";
      var extra=(MODULO==='it')?"&items.categoria_id=eq.instrumento":"";
      var sel=join+"(codigo,descripcion,categoria_id,unidades(nombre),bases(nombre)),fecha_vencimiento";
      var r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select="+sel+"&vigente=eq.true"+extra+"&order=fecha_vencimiento.asc&limit=6",{headers:headers()});
      var d=r.ok?await r.json():[];
      if(!d.length){ $("#rsProx").innerHTML='<div class="rs-empty">Sin mantenimientos programados.</div>'; $("#rsProxPie").textContent=""; return; }
      $("#rsProx").innerHTML = d.map(function(c){
        var it=c.items||{};
        var pozo=(it.unidades&&it.unidades.nombre)||(it.bases&&it.bases.nombre)||"—";
        var dias=Math.round((new Date(c.fecha_vencimiento)-hoy)/86400000);
        var crit=dias<=avisoDias(it.categoria_id||"");
        var etq=(dias<0?("VENC "+Math.abs(dias)+"D"):(dias+"D"));
        return '<div class="rs-prox-row">'+
          '<span class="rs-dot'+(crit?" crit":"")+'"></span>'+
          '<span class="rs-prox-cod">'+esc(it.codigo||"—")+'</span>'+
          '<span class="rs-prox-nom">'+esc(it.descripcion||"")+'</span>'+
          '<span class="rs-prox-pozo">'+esc(pozo)+'</span>'+
          '<span class="rs-dias'+(crit?" crit":"")+'">'+etq+'</span></div>';
      }).join("");
      $("#rsProxPie").textContent = "Los "+d.length+" mantenimientos con vencimiento más próximo.";
    }catch(e){ $("#rsProx").innerHTML='<div class="rs-empty">No se pudo cargar.</div>'; $("#rsProxPie").textContent=""; }
  }
  async function cargarResumenMov(){
    try{
      var r=await fetch(URL_SB+"/rest/v1/rpc/historial_movimientos",{method:"POST",headers:headers(),body:JSON.stringify({p_item_id:null,p_dias:30,p_modulo:MODULO})});
      var d=r.ok?await r.json():[];
      if(!d.length){ $("#rsMov").innerHTML='<div class="rs-empty">Sin movimientos recientes.</div>'; return; }
      var mapa={}; d.forEach(function(m){ var dest=(m.destino||"—"); mapa[dest]=(mapa[dest]||0)+1; });
      var arr=Object.keys(mapa).map(function(k){ return {dest:k,n:mapa[k]}; }).sort(function(a,b){ return b.n-a.n; }).slice(0,5);
      $("#rsMov").innerHTML = arr.map(function(x){
        return '<div class="rs-mov-row"><span class="rs-mov-dot"></span><span class="rs-mov-dest">'+esc(x.dest)+'</span><span class="rs-mov-cont">'+x.n+' &iacute;tem'+(x.n>1?"s":"")+'</span></div>';
      }).join("");
    }catch(e){ $("#rsMov").innerHTML='<div class="rs-empty">No se pudo cargar.</div>'; }
  }
  window.addEventListener("hashchange", function(){ if(!$("#app").classList.contains("hidden")) renderPanel(); });
  document.querySelectorAll("[data-panel]").forEach(function(b){ b.addEventListener("click", function(){ irPanel(b.getAttribute("data-panel")); }); });
  $("#campana").addEventListener("click", function(){ irPanel("dashboard"); });
  $("#btnSincNdt").addEventListener("click", sincronizarNdt);
  $("#btnSincPh").addEventListener("click", sincronizarPh);
  $("#btnSincCoc").addEventListener("click", sincronizarCoc);
  (function(){ var b=$("#btnIndIT"); if(b) b.addEventListener("click", abrirIndicadoresIT);
    var c=$("#indCerrar"); if(c) c.addEventListener("click", function(){ $("#modalInd").classList.add("hidden"); });
    var g=$("#indGenerar"); if(g) g.addEventListener("click", generarIndicadoresIT); })();

  // ---- Movilizacion masiva ----
  let movBulkItems=[];
  let movBulkDestinosCargados=false;
  function movBulkMsg(t,ok){ const m=$("#movBulkMsg"); if(!m) return; m.textContent=t; m.className="msg "+(ok?"ok":"bad"); }
  function movBulkUbicacion(x){ return (x.bases&&x.bases.nombre)||(x.unidades&&x.unidades.nombre)||"Sin ubicación"; }
  function poblarMovBulkDestinos(){
    if(movBulkDestinosCargados) return;
    function llenar(sel){
      if(!sel) return;
      if(bases&&bases.length){ const og=document.createElement("optgroup"); og.label="Bases"; bases.forEach(function(b){ const o=document.createElement("option"); o.value="base:"+b.id; o.textContent=b.nombre; og.appendChild(o); }); sel.appendChild(og); }
      if(unidades&&unidades.length){ const og=document.createElement("optgroup"); og.label="Unidades"; unidades.forEach(function(u){ const o=document.createElement("option"); o.value="uni:"+u.id; o.textContent=u.nombre; og.appendChild(o); }); sel.appendChild(og); }
    }
    llenar($("#movBulkDestino"));
    llenar($("#movBulkOrigen"));
    movBulkDestinosCargados=true;
  }
  async function agregarOrigenCompleto(){
    const val=$("#movBulkOrigen").value; if(!val){ $("#movBulkOrigenInfo").textContent="Elige una base o unidad."; return; }
    const opt=$("#movBulkOrigen").selectedOptions[0];
    const nom=opt?opt.textContent:"origen";
    const btn=$("#movBulkAgregarOrigen"); const txtPrev=btn.textContent; btn.disabled=true; btn.textContent="Cargando…";
    var _sust=(MODULO==='it')?"instrumento":"herramienta";
    $("#movBulkOrigenInfo").textContent="Buscando "+_sust+"s en "+nom+"…";
    try{
      let filtro=""; if(val.indexOf("base:")===0) filtro="base_id=eq."+parseInt(val.slice(5)); else if(val.indexOf("uni:")===0) filtro="unidad_id=eq."+parseInt(val.slice(4));
      if(MODULO==='it') filtro+="&categoria_id=eq.instrumento";
      const url=URL_SB+"/rest/v1/items?select=id,codigo,descripcion,base_id,unidad_id,bases(nombre),unidades(nombre)&"+filtro+"&order=codigo&limit=2000";
      const r=await fetch(url,{headers:headers()});
      const d=r.ok?(await r.json()):[];
      if(!d.length){ $("#movBulkOrigenInfo").textContent="No hay "+_sust+"s en "+nom+"."; return; }
      const antes=movBulkItems.length;
      d.forEach(function(x){ agregarMovBulk(x); });
      const nuevas=movBulkItems.length-antes;
      $("#movBulkOrigenInfo").textContent="Se agregaron "+nuevas+" de "+d.length+" "+_sust+(d.length===1?"":"s")+" de "+nom+(nuevas<d.length?" (el resto ya estaba en la lista).":".");
      $("#movBulkOrigen").value="";
    }catch(e){ $("#movBulkOrigenInfo").textContent="No se pudo cargar el origen."; }
    finally{ btn.disabled=false; btn.textContent=txtPrev; }
  }
  function renderMovBulk(){
    const box=$("#movBulkLista");
    if(!movBulkItems.length){ box.innerHTML='<div class="mv-bulk-empty">Aún no has agregado herramientas.</div>'; }
    else box.innerHTML=movBulkItems.map(function(x){
      return '<div class="mv-bulk-row"><div class="mv-bulk-cod">'+codHTML(x.codigo)+'</div><div class="mv-bulk-desc">'+esc(x.descripcion||"Sin descripción")+'</div><div class="mv-bulk-ubi">Origen: '+esc(movBulkUbicacion(x))+'</div><button class="mv-bulk-remove" type="button" data-bulk-remove="'+esc(String(x.id))+'" title="Quitar">×</button></div>';
    }).join("");
    box.querySelectorAll("[data-bulk-remove]").forEach(function(b){ b.addEventListener("click",function(){ const id=String(b.getAttribute("data-bulk-remove")); movBulkItems=movBulkItems.filter(function(x){return String(x.id)!==id;}); renderMovBulk(); actualizarMovBulkEstado(); }); });
    actualizarMovBulkEstado();
  }
  function actualizarMovBulkEstado(){
    const dest=$("#movBulkDestino").value;
    const btn=$("#movBulkEjecutar");
    btn.disabled=!(movBulkItems.length&&dest);
    const txt=movBulkItems.length?(movBulkItems.length+" herramienta"+(movBulkItems.length===1?"":"s")+" seleccionada"+(movBulkItems.length===1?"":"s")+"."):"Selecciona una o más herramientas";
    $("#movBulkResumen").textContent=dest?txt+" Todas se moverán al destino seleccionado.":txt+" y luego un destino único.";
  }
  async function buscarMovBulk(){
    const q=($("#movBulkCodigo").value||"").trim(); if(!q) return;
    $("#movBulkInfo").textContent="Buscando…";
    try{
      const enc=encodeURIComponent(q);
      const url=URL_SB+"/rest/v1/items?select=id,codigo,descripcion,base_id,unidad_id,bases(nombre),unidades(nombre)&or=(codigo.ilike.*"+enc+"*,descripcion.ilike.*"+enc+"*)"+(MODULO==='it'?"&categoria_id=eq.instrumento":"")+"&limit=8";
      const r=await fetch(url,{headers:headers()});
      const d=r.ok?(await r.json()):[];
      if(!d.length){ $("#movBulkInfo").textContent="No se encontraron herramientas."; return; }
      // Si hay coincidencia exacta de código, usarla directamente; si no, mostrar las coincidencias para elegir.
      const exact=d.find(function(x){return String(x.codigo||"").toUpperCase()===q.toUpperCase();});
      if(exact){ agregarMovBulk(exact); $("#movBulkInfo").textContent="Agregado: "+exact.codigo; $("#movBulkCodigo").value=""; return; }
      const ya=new Set(movBulkItems.map(function(x){return String(x.id);}));
      const disponibles=d.filter(function(x){return !ya.has(String(x.id));});
      $("#movBulkInfo").innerHTML=disponibles.map(function(x){ return '<button type="button" class="mv-btn2" data-bulk-add="'+esc(String(x.id))+'" style="margin:4px 4px 0 0">'+esc(x.codigo||"")+" · "+esc(x.descripcion||"")+'</button>'; }).join("")||"Todos esos resultados ya están seleccionados.";
      disponibles.forEach(function(x){ const b=document.querySelector('[data-bulk-add="'+String(x.id).replace(/"/g,'\\"')+'"]'); if(b) b.addEventListener("click",function(){ agregarMovBulk(x); $("#movBulkInfo").textContent="Agregado: "+(x.codigo||""); }); });
    }catch(e){ $("#movBulkInfo").textContent="No se pudo buscar."; }
  }
  function agregarMovBulk(x){
    if(!x||movBulkItems.some(function(y){return String(y.id)===String(x.id);})) return;
    movBulkItems.push(x); renderMovBulk(); actualizarMovBulkEstado();
  }
  function abrirMovBulk(){
    movBulkItems=[]; $("#movBulkCodigo").value=""; $("#movBulkInfo").textContent=""; $("#movBulkDestino").value=""; $("#movBulkOrigen").value=""; $("#movBulkOrigenInfo").textContent=""; movBulkMsg("",true); $("#movBulkMsg").classList.add("hidden");
    poblarMovBulkDestinos(); renderMovBulk(); $("#movMasivoBg").classList.remove("hidden"); setTimeout(function(){ $("#movBulkCodigo").focus(); },80);
  }
  function cerrarMovBulk(){ $("#movMasivoBg").classList.add("hidden"); }
  function confirmarMovBulk(){
    const val=$("#movBulkDestino").value; if(!movBulkItems.length||!val) return;
    const destOpt=$("#movBulkDestino").selectedOptions[0];
    const dest=destOpt?destOpt.textContent:"destino seleccionado";
    const repetidos=movBulkItems.filter(function(x){return movBulkUbicacion(x)===dest;});
    let html='<p>Vas a mover <strong>'+movBulkItems.length+' herramienta'+(movBulkItems.length===1?'':'s')+'</strong> a <strong>'+esc(dest)+'</strong>.</p>';
    if(repetidos.length) html+='<p>⚠️ '+repetidos.length+' ya aparece'+(repetidos.length===1?'':'n')+' en ese destino y se omitirá'+(repetidos.length===1?'':'n')+'.</p>';
    html+='<ul>'+movBulkItems.map(function(x){return '<li>'+esc(x.codigo||"")+': '+esc(movBulkUbicacion(x))+' → '+esc(dest)+'</li>';}).join("")+'</ul>';
    $("#movBulkConfirmText").innerHTML=html; $("#movBulkConfirmBg").classList.remove("hidden");
  }
  async function ejecutarMovBulk(){
    const val=$("#movBulkDestino").value; if(!val) return;
    let p_base=null,p_uni=null; if(val.indexOf("base:")===0) p_base=parseInt(val.slice(5)); else if(val.indexOf("uni:")===0) p_uni=parseInt(val.slice(4));
    const btn=$("#movBulkConfirmYes"); btn.disabled=true; btn.textContent="Movilizando…";
    let ok=0, fallos=[];
    for(const x of movBulkItems){
      if((p_base&&String(x.base_id)===String(p_base))||(p_uni&&String(x.unidad_id)===String(p_uni))){ ok++; continue; }
      try{
        const r=await fetch(URL_SB+"/rest/v1/rpc/mover_item",{method:"POST",headers:headers(),body:JSON.stringify({p_item_id:x.id,p_base_id:p_base,p_unidad_id:p_uni})});
        if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"error"); }
        ok++;
      }catch(e){ fallos.push((x.codigo||x.id)+": "+(e.message||"error")); }
    }
    $("#movBulkConfirmBg").classList.add("hidden"); btn.disabled=false; btn.textContent="Confirmar movilización";
    if(fallos.length){ movBulkMsg("Se movilizaron "+ok+" de "+movBulkItems.length+". Fallos: "+fallos.join(" | "),false); $("#movBulkMsg").classList.remove("hidden"); }
    else { movBulkMsg("Movilización masiva registrada: "+ok+" herramienta"+(ok===1?"":"s")+".",true); $("#movBulkMsg").classList.remove("hidden"); movBulkItems=[]; renderMovBulk(); $("#movBulkDestino").value=""; }
    cargarHistorial(); cargarMovKpis();
  }
  document.getElementById("movMasivoBtn").addEventListener("click", abrirMovBulk);
  document.getElementById("movMasivoX").addEventListener("click", cerrarMovBulk);
  document.getElementById("movBulkCancelar").addEventListener("click", cerrarMovBulk);
  document.getElementById("movBulkBuscar").addEventListener("click", buscarMovBulk);
  document.getElementById("movBulkAgregarOrigen").addEventListener("click", agregarOrigenCompleto);
  document.getElementById("movBulkCodigo").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();buscarMovBulk();}});
  document.getElementById("movBulkDestino").addEventListener("change",actualizarMovBulkEstado);
  document.getElementById("movBulkEjecutar").addEventListener("click",confirmarMovBulk);
  document.getElementById("movBulkConfirmX").addEventListener("click",function(){document.getElementById("movBulkConfirmBg").classList.add("hidden");});
  document.getElementById("movBulkConfirmNo").addEventListener("click",function(){document.getElementById("movBulkConfirmBg").classList.add("hidden");});
  document.getElementById("movBulkConfirmYes").addEventListener("click",ejecutarMovBulk);

  // ---- Movilizacion ----
  let movItem=null, movDestinosCargados=false;
  function movMsg(t,ok){ const m=$("#movMsg"); m.textContent=t; m.className="msg "+(ok?"ok":"bad"); }
  function prepararMov(){
    $("#movForm").classList.toggle("hidden", !puedeMant());
    if(!movDestinosCargados){
      const sel=$("#movDestino");
      if(bases&&bases.length){ const og=document.createElement("optgroup"); og.label="Bases"; bases.forEach(function(b){ const o=document.createElement("option"); o.value="base:"+b.id; o.textContent=b.nombre; og.appendChild(o); }); sel.appendChild(og); }
      if(unidades&&unidades.length){ const og=document.createElement("optgroup"); og.label="Unidades"; unidades.forEach(function(u){ const o=document.createElement("option"); o.value="uni:"+u.id; o.textContent=u.nombre; og.appendChild(o); }); sel.appendChild(og); }
      movDestinosCargados=true;
    }
  }
  async function movBuscarItem(){
    const cod=($("#movCodigo").value||"").trim().toUpperCase(); if(!cod) return;
    $("#movInfo").textContent="Buscando…"; $("#movGuardar").disabled=true; movItem=null;
    try{
      const r=await fetch(URL_SB+"/rest/v1/items?select=id,codigo,descripcion,base_id,unidad_id,categoria_id,bases(nombre),unidades(nombre)&codigo=eq."+encodeURIComponent(cod)+(MODULO==='it'?"&categoria_id=eq.instrumento":"")+"&limit=1",{headers:headers()});
      const d=await r.json();
      if(d&&d[0]){ movItem=d[0];
        const ub=(d[0].bases&&d[0].bases.nombre)||(d[0].unidades&&d[0].unidades.nombre)||"Sin ubicación";
        $("#movInfo").innerHTML="<b>"+esc(d[0].descripcion||"")+"</b> &middot; Ubicación actual: <span class=\"u\">"+esc(ub)+"</span>";
        $("#movGuardar").disabled=false;
      } else { $("#movInfo").textContent="No se encontró ese código."; }
    }catch(e){ $("#movInfo").textContent="No se pudo buscar."; }
  }
  async function movGuardar(){
    if(!movItem){ movMsg("Primero busca un código válido.",false); return; }
    const val=$("#movDestino").value; if(!val){ movMsg("Elige un destino.",false); return; }
    const btn=$("#movGuardar"); btn.disabled=true;
    let p_base=null,p_uni=null;
    if(val.indexOf("base:")===0) p_base=parseInt(val.slice(5)); else if(val.indexOf("uni:")===0) p_uni=parseInt(val.slice(4));
    try{
      const r=await fetch(URL_SB+"/rest/v1/rpc/mover_item",{method:"POST",headers:headers(),body:JSON.stringify({p_item_id:movItem.id,p_base_id:p_base,p_unidad_id:p_uni})});
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"error"); }
      movMsg("Movimiento registrado.",true);
      $("#movCodigo").value=""; $("#movInfo").textContent=""; $("#movDestino").value=""; movItem=null; $("#movGuardar").disabled=true;
      cargarHistorial();
    }catch(e){ movMsg("No se pudo registrar el movimiento. "+(e.message&&e.message.indexOf("permiso")>=0?"(sin permiso)":""), false); }
    finally{ btn.disabled=false; }
  }
  async function cargarHistorial(){
    const tb=$("#movFilas"); tb.innerHTML='<tr><td colspan="6" class="vacio">Cargando…</td></tr>';
    try{
      const r=await fetch(URL_SB+"/rest/v1/rpc/historial_movimientos",{method:"POST",headers:headers(),body:JSON.stringify({p_item_id:null,p_dias:60,p_modulo:MODULO})});
      const d=await r.json()||[];
      if(!d.length){ tb.innerHTML='<tr><td colspan="6" class="vacio">Sin movimientos en los últimos 60 días.</td></tr>'; return; }
      tb.innerHTML=d.map(function(m){ return '<tr><td>'+esc(String(m.fecha||"").slice(0,16).replace("T"," "))+'</td><td>'+codHTML(m.codigo)+'</td><td class="desc">'+esc(m.descripcion)+'</td><td>'+esc(m.origen)+'</td><td>'+esc(m.destino)+'</td><td>'+esc(m.usuario)+'</td></tr>'; }).join("");
    }catch(e){ tb.innerHTML='<tr><td colspan="6" class="vacio">No se pudo cargar el historial.</td></tr>'; }
  }
  // ===== Panel Dashboard (Paso 5) =====
  async function actualizarAlertas(){
    var hoyISOs=new Date().toISOString().slice(0,10);
    var d10=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
    var venc=await contarCiclos("vigente=eq.true&fecha_vencimiento=lt."+hoyISOs);
    var pv=await contarCiclos("vigente=eq.true&fecha_vencimiento=gte."+hoyISOs+"&fecha_vencimiento=lte."+d10);
    var n=venc+pv; var pt=$("#ptAlerta"); if(pt){ pt.textContent=n; pt.classList.toggle("hidden", n===0); }
    // Aviso del sidebar con datos reales (antes era un texto fijo "2 equipos con mtto vencido").
    var av=$("#sideAviso"), avBox=$("#sideAvisoBox"), avT=$("#sideAvisoT");
    if(av){
      var esIT=(MODULO==='it'), sust=esIT?"instrumento":"equipo";
      if(venc>0){
        av.textContent = venc+" "+sust+(venc>1?"s":"")+" con "+(esIT?"calibración":"mtto")+" vencid"+(venc>1?"os":"o");
        if(avT) avT.textContent="ATENCIÓN HOY";
        if(avBox) avBox.classList.remove("ok");
      }else if(pv>0){
        av.textContent = pv+" "+(esIT?"por verificar":"por vencer")+" (10 días o menos)";
        if(avT) avT.textContent="PRÓXIMOS";
        if(avBox) avBox.classList.remove("ok");
      }else{
        av.textContent = esIT?"Todo al día · sin vencidos":"Todo al día · sin vencidos";
        if(avT) avT.textContent="ESTADO HOY";
        if(avBox) avBox.classList.add("ok");
      }
    }
  }
  // Devuelve los item_id de los ciclos que cumplen una condicion (respetando el modulo activo).
  async function idsCiclosCond(cond){
    var sel=(MODULO==='it')?"item_id,items!inner(id)":"item_id";
    var extra=(MODULO==='it')?"&items.categoria_id=eq.instrumento":"";
    try{
      var r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select="+sel+"&"+cond+extra+"&limit=5000",{headers:headers()});
      var d=r.ok?await r.json():[];
      return Array.from(new Set(d.map(function(x){return x.item_id;}).filter(Boolean)));
    }catch(e){ return []; }
  }
  // Lleva al Inventario aplicando un filtro (drill-down desde el dashboard) y pone un subtitulo con el conteo.
  async function drillInventario(filtro, label){
    irPanel("inventario");
    invEstado=""; invChip="todos"; pagina=0;
    ["fLinea","fCategoria","fUbi"].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=""; });
    var ft=document.getElementById("fTipo"); if(ft) ft.value="";
    var q1=document.getElementById("invBuscar"); if(q1) q1.value=""; var q2=document.getElementById("q"); if(q2) q2.value="";
    invExtra=filtro||"";
    try{ actualizarResumenFiltros(); }catch(e){}
    await buscar();
    var t=$("#tbSub"); if(t && label) t.textContent=label+" · "+(total||0)+" ítems";
  }
  async function cargarDashboard(){
    var esIT=(MODULO==='it');
    // Ajustes de contexto para el modulo IT (instrumentos):
    var cardLin=$("#dbLineasCard"); if(cardLin) cardLin.classList.remove("hidden");             // en IT se reutiliza como "por tipo de instrumento"
    var cardLinT=$("#dbLineasT"); if(cardLinT) cardLinT.textContent = esIT ? "Inventario por tipo de instrumento" : "Inventario por línea";
    var docsGrid=$("#dbDocsGrid"); if(docsGrid) docsGrid.classList.toggle("hidden", esIT);       // COC/Reporte/NDT no aplican a instrumentos
    var docBtn=$("#dbAlDocBtn"); if(docBtn) docBtn.classList.toggle("hidden", esIT);
    var mesesT=$("#dbMesesT"); if(mesesT) mesesT.textContent = esIT ? "Calibraciones / verificaciones por mes" : "Mantenimientos por mes";
    var fueraT=$("#dbFueraT"); if(fueraT) fueraT.textContent = esIT ? "INSTRUMENTOS FUERA DE SERVICIO" : "HERRAMIENTAS FUERA DE SERVICIO";
    cargarDbMeses(); if(esIT){ cargarDbSubtipos(); } else { cargarDbLineas(); } cargarDbMetricas(); setTimeout(mostrarMantenimientosIncompletos,300);
  }
  async function cargarDbMeses(){
    var cont=$("#dbMeses");
    try{
      var base=new Date(); base.setDate(1);
      var desde=new Date(base.getFullYear(), base.getMonth()-7, 1).toISOString().slice(0,10);
      var joinM=(MODULO==='it')?"fecha_realizado,items!inner(id)":"fecha_realizado";
      var extraM=(MODULO==='it')?"&items.categoria_id=eq.instrumento":"";
      var r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select="+joinM+"&fecha_realizado=gte."+desde+extraM+"&limit=5000",{headers:headers()});
      var d=r.ok?await r.json():[];
      var nom=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
      var meses=[];
      for(var i=7;i>=0;i--){ var dt=new Date(base.getFullYear(), base.getMonth()-i, 1); meses.push({y:dt.getFullYear(), m:dt.getMonth(), n:0, lbl:nom[dt.getMonth()]}); }
      d.forEach(function(c){ if(!c.fecha_realizado) return; var dt=new Date(c.fecha_realizado); meses.forEach(function(mm){ if(mm.y===dt.getFullYear() && mm.m===dt.getMonth()) mm.n++; }); });
      var max=Math.max.apply(null, meses.map(function(m){return m.n;}).concat([1]));
      cont.innerHTML=meses.map(function(m){
        var h=Math.max(Math.round(m.n/max*150),2);
        return '<div class="db-bar'+(m.n===max&&max>0?" max":"")+'" data-y="'+m.y+'" data-m="'+m.m+'" style="cursor:pointer" title="Ver ítems de '+m.lbl+'"><div class="db-bar-v">'+m.n+'</div><div class="db-bar-fill" style="height:'+h+'px"></div><div class="db-bar-m">'+m.lbl+'</div></div>';
      }).join("");
      cont.querySelectorAll(".db-bar[data-y]").forEach(function(el){ el.addEventListener("click",async function(){
        var y=parseInt(el.getAttribute("data-y"),10), mo=parseInt(el.getAttribute("data-m"),10);
        var ini=new Date(y,mo,1).toISOString().slice(0,10), fin=new Date(y,mo+1,1).toISOString().slice(0,10);
        var nomMes=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"][mo];
        var ids=await idsCiclosCond("fecha_realizado=gte."+ini+"&fecha_realizado=lt."+fin);
        drillInventario(ids.length?"&id=in.("+ids.join(",")+")":"&id=eq.-1","Mantenimientos "+nomMes+" "+y);
      }); });
    }catch(e){ cont.innerHTML='<div class="rs-empty">No se pudo cargar.</div>'; }
  }
  async function cargarDbLineas(){
    var cont=$("#dbLineas");
    var arr=[];
    for(var i=0;i<LINEAS_OK.length;i++){ var lc=LINEAS_OK[i]; var n=await contarRest("items","linea_codigo=eq."+lc); arr.push({k:lc, n:n}); }
    arr.sort(function(a,b){ return b.n-a.n; });
    var max=Math.max.apply(null, arr.map(function(x){return x.n;}).concat([1]));
    cont.innerHTML=arr.map(function(x){
      var w=Math.max(Math.round(x.n/max*100),2);
      return '<div class="db-lin" data-linea="'+esc(x.k)+'" style="cursor:pointer" title="Ver ítems de la línea '+esc(x.k)+'"><div class="db-lin-top"><span class="db-lin-k">'+x.k+'</span><span class="db-lin-n">'+x.n.toLocaleString("es-CO")+'</span></div><div class="db-lin-bar"><span style="width:'+w+'%"></span></div></div>';
    }).join("");
    cont.querySelectorAll(".db-lin[data-linea]").forEach(function(el){ el.addEventListener("click",function(){ var lc=el.getAttribute("data-linea"); drillInventario("&linea_codigo=eq."+encodeURIComponent(lc),"Línea "+lc); }); });
  }
  // IT: inventario por tipo de instrumento (subtipo). Muestra el top 12 y agrupa el resto en "Otros".
  async function cargarDbSubtipos(){
    var cont=$("#dbLineas"); if(!cont) return;
    try{
      var r=await fetch(URL_SB+"/rest/v1/items?select=subtipo&categoria_id=eq.instrumento&limit=5000",{headers:headers()});
      var d=r.ok?await r.json():[];
      var mapa={};
      d.forEach(function(x){ var k=(x.subtipo&&x.subtipo.trim())||'(sin tipo)'; mapa[k]=(mapa[k]||0)+1; });
      var arr=Object.keys(mapa).map(function(k){ return {k:k, n:mapa[k]}; }).sort(function(a,b){ return b.n-a.n; });
      var top=arr.slice(0,12), resto=arr.slice(12);
      if(resto.length){ var s=resto.reduce(function(a,b){ return a+b.n; },0); top.push({k:'Otros ('+resto.length+' tipos)', n:s}); }
      var max=Math.max.apply(null, top.map(function(x){return x.n;}).concat([1]));
      cont.innerHTML=top.map(function(x){
        var w=Math.max(Math.round(x.n/max*100),2);
        var clic=/^Otros \(/.test(x.k) ? '' : (' data-sub="'+esc(x.k)+'" style="cursor:pointer" title="Ver ítems de '+esc(x.k)+'"');
        return '<div class="db-lin"'+clic+'><div class="db-lin-top"><span class="db-lin-k">'+esc(x.k)+'</span><span class="db-lin-n">'+x.n.toLocaleString("es-CO")+'</span></div><div class="db-lin-bar"><span style="width:'+w+'%"></span></div></div>';
      }).join("");
      cont.querySelectorAll(".db-lin[data-sub]").forEach(function(el){ el.addEventListener("click",function(){ var sub=el.getAttribute("data-sub"); drillInventario("&subtipo=eq."+encodeURIComponent('"'+sub+'"'),"Tipo: "+sub); }); });
    }catch(e){ cont.innerHTML='<div class="rs-empty">No se pudo cargar.</div>'; }
  }
  // Consulta una tabla filtrando por una lista de IDs, dividiéndola en lotes.
  // Evita que "id=in.(...miles de ids...)" genere una URL demasiado larga (error 414).
  async function fetchIdsEnLotes(tabla, selectCols, campoIn, ids, tam){
    const out=[]; tam=tam||150;
    for(let i=0;i<ids.length;i+=tam){
      const lote=ids.slice(i,i+tam);
      try{
        const r=await fetch(URL_SB+"/rest/v1/"+tabla+"?select="+selectCols+"&"+campoIn+"=in.("+lote.join(",")+")&limit=5000",{headers:headers()});
        if(r.ok){ const d=await r.json()||[]; for(let k=0;k<d.length;k++) out.push(d[k]); }
      }catch(e){ console.warn("fetchIdsEnLotes",tabla,e&&e.message); }
    }
    return out;
  }
  async function idsConDocumento(tipoDoc){
    try{
      if(tipoDoc==="coc"){
        const r=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=item_id&tipo=eq.coc&limit=5000",{headers:headers()});
        if(!r.ok) return [];
        const d=await r.json()||[];
        return [...new Set(d.map(x=>x.item_id).filter(Boolean))];
      }
      const r=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=ciclo_id&tipo=eq."+encodeURIComponent(tipoDoc)+"&limit=5000",{headers:headers()});
      if(!r.ok) return [];
      const docs=await r.json()||[];
      const cids=[...new Set(docs.map(x=>x.ciclo_id).filter(Boolean))];
      if(!cids.length) return [];
      // Antes: una sola URL con todos los ciclo_id (podía superar el límite de longitud).
      // Ahora: se consulta por lotes de 150 IDs.
      const ciclos=await fetchIdsEnLotes("ciclos_mantenimiento","id,item_id","id",cids,150);
      return [...new Set(ciclos.map(x=>x.item_id).filter(Boolean))];
    }catch(e){ return []; }
  }
  async function filtrarInventarioPorDocumento(tipoDoc,label){
    const ids=await idsConDocumento(tipoDoc);
    irPanel("inventario");
    invEstado="";
    invChip="todos";
    invExtra=ids.length ? "&id=in.("+ids.join(",")+")" : "&id=eq.-1";
    pagina=0;
    actualizarResumenFiltros();
    await buscar();
    const q=document.getElementById("invBuscar"); if(q) q.value="";
    const title=document.getElementById("tbSub"); if(title) title.textContent=(label||"Documentos")+" · "+ids.length+" ítems";
  }
  function actualizarResumenFiltros(){
    const el=document.getElementById("invFiltroResumen"); if(!el) return;
    const vals=[];
    const l=document.getElementById("fLinea"), c=document.getElementById("fCategoria"), u=document.getElementById("fUbi"), t=document.getElementById("fTipo");
    if(MODULO!=='it') vals.push(l&&l.value?(l.options[l.selectedIndex]?.text||l.value):"Todas las líneas");
    vals.push(c&&c.value?(c.options[c.selectedIndex]?.text||c.value):(MODULO==='it'?"Todos los tipos":"Todas las categorías"));
    vals.push(u&&u.value?(u.options[u.selectedIndex]?.text||u.value):"Todas las ubicaciones");
    if(t&&t.value.trim()) vals.push((MODULO==='it'?"Tipo de instrumento: ":"Tipo: ")+t.value.trim());
    el.textContent=vals.join(" · ");
  }
  // Cobertura documental (COC/Reporte/NDT) contada en el servidor, por ítem.
  // Reemplaza a idsConDocumento(...).length, que traía filas con limit=5000 y
  // subestimaba los números a escala. Respeta el módulo activo (mtto / it).
  async function contarDocsDashboard(){
    try{
      var body={ p_categoria: (MODULO==='it' ? 'instrumento' : null) };
      var r=await fetch(URL_SB+"/rest/v1/rpc/dashboard_doc_counts",{method:"POST",headers:headers(),body:JSON.stringify(body)});
      if(!r.ok) return {con_coc:0,con_reporte:0,con_ndt:0};
      var d=await r.json();
      // PostgREST devuelve un array de filas para funciones RETURNS TABLE.
      return Array.isArray(d) ? (d[0]||{con_coc:0,con_reporte:0,con_ndt:0}) : (d||{con_coc:0,con_reporte:0,con_ndt:0});
    }catch(e){ return {con_coc:0,con_reporte:0,con_ndt:0}; }
  }
  async function cargarDbMetricas(){
    var R={};
    try{ var rr=await fetch(URL_SB+"/rest/v1/rpc/dashboard_resumen",{method:"POST",headers:headers(),body:JSON.stringify({p_linea:null,p_categoria:(MODULO==='it'?'instrumento':null),p_base:null,p_tipo:null})}); if(rr.ok) R=await rr.json(); }catch(e){}
    var alDia=(R.al_dia)||0, venc=(R.vencidos)||0, pv=(R.por_vencer)||0;
    var conReg=alDia+venc+pv;
    var cumpl= conReg ? Math.round(alDia/conReg*100) : 0;
    $("#dbCumpl").textContent=cumpl+"%";
    $("#dbCumplBar").style.width=cumpl+"%";
    const av=$("#dbAlVenc"), ap=$("#dbAlPv");
    if(av) av.textContent=venc.toLocaleString("es-CO");
    if(ap) ap.textContent=pv.toLocaleString("es-CO");
    const dc=$("#dbAlDoc"); if(dc) dc.textContent=((R.total)?Math.round((R.con_coc+R.con_ficha+R.con_manual)/(R.total*3)*100):0)+"%";
    var ini=new Date(); ini.setDate(1); var iniISO=ini.toISOString().slice(0,10);
    // Consultas independientes en paralelo (antes iban en serie, lo que hacía lento el panel en móvil).
    var res=await Promise.all([
      contarCiclos("fecha_realizado=gte."+iniISO),
      contarRest("items","estado=eq.fuera_servicio&"+scopeItemsMod()),
      contarRest("items",scopeItemsMod()),
      contarDocsDashboard(),
      contarCiclos("datos_formulario->>incompleto=eq.true")
    ]);
    var mesN=res[0], fuera=res[1], total=res[2], docs=res[3], inc=res[4];
    $("#dbMes").textContent=mesN.toLocaleString("es-CO");
    $("#dbFuera").textContent=fuera.toLocaleString("es-CO");
    const ao=$("#dbAlOff"); if(ao) ao.textContent=fuera.toLocaleString("es-CO");
    var coc=docs.con_coc||0, rep=docs.con_reporte||0, ndt=docs.con_ndt||0;
    [["dbCoc",coc],["dbRep",rep],["dbNdt",ndt]].forEach(function(x){var e=$("#"+x[0]);if(e)e.textContent=x[1].toLocaleString("es-CO");});
    [["dbCocP",coc/Math.max(total,1)],["dbRepP",rep/Math.max(total,1)],["dbNdtP",ndt/Math.max(total,1)]].forEach(function(x){var e=$("#"+x[0]);if(e)e.textContent=Math.round(x[1]*1000)/10+"% de la totalidad";});
    document.querySelectorAll(".db-doc-card").forEach(function(card){ card.style.cursor="pointer"; });
    var ei=$("#dbAlInc"); if(ei) ei.textContent=inc.toLocaleString("es-CO");
  }
  async function mostrarMantenimientosIncompletos(){
    var box=$("#dbIncomplete"); if(!box) return;
    box.classList.remove("hidden");
    try{
      var joinI=(MODULO==='it')?"items!inner":"items";
      var extraI=(MODULO==='it')?"&items.categoria_id=eq.instrumento":"";
      var r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id,fecha_realizado,datos_formulario,"+joinI+"(id,codigo,descripcion)&datos_formulario->>incompleto=eq.true"+extraI+"&order=fecha_realizado.desc&limit=100",{headers:headers()});
      var d=r.ok?await r.json():[];
      if(!d.length){ box.innerHTML='<div class="rs-empty">No hay mantenimientos incompletos.</div>'; return; }
      box.innerHTML='<div class="db-card"><div class="db-card-t">Mantenimientos incompletos</div>'+d.map(function(x){var it=x.items||{};var dd=x.datos_formulario||{};return '<button class="db-alerta warn" type="button" data-inc-id="'+esc(it.id||'')+'"><span class="db-alerta-ic">!</span><span><b>'+esc(it.codigo||'—')+'</b><small>'+esc(dd.documentos_faltantes?dd.documentos_faltantes.join(', '):'Documentación pendiente')+'</small></span></button>';}).join('')+'</div>';
      box.querySelectorAll('[data-inc-id]').forEach(function(b){b.addEventListener('click',function(){fetchItemYFicha(b.getAttribute('data-inc-id'));});});
    }catch(e){ box.innerHTML='<div class="rs-empty">No se pudo cargar.</div>'; }
  }
  async function cargarMovKpis(){
    var enCampo=await contarRest("items","unidad_id=not.is.null&"+scopeItemsMod());
    var total=0, hoyN=0, destinos=0;
    try{
      var r=await fetch(URL_SB+"/rest/v1/rpc/historial_movimientos",{method:"POST",headers:headers(),body:JSON.stringify({p_item_id:null,p_dias:30,p_modulo:MODULO})});
      var d=r.ok?await r.json():[];
      total=d.length;
      var hoyStr=new Date().toISOString().slice(0,10); var setD={};
      d.forEach(function(m){ if(String(m.fecha||"").slice(0,10)===hoyStr) hoyN++; if(m.destino) setD[m.destino]=1; });
      destinos=Object.keys(setD).length;
    }catch(e){}
    var kpis=[
      {n:enCampo, t:(MODULO==='it'?"INSTRUMENTOS EN CAMPO":"ÍTEMS EN CAMPO"), crit:true},
      {n:total, t:"MOVIMIENTOS 30 D"},
      {n:destinos, t:"DESTINOS ACTIVOS"},
      {n:hoyN, t:"MOVIMIENTOS HOY"}
    ];
    $("#mvKpis").innerHTML=kpis.map(function(k){
      return '<div class="mv-kpi'+(k.crit?" crit":"")+'"><div class="mv-kpi-n">'+k.n.toLocaleString("es-CO")+'</div><div class="mv-kpi-t">'+k.t+'</div></div>';
    }).join("");
  }
  async function movInforme(){
    try{
      const r=await fetch(URL_SB+"/rest/v1/rpc/historial_movimientos",{method:"POST",headers:headers(),body:JSON.stringify({p_item_id:null,p_dias:7,p_modulo:MODULO})});
      const d=await r.json()||[];
      const cab=["Fecha","Codigo","Descripcion","Origen","Destino","Usuario"];
      const cq=function(s){ return '"'+String(s==null?"":s).replace(/"/g,'""')+'"'; };
      const lineas=[cab.join(",")].concat(d.map(function(m){ return [String(m.fecha||"").slice(0,16).replace("T"," "),m.codigo,m.descripcion,m.origen,m.destino,m.usuario].map(cq).join(","); }));
      const csv="﻿"+lineas.join("\r\n");
      const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
      const a=document.createElement("a"); a.href=window.URL.createObjectURL(blob);
      a.download="movimientos_ultima_semana_"+hoyISO()+".csv"; document.body.appendChild(a); a.click(); a.remove();
    }catch(e){ movMsg("No se pudo generar el informe.",false); }
  }
  $("#movBuscar").addEventListener("click", movBuscarItem);
  $("#movCodigo").addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); movBuscarItem(); } });
  $("#movGuardar").addEventListener("click", movGuardar);
  $("#movInforme").addEventListener("click", movInforme);

  // ---- Fabricantes (documentos compartidos por fabricante + tipo) ----
  let fabTree=null;
  const FSEP="~~";
  function fabMsg(t,ok){ const m=$("#fabMsg"); if(!m) return; m.textContent=t; m.className="msg "+(ok?"ok":"bad"); }
  async function cargarFabricantes(){
    if(fabTree) return;
    fabTree={};
    try{
      const r=await fetch(URL_SB+"/rest/v1/items?select=fabricante,tipo_codigo,categoria_id,tipos_item(nombre)&fabricante=not.is.null"+(MODULO==='it'?"&categoria_id=eq.instrumento":"&or=(categoria_id.neq.instrumento,categoria_id.is.null)")+"&limit=20000",{headers:headers()});
      const d=await r.json()||[]; const seen={};
      d.forEach(function(it){
        const f=String(it.fabricante||"").trim(); if(!f) return;
        const tc=it.tipo_codigo||""; const key=f+FSEP+tc;
        if(seen[key]) return; seen[key]=1;
        (fabTree[f]=fabTree[f]||[]).push({tipo_codigo:tc, nombre:(it.tipos_item&&it.tipos_item.nombre)||tc});
      });
      Object.keys(fabTree).forEach(function(f){ fabTree[f].sort(function(a,b){ return String(a.nombre).localeCompare(String(b.nombre)); }); });
    }catch(e){ fabTree={}; }
  }
  let fabKeys=[], _fabBound=false;
  function inicialesFab(f){ var p=String(f||"").trim().split(/\s+/); return (((p[0]&&p[0][0])||"")+((p[1]&&p[1][0])||(p[0]&&p[0][1])||"")).toUpperCase(); }
  async function prepararFab(){
    await cargarFabricantes();
    fabKeys=Object.keys(fabTree).sort(function(a,b){ return a.localeCompare(b); });
    $("#fabConteo").textContent=fabKeys.length+" FABRICANTES";
    $("#fabLista").classList.remove("hidden");
    $("#fabCatalogo").classList.add("hidden");
    if(!_fabBound){
      _fabBound=true;
      $("#fabVolver").addEventListener("click", function(){ $("#fabCatalogo").classList.add("hidden"); $("#fabLista").classList.remove("hidden"); });
      $("#fabBuscar").addEventListener("input", function(){ var q=this.value.trim().toLowerCase(); renderFabGrid(fabKeys.filter(function(f){ return f.toLowerCase().indexOf(q)>=0; })); });
    }
    renderFabGrid(fabKeys);
  }
  function renderFabGrid(keys){
    var grid=$("#fabGrid");
    if(!keys.length){ grid.innerHTML='<div class="rs-empty">No hay fabricantes que coincidan.</div>'; return; }
    grid.innerHTML=keys.map(function(f,i){
      var tipos=(fabTree[f]||[]).length;
      return '<div class="fab-card" data-i="'+i+'">'+
        '<div class="fab-card-h"><span class="fab-ini">'+esc(inicialesFab(f))+'</span>'+
          '<div class="fab-card-hn"><div class="fab-nom">'+esc(f)+'</div><div class="fab-pais">&mdash;</div></div></div>'+
        '<div class="fab-metrics">'+
          '<div class="fab-m"><div class="fab-m-n" id="fabItems'+i+'">&hellip;</div><div class="fab-m-t">ÍTEMS</div></div>'+
          '<div class="fab-m"><div class="fab-m-n">'+tipos+'</div><div class="fab-m-t">TIPOS</div></div>'+
        '</div>'+
        '<div class="fab-card-f"><span>Documentos</span><span class="fab-ver">Ver cat&aacute;logo &rarr;</span></div>'+
      '</div>';
    }).join("");
    grid.querySelectorAll(".fab-card").forEach(function(c){ c.addEventListener("click", function(){ verCatalogoFab(keys[parseInt(c.getAttribute("data-i"),10)]); }); });
    keys.forEach(function(f,i){ contarRest("items","fabricante=eq."+encodeURIComponent(f)).then(function(n){ var el=document.getElementById("fabItems"+i); if(el) el.textContent=n.toLocaleString("es-CO"); }); });
  }
  function verCatalogoFab(fab){
    if(!fab) return;
    $("#fabLista").classList.add("hidden");
    $("#fabCatalogo").classList.remove("hidden");
    $("#fabCatIni").textContent=inicialesFab(fab);
    $("#fabCatNom").textContent=fab;
    $("#fabMsg").className="msg hidden";
    renderFabTipos(fab);
  }
  function fabSlot(fab,tc,tipo,label,doc){
    const tiene=!!doc; let acc="";
    if(tiene) acc+='<a href="#" data-fabver="'+esc(doc.archivo_path)+'">Ver</a>';
    if(esAdmin()) acc+='<button class="'+(tiene?"rep":"up")+'" data-fabsub="'+esc(fab+FSEP+tc+FSEP+tipo)+'">'+(tiene?"Reemplazar":"Subir")+'</button>';
    return '<div class="slot"><span class="sn">'+label+'</span><span class="est'+(tiene?" ok":"")+'">'+(tiene?"Cargado":"Sin cargar")+'</span>'+acc+'</div>';
  }
  async function renderFabTipos(fab){
    const cont=$("#fabTipos");
    if(!fab){ cont.innerHTML='<div class="vacio">Elige un fabricante para ver y cargar sus documentos.</div>'; return; }
    const tipos=(fabTree&&fabTree[fab])||[];
    if(!tipos.length){ cont.innerHTML='<div class="vacio">Este fabricante no tiene tipos asociados.</div>'; return; }
    cont.innerHTML='<div class="cargando" style="padding:0 18px">Cargando documentos&hellip;</div>';
    let docs=[];
    try{ const r=await fetch(URL_SB+"/rest/v1/documentos_fabricante?select=tipo_codigo,tipo,archivo_path&fabricante=eq."+encodeURIComponent(fab),{headers:headers()}); if(r.ok) docs=await r.json(); }catch(e){}
    const mapa={}; docs.forEach(function(d){ mapa[d.tipo_codigo+FSEP+d.tipo]=d; });
    cont.innerHTML=tipos.map(function(t){
      const ft=mapa[t.tipo_codigo+FSEP+"ficha_tecnica"], mn=mapa[t.tipo_codigo+FSEP+"manual"];
      return '<div class="fab-tipo"><div class="fab-tipo-h"><span class="cod">'+esc(t.tipo_codigo)+'</span>'+esc(t.nombre||"")+'</div>'+
        fabSlot(fab,t.tipo_codigo,"ficha_tecnica","Ficha tecnica",ft)+
        fabSlot(fab,t.tipo_codigo,"manual","Manual O&M",mn)+'</div>';
    }).join("");
    cont.querySelectorAll("[data-fabver]").forEach(function(a){ a.addEventListener("click",function(e){ e.preventDefault(); verArchivo(a.getAttribute("data-fabver")); }); });
    cont.querySelectorAll("[data-fabsub]").forEach(function(b){ b.addEventListener("click",function(){
      const p=b.getAttribute("data-fabsub").split(FSEP); pendiente={scope:"fab",fabricante:p[0],tipo_codigo:p[1],tipo:p[2]};
      $("#filePicker").value=""; $("#filePicker").click();
    }); });
  }
  // seleccion de fabricante via tarjetas (verCatalogoFab)

  async function subirFab(pend, file){
    fabMsg("Subiendo el documento\u2026", true);
    try{
      const path="fabricantes/"+pend.fabricante+"/"+pend.tipo_codigo+"/"+pend.tipo+".pdf";
      await subirArchivo(path, file);
      const rq=await fetch(URL_SB+"/rest/v1/documentos_fabricante?select=id&fabricante=eq."+encodeURIComponent(pend.fabricante)+"&tipo_codigo=eq."+encodeURIComponent(pend.tipo_codigo)+"&tipo=eq."+pend.tipo,{headers:headers()});
      const ex=await rq.json();
      if(ex&&ex[0]) await fetch(URL_SB+"/rest/v1/documentos_fabricante?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({archivo_path:path, actualizado:new Date().toISOString()})});
      else await fetch(URL_SB+"/rest/v1/documentos_fabricante",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({fabricante:pend.fabricante,tipo_codigo:pend.tipo_codigo,tipo:pend.tipo,archivo_path:path})});
      fabMsg("Documento cargado. Se aplica a todos los codigos de este fabricante y tipo.", true);
      renderFabTipos(pend.fabricante);
    }catch(e){ fabMsg("No se pudo subir el archivo.", false); }
  }
  // (filtros del dashboard anterior retirados; el panel ahora usa cargarDashboard)

  $("#nuevo").addEventListener("click", abrirNuevo);
  $("#rsAdminUbic").addEventListener("click", function(){ if(esAdmin()) abrirUbicAdmin(); else uiAlert("Solo un administrador puede administrar ubicaciones."); });
  $("#mGuardar").addEventListener("click", guardar);
  $("#mDarBaja").addEventListener("click", darDeBajaItem);
  $("#mEliminarDef").addEventListener("click", eliminarItemDefinitivo);
  $("#ubicCerrar").addEventListener("click", function(){ $("#ubicAdminBg").classList.add("hidden"); });
  $("#ubicAgregar").addEventListener("click", agregarUbicAdmin);
  $("#ubicTipo").addEventListener("change", cargarUbicAdmin);
  $("#mCerrar").addEventListener("click", ()=>$("#modalBg").classList.add("hidden"));
  $("#modalBg").addEventListener("click", e=>{ if(e.target===$("#modalBg")) $("#modalBg").classList.add("hidden"); });
  $("#q").addEventListener("input", ()=>{
    const inv=document.getElementById("invBuscar"); if(inv) inv.value=$("#q").value;
    pagina=0; debounce(buscar);
  });
  $("#invBuscar").addEventListener("input", ()=>{
    $("#q").value=$("#invBuscar").value;
    pagina=0; debounce(buscar);
  });
  $("#invBuscar").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); pagina=0; buscar(); } });
  $("#invBuscarBtn").addEventListener("click", ()=>{ pagina=0; buscar(); });
  $("#invBuscarClear").addEventListener("click", ()=>{ $("#invBuscar").value=""; $("#q").value=""; pagina=0; buscar(); $("#invBuscar").focus(); });
  $("#fLinea").addEventListener("change", ()=>{ pagina=0; invExtra=""; actualizarResumenFiltros(); buscar(); });
  $("#fCategoria").addEventListener("change", ()=>{ pagina=0; invExtra=""; actualizarResumenFiltros(); buscar(); });
  $("#fUbi").addEventListener("change", ()=>{ pagina=0; invExtra=""; actualizarResumenFiltros(); buscar(); });
  $("#fTipo").addEventListener("input", ()=>{ pagina=0; invExtra=""; actualizarResumenFiltros(); debounce(buscar); });
  $("#invFiltrarBtn").addEventListener("click", function(){
    const p=$("#invFiltrosPanel"), b=$("#invFiltrarBtn");
    const abrir=p.classList.contains("hidden"); p.classList.toggle("hidden",!abrir); b.classList.toggle("on",abrir); b.setAttribute("aria-expanded",String(abrir));
  });
  $("#invBuscarBtn").addEventListener("click", function(){ pagina=0; invExtra=""; buscar(); });
  $("#invBuscar").addEventListener("keydown", function(e){ if(e.key==="Enter"){e.preventDefault(); pagina=0; invExtra=""; buscar();} });
  $("#invBuscarClear").addEventListener("click", function(){ $("#invBuscar").value=""; pagina=0; invExtra=""; buscar(); });
  [
    ["dbCoc","coc","COC"],
    ["dbRep","reporte_mantenimiento","Reportes de mantenimiento"],
    ["dbNdt","ndt","NDT"]
  ].forEach(function(cfg){ var card=document.getElementById(cfg[0])?.closest(".db-doc-card"); if(card) card.addEventListener("click",function(){ filtrarInventarioPorDocumento(cfg[1],cfg[2]); }); });
  actualizarResumenFiltros();
  // paginacion dinamica: renderPagerInv()
  $("#invDetX").addEventListener("click", function(){ $("#invDetalle").classList.remove("open"); });


  // ---- Documentos ----
  const ESTATICOS = [{k:"coc",t:"COC"},{k:"ficha_tecnica",t:"Ficha técnica"},{k:"manual",t:"Manual O&M"}];
  const DIN_BASE = [{k:"reporte_mantenimiento",t:"Reporte de mantenimiento"},{k:"reporte_falla",t:"Reporte de falla"},{k:"ndt",t:"Reporte NDT"}];
  const DIN_EQUIPO = [{k:"prueba_presion",t:"Prueba de presión"},{k:"espesores",t:"Espesores"},{k:"prueba_dureza",t:"Prueba de dureza"}];
  const DIN_IZAJE = [{k:"certificado_inspeccion",t:"Certificado de inspección"}];
  const DIN_INSTR = [{k:"certificado_calibracion",t:"Certificado de calibración"},{k:"certificado_verificacion",t:"Reporte de verificación"},{k:"certificado",t:"Certificado"},{k:"reporte_ndt",t:"Reporte NDT"}];
  // Mapea el tipo de control del instrumento al tipo de documento dinámico.
  function docCalibKey(ctrl){ return ({calibracion:"certificado_calibracion",verificacion:"certificado_verificacion",certificado:"certificado",ndt:"reporte_ndt"})[ctrl]||"certificado_calibracion"; }
  let cicloVigente = null;
  let cicloDatos = null;
  let pendiente = null;
  let mttoDraft = { tipo:null, preventivo:null, reportMethod:null, reportFile:null, fallaFile:null, ndtFile:null, phFile:null, online:false };

  function rutaBase(){ const it=itemActual; return (it.categoria_id||"herramienta")+"/"+(it.tipo_codigo||"SINTIPO")+"/"+it.codigo; }
  function encPath(p){ return p.split("/").map(encodeURIComponent).join("/"); }

  function fileToB64(file){
    return new Promise(function(res,rej){
      var fr=new FileReader();
      fr.onload=function(){ var t=String(fr.result); res(t.slice(t.indexOf(",")+1)); };
      fr.onerror=rej; fr.readAsDataURL(file);
    });
  }
  async function reflejarDrive(meta, file){
    if(!DRIVE_URL) return; // aun no configurado: no hace nada
    try{
      var dataB64 = await fileToB64(file);
      var cuerpo = Object.assign({token:DRIVE_TOKEN, mime:(file.type||"application/pdf"), dataB64:dataB64}, meta);
      await fetch(DRIVE_URL, { method:"POST", mode:"no-cors",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body: JSON.stringify(cuerpo) });
    }catch(e){ /* el reflejo a Drive nunca debe romper la carga principal */ }
  }
  // ===== Sincronizar NDT y PH desde Google Drive (solo admin) =====
  // Los nombres pueden contener uno o varios códigos. Ejemplo PH:
  // 0003-260611-PH-EPLST312F0058_EPLST312F0059_EPLST312F0063...
  var RX_SYNC_COD=/(EL|EP|FB|SL|SW|WL|WS|WT)[A-Z][A-Z0-9]{2}\d{3}[A-Z]\d{3,4}/g;

  function extraerCodigosNombre(name){
    var up=String(name||"").toUpperCase(), out=[], m;
    RX_SYNC_COD.lastIndex=0;
    while((m=RX_SYNC_COD.exec(up))!==null){
      if(out.indexOf(m[0])<0) out.push(m[0]);
    }
    return out;
  }

  function fechaSyncNombre(name){
    var n=String(name||"");
    // Formato actual: 0003-260611-PH-...
    var m=n.match(/(?:^|[-_.])(\d{6})(?=[-_.]|$)/);
    if(m){
      var yy=Number(m[1].slice(0,2)), mm=Number(m[1].slice(2,4)), dd=Number(m[1].slice(4,6));
      if(mm>=1&&mm<=12&&dd>=1&&dd<=31) return "20"+String(yy).padStart(2,"0")+"-"+String(mm).padStart(2,"0")+"-"+String(dd).padStart(2,"0");
    }
    // Compatibilidad: fecha compacta pegada a extensión .YYMMDD
    m=n.match(/\.(\d{2})(\d{2})(\d{2})(?:\D|$)/);
    if(m) return "20"+m[1]+"-"+m[2]+"-"+m[3];
    // YYYY-MM-DD
    m=n.match(/(?:^|[-_.])((?:19|20)\d{2})[-_.](\d{2})[-_.](\d{2})(?:[-_.]|$)/);
    if(m) return m[1]+"-"+m[2]+"-"+m[3];
    return null;
  }

  function parseNdtName(name){
    var codigos=extraerCodigosNombre(name);
    if(!codigos.length) return null;
    var up=String(name||"").toUpperCase();
    var mm=up.match(/-(PM|LP|UT|VT|MT|PT)-/);
    return { codigos:codigos, fecha:fechaSyncNombre(name), metodo:mm?mm[1]:null };
  }

  function parsePhName(name){
    var codigos=extraerCodigosNombre(name);
    if(!codigos.length) return null;
    return { codigos:codigos, fecha:fechaSyncNombre(name) };
  }

  function driveListSync(action, since){
    return new Promise(function(resolve,reject){
      var cb="__sync"+action+Date.now()+Math.floor(Math.random()*1000);
      var s=document.createElement("script");
      var to=setTimeout(function(){ limpiar(); reject(new Error("Tiempo agotado consultando Drive")); }, 180000);
      function limpiar(){ try{ delete window[cb]; }catch(e){ window[cb]=undefined; } if(s.parentNode) s.parentNode.removeChild(s); clearTimeout(to); }
      window[cb]=function(data){ limpiar(); resolve(data); };
      s.onerror=function(){ limpiar(); reject(new Error("No se pudo contactar Drive")); };
      s.src=DRIVE_URL+"?action="+encodeURIComponent(action)+"&token="+encodeURIComponent(DRIVE_TOKEN)+(since?("&since="+encodeURIComponent(since)):"")+"&callback="+cb;
      document.body.appendChild(s);
    });
  }
  function driveListNdt(since){ return driveListSync("list_ndt",since); }
  function driveListPh(since){ return driveListSync("list_ph",since); }
  function driveListCoc(since){ return driveListSync("list_coc",since); }
  function driveListProc(){ return driveListSync("list_proc"); }

  // ===== Procedimientos Operativos: base de documentos por linea =====
  var PROC = { data:{ws:[],wl:[],tx:[]}, linea:"wl", loaded:false, cargando:false, force:false };
  var _procBound=false;

  function procPretty(n){ return String(n||"").replace(/\.[a-z0-9]{2,5}$/i,"").replace(/[_-]+/g," ").trim(); }
  function procExt(n,mime){
    var m=(String(n||"").match(/\.([a-z0-9]{2,5})$/i)||[])[1];
    if(m) return m.toLowerCase();
    mime=String(mime||"");
    if(/pdf/.test(mime)) return "pdf";
    if(/word|document/.test(mime)) return "doc";
    if(/sheet|excel/.test(mime)) return "xls";
    if(/image/.test(mime)) return "img";
    return "";
  }
  function procIcono(ext){
    if(ext==="pdf") return "pdf";
    if(["doc","docx","odt"].indexOf(ext)>=0) return "doc";
    if(["xls","xlsx","csv"].indexOf(ext)>=0) return "xls";
    if(["png","jpg","jpeg","webp","gif"].indexOf(ext)>=0) return "img";
    return "file";
  }
  function procFecha(iso){ try{ return new Date(iso).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"}); }catch(e){ return ""; } }
  function procLabel(l){ return {wl:"Línea WL", ws:"Línea WS", tx:"Transversal"}[l]||l; }

  function procItemsDe(linea){
    var d=PROC.data;
    function tag(arr,l){ return (arr||[]).map(function(x){ return {f:x,l:l}; }); }
    if(linea==="wl") return tag(d.wl,"wl").concat(tag(d.tx,"tx"));
    if(linea==="ws") return tag(d.ws,"ws").concat(tag(d.tx,"tx"));
    return tag(d.tx,"tx");
  }

  function procCardHTML(it){
    var f=it.f, ext=procExt(f.n,f.m), ic=procIcono(ext);
    return '<article class="proc-doc">'+
      '<div class="pd-top">'+
        '<div class="pd-ic '+ic+'">'+esc((ext||"DOC").toUpperCase()).slice(0,4)+'</div>'+
        '<div><h4>'+esc(procPretty(f.n))+'</h4><div class="pd-sub">Actualizado '+esc(procFecha(f.f))+'</div></div>'+
      '</div>'+
      '<div class="pd-badges"><span class="pd-badge '+it.l+'">'+esc(procLabel(it.l))+'</span>'+
        (ext?'<span class="pd-badge ext">'+esc(ext.toUpperCase())+'</span>':'')+'</div>'+
      '<div class="pd-acts">'+
        '<button class="pd-btn ver" data-act="ver" data-id="'+esc(f.i)+'" data-name="'+esc(procPretty(f.n))+'">Ver</button>'+
        '<a class="pd-btn dl" href="https://drive.google.com/uc?export=download&id='+esc(f.i)+'" target="_blank" rel="noopener">Descargar</a>'+
      '</div>'+
    '</article>';
  }

  function procRender(){
    var cont=$("#procGrid"); if(!cont) return;
    var items=procItemsDe(PROC.linea);
    var term=(($("#procQ")&&$("#procQ").value)||"").toLowerCase().trim();
    var list=items.filter(function(it){ return !term || String(it.f.n||"").toLowerCase().indexOf(term)>=0; });
    var cnt=$("#procConteo"); if(cnt) cnt.textContent=list.length+(list.length===1?" documento":" documentos");
    if(!list.length){
      cont.innerHTML='<div class="proc-empty">'+(term
        ? "Sin resultados para “"+esc(term)+"”."
        : "Aún no hay procedimientos en esta línea.<br>Sube un documento a la carpeta de Drive y aparecerá aquí al actualizar.")+'</div>';
      return;
    }
    cont.innerHTML=list.map(procCardHTML).join("");
  }

  function procContadores(){
    var d=PROC.data;
    var set=function(id,txt){ var e=$(id); if(e) e.textContent=txt; };
    set("#plCountWl", d.wl.length+" propios · "+d.tx.length+" transv.");
    set("#plCountWs", d.ws.length+" propios · "+d.tx.length+" transv.");
    set("#plCountTx", d.tx.length+(d.tx.length===1?" documento":" documentos"));
  }

  function procVisor(id,name){
    var bg=$("#procVisorBg"); if(!bg) return;
    $("#pvTit").textContent=name||"Documento";
    $("#pvOpen").href="https://drive.google.com/file/d/"+id+"/view";
    $("#pvFrame").src="https://drive.google.com/file/d/"+id+"/preview";
    bg.classList.remove("hidden");
  }
  function procVisorCerrar(){
    var bg=$("#procVisorBg"); if(!bg||bg.classList.contains("hidden")) return;
    bg.classList.add("hidden"); var fr=$("#pvFrame"); if(fr) fr.src="about:blank";
  }

  function procBind(){
    if(_procBound) return; _procBound=true;
    document.querySelectorAll("#procLineas .proc-linea").forEach(function(b){
      b.addEventListener("click",function(){
        PROC.linea=b.getAttribute("data-linea");
        document.querySelectorAll("#procLineas .proc-linea").forEach(function(x){ x.classList.toggle("on", x===b); });
        procRender();
      });
    });
    var q=$("#procQ"); if(q) q.addEventListener("input", procRender);
    var rf=$("#procRefresh"); if(rf) rf.addEventListener("click", function(){ PROC.loaded=false; PROC.force=true; cargarProcedimientos(); });
    var grid=$("#procGrid"); if(grid) grid.addEventListener("click", function(e){
      var b=e.target.closest && e.target.closest('[data-act="ver"]'); if(!b) return;
      procVisor(b.getAttribute("data-id"), b.getAttribute("data-name"));
    });
    var cl=$("#pvClose"); if(cl) cl.addEventListener("click", procVisorCerrar);
    var bg=$("#procVisorBg"); if(bg) bg.addEventListener("click", function(e){ if(e.target===bg) procVisorCerrar(); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape") procVisorCerrar(); });
  }

  async function cargarProcedimientos(){
    procBind();
    if(PROC.loaded && !PROC.force){ procRender(); return; }
    if(PROC.cargando) return;
    PROC.cargando=true; PROC.force=false;
    var cont=$("#procGrid"); if(cont) cont.innerHTML='<div class="rs-empty">Cargando procedimientos desde Drive&hellip;</div>';
    try{
      if(!DRIVE_URL) throw new Error("Drive no está configurado.");
      var r=await driveListProc();
      if(!r || !r.ok) throw new Error((r&&r.error)||"Respuesta inválida de Drive.");
      PROC.data={ ws:r.ws||[], wl:r.wl||[], tx:r.tx||[] };
      PROC.loaded=true;
      procContadores();
      procRender();
    }catch(e){
      if(cont) cont.innerHTML='<div class="proc-empty">No se pudo leer Drive: '+esc(e.message||String(e))+
        '.<br><br>Verifica que el Apps Script tenga desplegada la acción <b>list_proc</b> (vuelve a implementar la versión).</div>';
    }finally{ PROC.cargando=false; }
  }

  // ===== Diseño y Dibujo (DD) — gestión de solicitudes =====
  var DD = { data:[], filtro:"", actual:null };
  var _ddBound=false;
  var DD_TIPOS = {
    levantamiento_3d:"Levantamiento y modelado 3D", modelado_3d:"Modelado 3D",
    diseno_3d:"Diseño y modelado 3D", planos:"Planos", informes_aef:"Informes / AEF",
    ficha_tecnica:"Ficha técnica", simulaciones:"Simulaciones"
  };
  var DD_ESTADOS = { pendiente:"Pendiente", en_proceso:"En proceso", entregada:"Entregada" };
  function ddFecha(iso){ try{ return new Date(iso).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"}); }catch(e){ return ""; } }
  function ddFechaHora(iso){ try{ return new Date(iso).toLocaleString("es-CO",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return ""; } }
  function ddFormMsg(t,ok){ var m=$("#ddFormMsg"); if(!m) return; m.textContent=t||""; m.classList.toggle("hidden",!t); m.style.color=ok?"var(--verde)":"var(--rojo)"; }
  function ddEntMsg(t,ok){ var m=$("#ddEntMsg"); if(!m) return; m.textContent=t||""; m.classList.toggle("hidden",!t); m.style.color=ok?"var(--verde)":"var(--rojo)"; }

  // ---- Drive: subir entregables/formato y obtener su link ----
  function ddFileToB64(file){
    return new Promise(function(resolve,reject){
      var fr=new FileReader();
      fr.onload=function(){ var s=String(fr.result||""); var i=s.indexOf(","); resolve(i>=0?s.slice(i+1):s); };
      fr.onerror=function(){ reject(new Error("No se pudo leer el archivo")); };
      fr.readAsDataURL(file);
    });
  }
  function ddJsonp(url){
    return new Promise(function(resolve,reject){
      var cb="__dd"+Date.now()+Math.floor(Math.random()*10000);
      var s=document.createElement("script");
      var to=setTimeout(function(){ cleanup(); reject(new Error("timeout")); }, 20000);
      function cleanup(){ try{delete window[cb];}catch(e){window[cb]=undefined;} if(s.parentNode)s.parentNode.removeChild(s); clearTimeout(to); }
      window[cb]=function(d){ cleanup(); resolve(d); };
      s.onerror=function(){ cleanup(); reject(new Error("jsonp error")); };
      s.src=url+(url.indexOf("?")<0?"?":"&")+"callback="+cb;
      document.body.appendChild(s);
    });
  }
  async function ddDriveFind(folder, codigo, filename, timeoutMs){
    var inicio=Date.now(); timeoutMs=timeoutMs||60000;
    while(Date.now()-inicio < timeoutMs){
      try{
        var url=DRIVE_URL+"?action=find_dd&token="+encodeURIComponent(DRIVE_TOKEN)+
          "&folder="+encodeURIComponent(folder)+"&codigo="+encodeURIComponent(codigo||"")+"&filename="+encodeURIComponent(filename);
        var r=await ddJsonp(url);
        if(r && r.found && r.url) return r;
      }catch(e){}
      await new Promise(function(res){ setTimeout(res,1500); });
    }
    throw new Error("No se encontró el archivo en Drive (tiempo agotado).");
  }
  async function ddDriveUpload(folder, codigo, file){
    if(!DRIVE_URL) throw new Error("Drive no está configurado.");
    var b64=await ddFileToB64(file);
    var filename=Date.now()+"_"+((file.name||"archivo").replace(/[^\w.\-]+/g,"_"));
    await fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({action:"upload_dd",token:DRIVE_TOKEN,folder:folder,codigo:codigo,filename:filename,mime:file.type||"application/octet-stream",dataB64:b64})});
    return await ddDriveFind(folder, codigo, filename, 90000); // {url,id}
  }
  // Dispara la generación del formato diligenciado (PDF) en FORMATOS (fire-and-forget).
  function ddGenerarFormato(s){
    if(!DRIVE_URL || !s) return;
    try{
      fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(Object.assign({action:"generar_formato_diseno",token:DRIVE_TOKEN}, s))});
    }catch(e){}
  }
  // Abre el formato diligenciado: SIEMPRE lo regenera con los datos/código actuales
  // (el backend borra el anterior primero), así nunca se muestra un PDF viejo.
  function ddVerFormato(s){
    if(!s) return;
    var btn=$("#ddVerFormato");
    var w=window.open("", "_blank"); // ventana abierta con el gesto del clic (evita bloqueo de pop-ups)
    if(btn){ btn.disabled=true; btn.textContent="Generando formato…"; }
    function done(){ if(btn){ btn.disabled=false; btn.textContent="Ver formato diligenciado ↗"; } }
    ddGenerarFormato(s); // regenera (borra el anterior y crea el nuevo)
    // Espera breve a que el backend borre el viejo, luego busca el nuevo.
    setTimeout(function(){
      ddDriveFind("formatos", s.codigo, (s.codigo||"")+".pdf", 25000).then(function(f){
        if(f&&f.url){ if(w) w.location.href=f.url; else window.open(f.url,"_blank","noopener"); }
        else { if(w){ try{w.close();}catch(e){} } }
        done();
      }).catch(function(){ if(w){ try{w.close();}catch(e){} } done(); });
    }, 2500);
  }

  function entrarDD(){
    ddBind();
    var hn=$("#hNombre"), hr=$("#hRol");
    if($("#ddNombre")) $("#ddNombre").textContent = hn?hn.textContent:"";
    if($("#ddRol")){ $("#ddRol").textContent = hr?hr.textContent:""; $("#ddRol").className = hr?hr.className:"rol"; }
    mostrarPantalla("appDD");
    cargarDD();
  }

  async function cargarDD(){
    var cont=$("#ddList"); if(!cont) return;
    cont.innerHTML='<div class="rs-empty">Cargando solicitudes…</div>';
    try{
      var r=await fetch(URL_SB+"/rest/v1/solicitudes_diseno?select=*&order=created_at.desc",{headers:headers()});
      if(!r.ok) throw new Error("HTTP "+r.status);
      DD.data=await r.json()||[];
      ddRender();
    }catch(e){
      cont.innerHTML='<div class="proc-empty">No se pudieron cargar las solicitudes.<br>'+esc(e.message||"")+
        '<br><br>¿Ya creaste la tabla <b>solicitudes_diseno</b> en Supabase (archivo solicitudes_diseno.sql)?</div>';
    }
  }

  function ddRender(){
    var cont=$("#ddList"); if(!cont) return;
    var list=DD.data.filter(function(s){ return !DD.filtro || s.estado===DD.filtro; });
    var cnt=$("#ddCount"); if(cnt) cnt.textContent=list.length+(list.length===1?" solicitud":" solicitudes");
    if(!list.length){
      cont.innerHTML='<div class="proc-empty">'+(DD.filtro?"No hay solicitudes en este estado.":"Aún no hay solicitudes. Crea la primera con “+ Nueva solicitud”.")+'</div>';
      return;
    }
    var grid=document.createElement("div"); grid.className="dd-grid";
    grid.innerHTML=list.map(ddCardHTML).join("");
    cont.innerHTML=""; cont.appendChild(grid);
  }

  function ddCardHTML(s){
    var av=s.avance||0;
    return '<button class="dd-card" data-id="'+esc(s.id)+'" type="button">'+
      '<div class="dd-c-top"><span class="dd-cod">'+esc(s.codigo||"—")+'</span>'+
        '<span class="dd-badge est-'+esc(s.estado)+'">'+esc(DD_ESTADOS[s.estado]||s.estado)+'</span></div>'+
      '<h4>'+esc(s.nombre_proyecto||"(sin proyecto)")+'</h4>'+
      '<div class="dd-proj">'+esc(s.nombre_solicita||"")+(s.area?(" · "+esc(s.area)):"")+'</div>'+
      '<div class="dd-badges"><span class="dd-badge pri-'+esc(s.prioridad)+'">Prioridad '+esc(s.prioridad)+'</span></div>'+
      '<div class="dd-prog"><span style="width:'+av+'%"></span></div>'+
      '<div class="dd-prog-t">'+av+'% de avance</div>'+
    '</button>';
  }

  // ---- Formulario nueva solicitud ----
  function ddAbrirForm(){
    var f=$("#ddForm"); if(f) f.reset();
    var w=$("#dd_norma_wrap"); if(w) w.classList.add("hidden");
    ddFormMsg("");
    var hn=$("#hNombre"); var nom=(hn?hn.textContent:"").replace(/^Hola,?\s*/i,"");
    if($("#dd_solicita")) $("#dd_solicita").value=nom||"";
    if($("#dd_fecha")) $("#dd_fecha").value=new Date().toISOString().slice(0,10);
    $("#ddFormBg").classList.remove("hidden");
  }
  function ddCerrarForm(){ var b=$("#ddFormBg"); if(b) b.classList.add("hidden"); }

  async function ddGuardarSolicitud(e){
    e.preventDefault();
    var tipos=[]; document.querySelectorAll("#dd_tipos input:checked").forEach(function(c){ tipos.push(c.value); });
    var obj={
      solicitante_id: usuario&&usuario.id, email_cliente: usuario&&usuario.email,
      nombre_solicita:$("#dd_solicita").value.trim(), area:$("#dd_area").value.trim(),
      contacto:$("#dd_contacto").value.trim(), lugar:$("#dd_lugar").value.trim(),
      nombre_proyecto:$("#dd_proyecto").value.trim(), prioridad:$("#dd_prioridad").value,
      tipos:tipos, descripcion:$("#dd_descripcion").value.trim(),
      requiere_memoria_calculo:$("#dd_memoria").checked, requiere_norma:$("#dd_norma").checked,
      norma_cual:$("#dd_norma_cual").value.trim(), info_adicional:$("#dd_info_adic").value.trim()
    };
    var btn=$("#ddFormGuardar"); if(btn){btn.disabled=true;btn.textContent="Guardando…";}
    try{
      var r=await fetch(URL_SB+"/rest/v1/solicitudes_diseno",{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(obj)});
      if(!r.ok){ var er=await r.json().catch(function(){return {};}); throw new Error(er.message||("HTTP "+r.status)); }
      var rows=await r.json().catch(function(){return [];});
      var creada=(rows&&rows[0])||null;
      ddCerrarForm();
      await cargarDD();
      // Genera el formato MF-F-QHSE-142 diligenciado y lo guarda en Drive/FORMATOS.
      if(creada) ddGenerarFormato(creada);
    }catch(e2){ ddFormMsg("No se pudo guardar: "+(e2.message||e2)); }
    finally{ if(btn){btn.disabled=false;btn.textContent="Radicar solicitud";} }
  }

  // ---- Detalle + entregas ----
  async function ddAbrirDetalle(id){
    var s=DD.data.find(function(x){return x.id===id;}); if(!s) return;
    DD.actual=s;
    $("#ddDetTit").textContent=(s.codigo||"Solicitud")+" · "+(DD_ESTADOS[s.estado]||s.estado);
    $("#ddDetSub").textContent=s.nombre_proyecto||"";
    var tiposH=(s.tipos||[]).map(function(t){return '<span class="dd-tag">'+esc(DD_TIPOS[t]||t)+'</span>';}).join("") || '<span class="dd-empty">—</span>';
    function dt(k,v){ return '<div class="dd-dt"><span class="k">'+esc(k)+'</span><span class="v">'+esc(v==null||v===""?"—":v)+'</span></div>'; }
    $("#ddDetBody").innerHTML=
      '<div style="margin:2px 0 12px"><button class="btn2" id="ddVerFormato" type="button">Ver formato diligenciado &#8599;</button></div>'+
      '<div class="dd-det-grid">'+
        dt("Solicitante",s.nombre_solicita)+dt("Área",s.area)+dt("Contacto",s.contacto)+dt("Lugar",s.lugar)+
        dt("Prioridad",(s.prioridad||"").toUpperCase())+dt("Radicada",ddFecha(s.created_at))+
        dt("Memoria de cálculo",s.requiere_memoria_calculo?"Sí":"No")+
        dt("Norma",s.requiere_norma?("Sí — "+(s.norma_cual||"")):"No")+
      '</div>'+
      '<div class="dd-sec">Tipo de solicitud</div><div class="dd-tags">'+tiposH+'</div>'+
      '<div class="dd-sec">Descripción</div><p style="margin:0;font-size:14px;color:var(--texto);line-height:1.55">'+esc(s.descripcion||"—")+'</p>'+
      (s.info_adicional?('<div class="dd-sec">Información adicional para entrega</div><p style="margin:0;font-size:14px;color:var(--tenue);line-height:1.55">'+esc(s.info_adicional)+'</p>'):'')+
      '<div class="dd-sec">Entregas · '+(s.avance||0)+'% de avance</div><div class="dd-ent-list" id="ddEntList"><div class="dd-empty">Cargando…</div></div>';
    var vf=$("#ddVerFormato"); if(vf) vf.addEventListener("click", function(){ ddVerFormato(s); });
    var box=$("#ddEntregaBox"); if(box) box.classList.toggle("hidden", !esAdmin());
    if(esAdmin()){ $("#dd_ent_avance").value=s.avance||0; $("#dd_ent_desc").value=""; var f=$("#dd_ent_file"); if(f) f.value=""; var fn=$("#ddEntregaBox .fname"); if(fn) fn.textContent=""; ddEntMsg(""); }
    $("#ddDetBg").classList.remove("hidden");
    ddCargarEntregas(s.id);
  }
  function ddCerrarDetalle(){ var b=$("#ddDetBg"); if(b) b.classList.add("hidden"); DD.actual=null; }

  async function ddCargarEntregas(solId){
    var cont=$("#ddEntList"); if(!cont) return;
    try{
      var r=await fetch(URL_SB+"/rest/v1/entregas_diseno?select=*&solicitud_id=eq."+solId+"&order=created_at.desc",{headers:headers()});
      var d=r.ok?await r.json():[];
      if(!d.length){ cont.innerHTML='<div class="dd-empty">Aún no hay entregas registradas.</div>'; return; }
      cont.innerHTML=d.map(function(e){
        var link=e.archivo_path?('<a href="#" class="dd-ent-open" data-path="'+esc(e.archivo_path)+'">Ver entregable ↗</a>'):'';
        return '<div class="dd-ent-item"><div class="h"><b>Entrega '+esc(e.tipo)+'</b>'+
          '<span class="dd-badge est-en_proceso">'+(e.avance||0)+'%</span>'+
          '<span class="fecha">'+esc(ddFechaHora(e.created_at))+'</span></div>'+
          '<p>'+esc(e.descripcion||"")+'</p>'+link+'</div>';
      }).join("");
      cont.querySelectorAll(".dd-ent-open").forEach(function(a){ a.addEventListener("click", function(ev){ ev.preventDefault(); verArchivo(a.getAttribute("data-path")); }); });
    }catch(e){ cont.innerHTML='<div class="dd-empty">No se pudieron cargar las entregas.</div>'; }
  }

  async function ddGuardarEntrega(){
    var s=DD.actual; if(!s) return;
    var fEl=$("#dd_ent_file"), file=fEl&&fEl.files&&fEl.files[0];
    var tipo=$("#dd_ent_tipo").value, avance=parseInt($("#dd_ent_avance").value||"0",10);
    var desc=$("#dd_ent_desc").value.trim(), mail=$("#dd_ent_mail").checked;
    if(!file){ ddEntMsg("Adjunta el archivo del entregable."); return; }
    if(tipo==="total") avance=100;
    if(isNaN(avance)||avance<0) avance=0; if(avance>100) avance=100;
    var btn=$("#ddEntGuardar"); if(btn){btn.disabled=true;btn.textContent="Subiendo a Drive…";}
    try{
      // El entregable se guarda en Drive → carpeta PLANOS/<codigo>. Ese link va al correo.
      var subida=await ddDriveUpload("planos", s.codigo||s.id, file);
      var driveUrl=(subida&&subida.url)||"";
      if(btn) btn.textContent="Guardando…";
      var re=await fetch(URL_SB+"/rest/v1/entregas_diseno",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({solicitud_id:s.id,tipo:tipo,descripcion:desc,avance:avance,archivo_path:driveUrl})});
      if(!re.ok){ var er=await re.json().catch(function(){return {};}); throw new Error(er.message||"No se pudo registrar la entrega"); }
      var nuevoEstado=(tipo==="total")?"entregada":"en_proceso";
      await fetch(URL_SB+"/rest/v1/solicitudes_diseno?id=eq."+s.id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({estado:nuevoEstado,avance:avance,asignado_id:(usuario&&usuario.id)||null})});
      if(mail) await ddEnviarCorreo(s,{tipo:tipo,avance:avance,desc:desc,url:driveUrl});
      s.estado=nuevoEstado; s.avance=avance;
      $("#ddDetTit").textContent=(s.codigo||"Solicitud")+" · "+(DD_ESTADOS[nuevoEstado]||nuevoEstado);
      if(fEl) fEl.value=""; var fn=$("#ddEntregaBox .fname"); if(fn) fn.textContent=""; $("#dd_ent_desc").value="";
      ddCargarEntregas(s.id);
      cargarDD();
      ddEntMsg("Entrega guardada"+(mail?" y correo enviado al cliente.":"."), true);
    }catch(e){ ddEntMsg("Error: "+(e.message||e)); }
    finally{ if(btn){btn.disabled=false;btn.textContent="Guardar entrega y notificar";} }
  }

  async function ddEnviarCorreo(s, ent){
    if(!DRIVE_URL || !s.email_cliente) return;
    var link=(ent&&ent.url)||"";
    var asunto="Diseño y Dibujo · "+(s.codigo||"")+" · Entrega "+ent.tipo+" ("+ent.avance+"%)";
    var cuerpo="Hola "+(s.nombre_solicita||"")+",\n\n"+
      "Tu solicitud de diseño "+(s.codigo||"")+" — "+(s.nombre_proyecto||"")+" — tiene una entrega "+ent.tipo+".\n"+
      "Avance: "+ent.avance+"%\n"+
      (ent.desc?("Detalle de lo realizado: "+ent.desc+"\n"):"")+
      (link?("\nDescarga el entregable aquí:\n"+link+"\n"):"")+
      "\nTambién puedes verlo en NEXUS TOOLS → módulo Diseño y Dibujo.\n\n— Maxim Fishing Solutions";
    try{
      await fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify({action:"send_email",token:DRIVE_TOKEN,to:s.email_cliente,subject:asunto,body:cuerpo})});
    }catch(e){}
  }

  function ddBind(){
    if(_ddBound) return; _ddBound=true;
    document.querySelectorAll("#ddFiltros .dd-fchip").forEach(function(b){
      b.addEventListener("click", function(){
        DD.filtro=b.getAttribute("data-estado")||"";
        document.querySelectorAll("#ddFiltros .dd-fchip").forEach(function(x){ x.classList.toggle("on", x===b); });
        ddRender();
      });
    });
    var lst=$("#ddList"); if(lst) lst.addEventListener("click", function(e){
      var c=e.target.closest && e.target.closest(".dd-card"); if(!c) return;
      ddAbrirDetalle(c.getAttribute("data-id"));
    });
    var nv=$("#ddNueva"); if(nv) nv.addEventListener("click", ddAbrirForm);
    var fx=$("#ddFormX"); if(fx) fx.addEventListener("click", ddCerrarForm);
    var fc=$("#ddFormCancel"); if(fc) fc.addEventListener("click", ddCerrarForm);
    var fb=$("#ddFormBg"); if(fb) fb.addEventListener("click", function(e){ if(e.target===fb) ddCerrarForm(); });
    var frm=$("#ddForm"); if(frm) frm.addEventListener("submit", ddGuardarSolicitud);
    var nrm=$("#dd_norma"); if(nrm) nrm.addEventListener("change", function(){ var w=$("#dd_norma_wrap"); if(w) w.classList.toggle("hidden", !nrm.checked); });
    var dx=$("#ddDetX"); if(dx) dx.addEventListener("click", ddCerrarDetalle);
    var db=$("#ddDetBg"); if(db) db.addEventListener("click", function(e){ if(e.target===db) ddCerrarDetalle(); });
    var eg=$("#ddEntGuardar"); if(eg) eg.addEventListener("click", ddGuardarEntrega);
    var ef=$("#dd_ent_file"); if(ef) ef.addEventListener("change", function(){
      var lab=ef.closest(".dropzone"); if(!lab) return;
      var fn=lab.querySelector(".fname"); if(!fn){ fn=document.createElement("span"); fn.className="fname"; lab.appendChild(fn); }
      fn.textContent=ef.files&&ef.files[0]?("Archivo: "+ef.files[0].name):"";
    });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape"){ ddCerrarForm(); ddCerrarDetalle(); } });
  }

  // ===== Sincronizar COC desde la bandeja de Drive (solo admin) =====
  // Lee la carpeta bandeja, extrae el codigo del nombre, verifica el item,
  // ofrece crear los faltantes, enlaza el COC (documentos_estaticos) y mueve
  // cada archivo a su ruta final Categoria/Tipo/Codigo.
  const CATS_COC = [
    {v:"equipo", t:"Equipo de Presión"},
    {v:"herramienta", t:"Herramienta"},
    {v:"izaje", t:"Izaje"},
    {v:"instrumento", t:"Instrumentación"}
  ];

  // Manda a Apps Script mover/archivar el COC en su ruta final (fire-and-forget).
  function archivarCocDrive(meta){
    if(!DRIVE_URL) return;
    try{
      fetch(DRIVE_URL,{method:"POST",mode:"no-cors",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(Object.assign({token:DRIVE_TOKEN,action:"file_coc"},meta))});
    }catch(e){}
  }

  // Como cargarItemsPorCodigos pero trae tambien categoria_id y tipo_codigo (rutas).
  async function cargarItemsPorCodigosCoc(codigos){
    var mapa={};
    for(var j=0;j<codigos.length;j+=150){
      var sub=codigos.slice(j,j+150);
      if(!sub.length) continue;
      var inlist="("+sub.join(",")+")";
      var ri=await fetch(URL_SB+"/rest/v1/items?select=id,codigo,categoria_id,tipo_codigo,linea_codigo&codigo=in."+encodeURIComponent(inlist),{headers:headers()});
      if(ri.ok){ (await ri.json()||[]).forEach(function(it){ mapa[String(it.codigo).toUpperCase()]=it; }); }
    }
    return mapa;
  }

  // Crea el item minimo a partir del codigo. linea=slice(0,2), tipo=slice(2,5).
  async function crearItemCoc(codigo, categoria){
    codigo=String(codigo||"").toUpperCase();
    if(codigo.length<9) return null;
    var linea=codigo.slice(0,2), tipo=codigo.slice(2,5);
    if(!LINEAS_OK.includes(linea)) return null;
    try{
      var rt=await fetch(URL_SB+"/rest/v1/tipos_item?select=codigo_tipo&codigo_tipo=eq."+encodeURIComponent(tipo)+"&limit=1",{headers:headers()});
      var tt=rt.ok?(await rt.json()||[]):[];
      if(!tt.length){
        await fetch(URL_SB+"/rest/v1/tipos_item",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({codigo_tipo:tipo,nombre:tipo,categoria_id:categoria})});
      }
    }catch(e){}
    var cuerpo={codigo:codigo,linea_codigo:linea,tipo_codigo:tipo,categoria_id:categoria,estado:"activo",cvtools:"CVTOOLS2"};
    var ri=await fetch(URL_SB+"/rest/v1/items",{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify(cuerpo)});
    if(!ri.ok) return null;
    var d=await ri.json().catch(function(){return[];});
    return (d&&d[0])||null;
  }

  // Enlaza (o actualiza) el COC estatico del item con la URL de Drive.
  async function enlazarCoc(it, url){
    var rq=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=id,archivo_path&item_id=eq."+encodeURIComponent(it.id)+"&tipo=eq.coc&limit=1",{headers:headers()});
    var ex=rq.ok?(await rq.json()||[]):[];
    if(ex[0]){
      if(ex[0].archivo_path!==url) await fetch(URL_SB+"/rest/v1/documentos_estaticos?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({archivo_path:url})});
    }else{
      await fetch(URL_SB+"/rest/v1/documentos_estaticos",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({item_id:it.id,tipo:"coc",archivo_path:url})});
    }
  }

  // Modal para decidir que hacer con los codigos sin item.
  // Resuelve: null = cancelar todo | false = solo enlazar existentes | "<categoria>" = crear y enlazar.
  function crearFaltantesCoc(codes){
    return new Promise(function(resolve){
      var o=document.createElement("div");
      o.setAttribute("style","position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:16px");
      var card=document.createElement("div");
      card.setAttribute("style","width:min(460px,100%);background:var(--panel,#101114);border:1px solid var(--borde,#23252A);border-radius:12px;padding:20px;box-sizing:border-box;color:var(--texto,#e6e8ea);font-family:var(--sans);box-shadow:0 18px 50px rgba(0,0,0,.5)");
      var lista=codes.slice(0,40).join(", ")+(codes.length>40?(" …(+"+(codes.length-40)+" más)"):"");
      card.innerHTML='<div style="font-size:15px;font-weight:700;margin-bottom:8px">'+codes.length+' código(s) sin ítem en el inventario</div>'+
        '<div style="font-size:13px;line-height:1.5;color:var(--txt2,#c2c5ca);max-height:120px;overflow:auto;margin-bottom:14px;word-break:break-all">'+esc(lista)+'</div>'+
        '<label style="font-size:13px;display:block;margin-bottom:6px">Crear estos ítems con la categoría:</label>';
      var sel=document.createElement("select");
      sel.setAttribute("style","width:100%;background:var(--negro,#0A0A0B);border:1px solid var(--borde-ctrl,#2a2d33);color:var(--texto,#e6e8ea);padding:11px 12px;border-radius:7px;font-size:15px;box-sizing:border-box;margin-bottom:16px");
      CATS_COC.forEach(function(c){ var op=document.createElement("option"); op.value=c.v; op.textContent=c.t; sel.appendChild(op); });
      card.appendChild(sel);
      var fila=document.createElement("div");
      fila.setAttribute("style","display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap");
      function cerrar(v){ if(o.parentNode)o.parentNode.removeChild(o); resolve(v); }
      var estiloSec="min-height:44px;padding:0 14px;border-radius:7px;border:1px solid var(--borde-ctrl,#2a2d33);background:transparent;color:var(--txt2,#c2c5ca);font-weight:600;font-size:14px;cursor:pointer;font-family:var(--sans)";
      var bCancel=document.createElement("button"); bCancel.type="button"; bCancel.textContent="Cancelar todo"; bCancel.setAttribute("style",estiloSec); bCancel.addEventListener("click",function(){ cerrar(null); }); fila.appendChild(bCancel);
      var bSkip=document.createElement("button"); bSkip.type="button"; bSkip.textContent="Solo enlazar existentes"; bSkip.setAttribute("style",estiloSec); bSkip.addEventListener("click",function(){ cerrar(false); }); fila.appendChild(bSkip);
      var bCrear=document.createElement("button"); bCrear.type="button"; bCrear.textContent="Crear y enlazar"; bCrear.setAttribute("style","min-height:44px;padding:0 16px;border-radius:7px;border:1px solid var(--naranja,#FF6600);background:var(--naranja,#FF6600);color:var(--sobre-acento,#000);font-weight:700;font-size:14px;cursor:pointer;font-family:var(--sans)"); bCrear.addEventListener("click",function(){ cerrar(sel.value); }); fila.appendChild(bCrear);
      card.appendChild(fila);
      o.appendChild(card); document.body.appendChild(o);
    });
  }

  async function sincronizarCoc(){
    if(!esAdmin()) return;
    if(!(await uiConfirm("¿Buscar COC nuevos en la carpeta de Drive, verificar los códigos y enlazarlos a cada herramienta?",{ok:"Buscar"}))) return;
    var t=ndtToast("Consultando carpeta de COC…");
    try{
      var resp=await driveListCoc("");
      if(!resp || !resp.ok) throw new Error((resp&&resp.error)||"respuesta inválida de Drive");
      var archivos=resp.archivos||[], pares=[], sinCodigo=0;
      archivos.forEach(function(a){
        var cods=extraerCodigosNombre(a.n);
        if(!cods.length){ sinCodigo++; return; }
        cods.forEach(function(c){ pares.push({codigo:String(c).toUpperCase(), file:a}); });
      });
      if(!pares.length){ t.set("No se encontraron COC con código válido en el nombre."+(sinCodigo?(" ("+sinCodigo+" sin código)"):""), false); return; }

      var codigos=[...new Set(pares.map(function(p){return p.codigo;}))];
      t.set("Verificando "+codigos.length+" código(s) en el inventario…");
      var mapa=await cargarItemsPorCodigosCoc(codigos);

      var faltantes=codigos.filter(function(c){ return !mapa[c]; });
      if(faltantes.length){
        var cat=await crearFaltantesCoc(faltantes);
        if(cat===null){ t.set("Cancelado. No se enlazó ningún COC.", false); return; }
        if(cat){
          t.set("Creando "+faltantes.length+" ítem(s) faltante(s)…");
          for(var i=0;i<faltantes.length;i++){
            var nit=await crearItemCoc(faltantes[i],cat);
            if(nit) mapa[String(nit.codigo).toUpperCase()]=nit;
          }
        }
      }

      var enlazados=0, sinItem=0, vistos={}, totalPares=pares.length;
      for(var k=0;k<pares.length;k++){
        var reg=pares[k], it=mapa[reg.codigo];
        if(!it){ sinItem++; continue; }
        var clave=String(it.id)+"|"+reg.file.i;
        if(vistos[clave]) continue; vistos[clave]=true;
        var driveUrl="https://drive.google.com/file/d/"+reg.file.i+"/view";
        await enlazarCoc(it, driveUrl);
        archivarCocDrive({categoria:it.categoria_id||"herramienta", tipo_codigo:it.tipo_codigo||"SINTIPO", codigo:it.codigo, file_id:reg.file.i, filename:reg.file.n});
        enlazados++;
        if(enlazados===1 || enlazados%25===0) t.set("Enlazando COC… "+(k+1)+"/"+totalPares);
      }
      t.set("Listo · "+enlazados+" COC enlazados · "+sinItem+" sin ítem"+(sinCodigo?(" · "+sinCodigo+" sin código"):"")+".", true);
      try{ if(PANELES && PANELES.resumen && PANELES.resumen.load) PANELES.resumen.load(); }catch(e){}
    }catch(e){ t.set("Error COC: "+(e.message||e), false); }
  }

  function ndtToast(msg){
    var d=document.getElementById("ndtToast");
    if(!d){ d=document.createElement("div"); d.id="ndtToast";
      d.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:var(--bg-panel,#141414);border:1px solid var(--acento,#FF6600);color:var(--txt-1,#fff);padding:12px 18px;border-radius:10px;max-width:92%;font-size:14px;line-height:1.35;box-shadow:0 8px 28px rgba(0,0,0,.55)";
      document.body.appendChild(d); }
    d.textContent=msg;
    return { set:function(m,ok){ d.textContent=m; d.style.borderColor = ok===true?"#35c26a":(ok===false?"#e2483f":"var(--acento,#FF6600)"); if(ok!==undefined){ setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, 9000); } } };
  }

  async function cargarItemsPorCodigos(codigos){
    var mapa={};
    for(var j=0;j<codigos.length;j+=150){
      var sub=codigos.slice(j,j+150);
      if(!sub.length) continue;
      var inlist="("+sub.join(",")+")";
      var ri=await fetch(URL_SB+"/rest/v1/items?select=id,codigo,linea_codigo&codigo=in."+encodeURIComponent(inlist),{headers:headers()});
      if(ri.ok){ (await ri.json()||[]).forEach(function(it){ mapa[String(it.codigo).toUpperCase()]=it; }); }
    }
    return mapa;
  }

  // Reutiliza un ciclo vigente que ya contenga NDT o PH.
  // Si llega el otro documento después, ambos quedan en el MISMO ciclo.
  // La fecha del ciclo queda en la más antigua entre los documentos.
  async function obtenerOCrearCicloInspeccion(it, fecha, tipoDoc, archivo){
    var ciclos=[];
    var r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id,fecha_realizado,metodo,datos_formulario&item_id=eq."+encodeURIComponent(it.id)+"&vigente=eq.true&order=fecha_realizado.desc&limit=20",{headers:headers()});
    if(r.ok) ciclos=await r.json();

    var elegido=null;
    if(ciclos.length){
      var ids=ciclos.map(function(c){return c.id;}).filter(Boolean);
      var docs=[];
      if(ids.length){
        var dr=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,ciclo_id,tipo&ciclo_id=in.("+ids.join(",")+")&tipo=in.(ndt,prueba_presion)",{headers:headers()});
        if(dr.ok) docs=await dr.json();
      }
      var conInspeccion={}; docs.forEach(function(d){conInspeccion[d.ciclo_id]=true;});
      elegido=ciclos.find(function(c){ return conInspeccion[c.id] || ((c.datos_formulario||{}).origen==="ndt_sync") || ((c.datos_formulario||{}).origen==="ph_sync") || ((c.datos_formulario||{}).origen==="inspeccion_sync"); }) || null;
    }

    if(elegido){
      var actual=elegido.fecha_realizado||fecha;
      var fechaFinal=(fecha && actual && fecha<actual)?fecha:actual;
      var datos=Object.assign({},elegido.datos_formulario||{});
      datos.origen="inspeccion_sync";
      datos.archivo=archivo||datos.archivo||null;
      var pr=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?id=eq."+encodeURIComponent(elegido.id),{
        method:"PATCH",headers:headers({"Prefer":"return=minimal"}),
        body:JSON.stringify({fecha_realizado:fechaFinal,datos_formulario:datos})
      });
      if(!pr.ok) throw new Error("No se pudo actualizar el ciclo de mantenimiento.");
      return elegido.id;
    }

    var origen=tipoDoc==="ndt"?"ndt_sync":"ph_sync";
    var rr=await fetch(URL_SB+"/rest/v1/rpc/renovar_mantenimiento",{
      method:"POST",headers:headers(),
      body:JSON.stringify({
        p_item_id:it.id,
        p_linea_codigo:it.linea_codigo,
        p_fecha_realizado:fecha,
        p_metodo:tipoDoc==="ndt"?"ndt":"ph",
        p_datos:{origen:origen,archivo:archivo}
      })
    });
    if(!rr.ok){ var er=await rr.json().catch(function(){return{};}); throw new Error(er.message||"No se pudo crear el ciclo."); }
    return await rr.json();
  }

  async function enlazarDocumentoInspeccion(it, fecha, tipoDoc, archivo, driveUrl){
    var ciclo=await obtenerOCrearCicloInspeccion(it,fecha,tipoDoc,archivo);
    // La tabla de sincronización evita reprocesar el mismo archivo por equipo.
    var ex=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id&ciclo_id=eq."+encodeURIComponent(ciclo)+"&tipo=eq."+encodeURIComponent(tipoDoc)+"&archivo_path=eq."+encodeURIComponent(driveUrl)+"&limit=1",{headers:headers()});
    var existe=ex.ok && (await ex.json()||[]).length>0;
    if(!existe){
      var ir=await fetch(URL_SB+"/rest/v1/documentos_dinamicos",{
        method:"POST",headers:headers({"Prefer":"return=minimal"}),
        body:JSON.stringify({ciclo_id:ciclo,tipo:tipoDoc,archivo_path:driveUrl})
      });
      if(!ir.ok) throw new Error("No se pudo guardar el documento en el ciclo.");
    }
    return ciclo;
  }

  async function sincronizarNdt(){
    if(!esAdmin()) return;
    if(!(await uiConfirm("¿Buscar certificados NDT nuevos en Drive y enlazarlos como mantenimiento?",{ok:"Buscar"}))) return;
    var t=ndtToast("Consultando Drive…");
    try{
      var resp=await driveListNdt("");
      if(!resp || !resp.ok) throw new Error((resp&&resp.error)||"respuesta inválida de Drive");
      var archivos=resp.archivos||[], filas=[];
      archivos.forEach(function(a){
        var p=parseNdtName(a.n); if(!p || !p.fecha || !p.codigos.length) return;
        // Se conserva el comportamiento histórico de NDT: un código principal por archivo.
        filas.push({codigo_item:p.codigos[0],metodo:p.metodo,fecha:p.fecha,nombre_archivo:a.n,drive_file_id:a.i,drive_url:"https://drive.google.com/file/d/"+a.i+"/view"});
      });
      if(!filas.length){ t.set("No se encontraron archivos NDT con código y fecha válidos.", false); return; }
      t.set("Drive: "+archivos.length+" archivos. Guardando nuevos…");
      var nuevos=[];
      for(var i=0;i<filas.length;i+=500){
        var lote=filas.slice(i,i+500);
        var rr=await fetch(URL_SB+"/rest/v1/certificados_ndt?on_conflict=nombre_archivo",{method:"POST",headers:headers({"Prefer":"resolution=ignore-duplicates,return=representation"}),body:JSON.stringify(lote)});
        if(rr.ok){var d=await rr.json();if(Array.isArray(d))nuevos=nuevos.concat(d);}
      }
      if(!nuevos.length){ t.set("Todo al día: no hay certificados NDT nuevos.", true); return; }
      var codigos=[...new Set(nuevos.map(function(x){return String(x.codigo_item).toUpperCase();}))];
      var mapaItem=await cargarItemsPorCodigos(codigos), enlazados=0, sinItem=0;
      for(var k=0;k<nuevos.length;k++){
        var reg=nuevos[k], it=mapaItem[String(reg.codigo_item).toUpperCase()];
        if(!it){sinItem++;continue;}
        await enlazarDocumentoInspeccion(it,reg.fecha,"ndt",reg.nombre_archivo,reg.drive_url);
        enlazados++;
      }
      t.set("Listo · "+nuevos.length+" NDT nuevos · "+enlazados+" enlaces creados · "+sinItem+" sin ítem en inventario.", true);
      try{actualizarAlertas();}catch(e){}
    }catch(e){t.set("Error NDT: "+(e.message||e),false);}
  }

  async function sincronizarPh(){
    if(!esAdmin()) return;
    if(!(await uiConfirm("¿Buscar pruebas hidrostáticas nuevas en Drive y enlazarlas a todos los equipos indicados en cada archivo?",{ok:"Buscar"}))) return;
    var t=ndtToast("Consultando carpeta de PH…");
    try{
      var resp=await driveListPh("");
      if(!resp || !resp.ok) throw new Error((resp&&resp.error)||"respuesta inválida de Drive");
      var archivos=resp.archivos||[], filas=[];
      archivos.forEach(function(a){
        var p=parsePhName(a.n); if(!p || !p.fecha) return;
        p.codigos.forEach(function(c){ filas.push({codigo_item:c,fecha:p.fecha,nombre_archivo:a.n,drive_file_id:a.i,drive_url:"https://drive.google.com/file/d/"+a.i+"/view"}); });
      });
      if(!filas.length){ t.set("No se encontraron PH con códigos y fecha válidos en el nombre.", false); return; }
      t.set("Drive: "+archivos.length+" archivos · "+filas.length+" relaciones archivo/equipo. Guardando nuevos…");
      var nuevos=[];
      for(var i=0;i<filas.length;i+=500){
        var lote=filas.slice(i,i+500);
        var rr=await fetch(URL_SB+"/rest/v1/certificados_ph?on_conflict=drive_file_id,codigo_item",{method:"POST",headers:headers({"Prefer":"resolution=ignore-duplicates,return=representation"}),body:JSON.stringify(lote)});
        if(!rr.ok){var ee=await rr.json().catch(function(){return{};});throw new Error(ee.message||"No se pudo registrar PH en Supabase.");}
        var d=await rr.json();if(Array.isArray(d))nuevos=nuevos.concat(d);
      }
      if(!nuevos.length){ t.set("Todo al día: no hay PH nuevas.", true); return; }
      var codigos=[...new Set(nuevos.map(function(x){return String(x.codigo_item).toUpperCase();}))];
      var mapaItem=await cargarItemsPorCodigos(codigos), enlazados=0, sinItem=0;
      for(var k=0;k<nuevos.length;k++){
        var reg=nuevos[k], it=mapaItem[String(reg.codigo_item).toUpperCase()];
        if(!it){sinItem++;continue;}
        await enlazarDocumentoInspeccion(it,reg.fecha,"prueba_presion",reg.nombre_archivo,reg.drive_url);
        enlazados++;
      }
      t.set("Listo · "+nuevos.length+" PH nuevas · "+enlazados+" equipos enlazados · "+sinItem+" códigos sin ítem en inventario.", true);
      try{actualizarAlertas();}catch(e){}
    }catch(e){t.set("Error PH: "+(e.message||e),false);}
  }
  async function borrarStorage(path){
    if(!path || /^https?:\/\//i.test(path)) return;
    try{ await fetch(URL_SB+"/storage/v1/object/documentos/"+encPath(path),{method:"DELETE",headers:headers()}); }catch(e){}
  }
  async function subirArchivo(path, file){
    const r = await fetch(URL_SB+"/storage/v1/object/documentos/"+encPath(path),{
      method:"POST",
      headers:{ "apikey":KEY, "Authorization":"Bearer "+token, "x-upsert":"true", "Content-Type": file.type||"application/pdf" },
      body: file });
    if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.message||"upload"); }
    return path;
  }

  async function registrarPdfReporteEnCiclo(url){
    if(!cicloVigente || !url) return;
    var rq=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id&ciclo_id=eq."+cicloVigente.id+"&tipo=eq.reporte_mantenimiento",{headers:headers()});
    var ex=rq.ok?await rq.json():[];
    if(ex&&ex[0]) await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({archivo_path:url})});
    else await fetch(URL_SB+"/rest/v1/documentos_dinamicos",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({ciclo_id:cicloVigente.id,tipo:"reporte_mantenimiento",archivo_path:url})});
  }

  // ===== Generación del PDF corporativo MF-F-MTO-025 =====
  // Se envía el formulario al Apps Script por no-cors y luego se consulta
  // el PDF generado mediante JSONP. Así no se expone ninguna credencial de Drive.
  function generarPdfMantenimiento(datos, ciclo){
    return new Promise(async function(resolve,reject){
      try{
        if(!DRIVE_URL) throw new Error("Drive no está configurado.");
        var nombre="MF-F-MTO-025_"+String(datos.n_reporte||ciclo)+".pdf";
        var payload={
          action:"generate_report", token:DRIVE_TOKEN,
          categoria:itemActual.categoria_id||"herramienta",
          tipo_codigo:itemActual.tipo_codigo||"SINTIPO",
          codigo:itemActual.codigo||"",
          ciclo:String(ciclo), filename:nombre,
          datos:Object.assign({},datos,{fecha_reporte:datos.fecha_reporte||$("#wl_fecha").value||hoyISO()}),
          item:{codigo:itemActual.codigo||"",descripcion:itemActual.descripcion||"",nombre:itemActual.descripcion||"",categoria_id:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO"}
        };
        await fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
        var inicio=Date.now();
        function buscar(){
          var cb="__findReport"+Date.now()+Math.floor(Math.random()*1000);
          var script=document.createElement("script"), terminado=false;
          function limpiar(){ try{delete window[cb];}catch(e){window[cb]=undefined;} if(script.parentNode)script.parentNode.removeChild(script); }
          window[cb]=function(r){ limpiar(); if(r&&r.error) reject(new Error(r.error)); else if(r&&r.found&&r.url) resolve(r); else if(Date.now()-inicio>60000) reject(new Error("El PDF tardó demasiado en generarse.")); else setTimeout(buscar,1200); };
          script.onerror=function(){ limpiar(); if(Date.now()-inicio>60000) reject(new Error("No se pudo consultar el PDF generado.")); else setTimeout(buscar,1500); };
          script.src=DRIVE_URL+"?action=find_report&token="+encodeURIComponent(DRIVE_TOKEN)+"&callback="+cb+
            "&categoria="+encodeURIComponent(payload.categoria)+"&tipo_codigo="+encodeURIComponent(payload.tipo_codigo)+"&codigo="+encodeURIComponent(payload.codigo)+"&ciclo="+encodeURIComponent(payload.ciclo)+"&filename="+encodeURIComponent(nombre);
          document.body.appendChild(script);
        }
        buscar();
      }catch(e){ reject(e); }
    });
  }
  async function verArchivo(path){
    if(/^https?:\/\//i.test(path)){ window.open(path,"_blank","noopener"); return; }
    try{
      const r=await fetch(URL_SB+"/storage/v1/object/sign/documentos/"+encPath(path),{
        method:"POST", headers:headers(), body:JSON.stringify({expiresIn:3600})});
      const d=await r.json();
      if(d && d.signedURL){ window.open(URL_SB+"/storage/v1"+d.signedURL, "_blank"); }
      else { mostrarMsg("No se pudo abrir el archivo.", false); }
    }catch(e){ mostrarMsg("No se pudo abrir el archivo.", false); }
  }
  // ===== Descargar ficha (hoja de vida) como PDF con enlaces de larga duración =====
  const LINK_EXPIRA = 31536000; // ~1 año en segundos
  async function firmarLargo(path){
    if(!path) return "";
    if(/^https?:\/\//i.test(path)) return path; // enlaces de Drive: se usan tal cual
    try{
      const r=await fetch(URL_SB+"/storage/v1/object/sign/documentos/"+encPath(path),{method:"POST",headers:headers(),body:JSON.stringify({expiresIn:LINK_EXPIRA})});
      const d=await r.json();
      if(d && d.signedURL) return URL_SB+"/storage/v1"+d.signedURL;
    }catch(e){}
    return "";
  }
  function nombreBase(id){ for(var i=0;i<bases.length;i++){ if(String(bases[i].id)===String(id)) return bases[i].nombre; } return ""; }
  function nombreUnidad(id){ for(var i=0;i<unidades.length;i++){ if(String(unidades[i].id)===String(id)) return unidades[i].nombre; } return ""; }
  async function fichaDescargarPDF(){
    if(!itemActual) return;
    const it=itemActual; const btn=$("#mDescargarPDF"); const txt=btn?btn.textContent:"";
    if(btn){ btn.disabled=true; btn.textContent="Generando…"; }
    try{
      // 1) Documentos estáticos del ítem
      var est=[]; try{ var re=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=id,tipo,archivo_path&item_id=eq."+it.id,{headers:headers()}); est=re.ok?await re.json():[]; }catch(e){}
      var estMap={}; est.forEach(function(d){estMap[d.tipo]=d;});
      // 2) Documentos heredados del fabricante
      var fmap={}, fab=String(it.fabricante||"").trim(), tc=it.tipo_codigo||"";
      if(fab&&tc){ try{ var rf=await fetch(URL_SB+"/rest/v1/documentos_fabricante?select=tipo,archivo_path&fabricante=eq."+encodeURIComponent(fab)+"&tipo_codigo=eq."+encodeURIComponent(tc),{headers:headers()}); if(rf.ok){ (await rf.json()||[]).forEach(function(d){ fmap[d.tipo]=d; }); } }catch(e){} }
      // 3) Ciclos + documentos dinámicos
      var ciclos=[]; try{ var rc=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id,fecha_realizado,fecha_vencimiento,vigente,datos_formulario&item_id=eq."+it.id+"&order=fecha_realizado.desc&limit=50",{headers:headers()}); ciclos=rc.ok?await rc.json():[]; }catch(e){}
      var cids=ciclos.map(function(x){return x.id;}).filter(Boolean); var din=[];
      if(cids.length){ try{ var rd=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,ciclo_id,tipo,archivo_path&ciclo_id=in.("+cids.join(",")+")",{headers:headers()}); din=rd.ok?await rd.json():[]; }catch(e){} }
      var dinPor={}; din.forEach(function(q){(dinPor[q.ciclo_id]||(dinPor[q.ciclo_id]=[])).push(q);});
      // 4) Firmar TODOS los archivos (larga duración) en paralelo
      var todos=[]; est.forEach(function(d){if(d.archivo_path)todos.push(d.archivo_path);});
      Object.keys(fmap).forEach(function(k){if(fmap[k].archivo_path)todos.push(fmap[k].archivo_path);});
      din.forEach(function(d){if(d.archivo_path)todos.push(d.archivo_path);});
      var unicos=todos.filter(function(v,i){return v && todos.indexOf(v)===i;});
      var firmadas={}; await Promise.all(unicos.map(function(p){ return firmarLargo(p).then(function(u){ firmadas[p]=u; }); }));
      // 5) Armar contenido
      var nombres={reporte_mantenimiento:'Reporte de mantenimiento',reporte_falla:'Reporte de falla',ndt:'Reporte NDT',prueba_presion:'PH',espesores:'Espesores',prueba_dureza:'Prueba de dureza',certificado_inspeccion:'Certificado de inspección'};
      var ESTLBL={coc:'COC',ficha_tecnica:'Ficha técnica',manual:'Manual O&M'};
      var estadoLbl={activo:'Activo',en_mantenimiento:'En mantenimiento',fuera_servicio:'Fuera de servicio',inactivo:'Inactivo'};
      var catLbl=(String(it.categoria_id||'herramienta')==='equipo')?'Equipo de Presión':(String(it.categoria_id||'herramienta')==='izaje'?'Izaje':(String(it.categoria_id||'herramienta')==='instrumento'?'Instrumentación':'Herramienta'));
      var linea=GRUPO[String(it.linea_codigo||'').toUpperCase()]||(it.linea_codigo||'');
      function fLink(p){ var u=p?firmadas[p]:''; if(p && /^https?:\/\//i.test(p)) u=p; return u; }
      function docRow(nombre, doc, tag){
        if(!doc||!doc.archivo_path) return '<tr><td>'+esc(nombre)+'</td><td class="no">Sin cargar</td></tr>';
        var u=fLink(doc.archivo_path);
        var cell = u ? '<a href="'+esc(u)+'">Abrir documento</a>' : '<span class="no">Enlace no disponible</span>';
        return '<tr><td>'+esc(nombre)+(tag?' <span class="tag">'+esc(tag)+'</span>':'')+'</td><td>'+cell+'</td></tr>';
      }
      // Estado de mantenimiento vigente
      var vig=ciclos.filter(function(c){return c.vigente;})[0]; var mantTxt='Sin mantenimiento registrado.';
      if(vig){ var v=new Date(vig.fecha_vencimiento), hoy=new Date(hoyISO()); var dias=Math.round((v-hoy)/86400000);
        var est2= dias<0?('VENCIDO hace '+Math.abs(dias)+' días'):(dias<=10?('Por vencer en '+dias+' días'):('Al día · '+dias+' días'));
        mantTxt='Último: '+fechaDMY(vig.fecha_realizado)+' · Vence: '+fechaDMY(vig.fecha_vencimiento)+' · '+est2; }
      // Datos del ítem
      var datosRows=[
        ['Código', it.codigo],['S/N', it.sn],['Tipo / Nombre', (it.tipos_item&&it.tipos_item.nombre)||it.tipo_codigo||''],
        ['Descripción', it.descripcion],['Fabricante', it.fabricante],['Medida', it.medida],['Año', it.anio],
        ['Presión', it.presion],['Categoría', catLbl],['Línea', linea],['Estado', estadoLbl[it.estado]||it.estado||''],
        ['Base', nombreBase(it.base_id)],['Unidad', nombreUnidad(it.unidad_id)]
      ].map(function(p){ return '<tr><td class="k">'+esc(p[0])+'</td><td>'+(esc(p[1])||'—')+'</td></tr>'; }).join('');
      // Estáticos (propios o heredados del fabricante)
      var estRows=['coc','ficha_tecnica','manual'].map(function(k){
        if(estMap[k]) return docRow(ESTLBL[k],estMap[k]);
        if(fmap[k]) return docRow(ESTLBL[k],fmap[k],'del fabricante');
        return docRow(ESTLBL[k],null);
      }).join('');
      // Ciclos
      var ciclosHTML = ciclos.length ? ciclos.map(function(x){
        var dd=x.datos_formulario||{}; var tr=String(dd.tipo_mantenimiento||'').toLowerCase(); var pr=String(dd.ciclo_preventivo||'').toUpperCase();
        var lbl='Mantenimiento'; if(tr==='correctivo')lbl='Correctivo'; else if(tr==='preventivo')lbl='Preventivo'+(pr?' '+pr:'');
        var estCiclo=x.vigente?'<span class="vig">VIGENTE</span>':'<span class="his">HISTÓRICO</span>';
        var dl=dinPor[x.id]||[];
        var filas = dl.length ? dl.map(function(q){ return docRow(nombres[q.tipo]||q.tipo, q); }).join('') : '<tr><td colspan="2" class="no">Sin documentos en este ciclo.</td></tr>';
        return '<div class="ciclo"><div class="ciclo-h"><b>'+esc(lbl)+'</b> / '+esc(fechaDMY(x.fecha_realizado))+' &nbsp; '+estCiclo+'</div><table class="tdocs">'+filas+'</table></div>';
      }).join('') : '<p class="no">Sin historial de mantenimiento registrado.</p>';

      var titulo=esc(it.codigo||'Ítem');
      var html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
        '<title>Ficha '+titulo+'</title><style>'+
        '*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px;background:#fff;font-size:13px}'+
        '.head{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #FF6600;padding-bottom:12px;margin-bottom:8px}'+
        '.brand{font-size:22px;font-weight:900;letter-spacing:.02em}.brand span{color:#FF6600}'+
        '.brand small{display:block;font-size:10px;font-weight:600;color:#666;letter-spacing:.14em;margin-top:2px}'+
        '.doct{text-align:right;font-size:11px;color:#555}.doct b{color:#111;font-size:14px}'+
        'h1{font-size:19px;margin:14px 0 2px}.cod{font-family:monospace;color:#FF6600;font-weight:700}'+
        '.sec{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#FF6600;font-weight:800;margin:20px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}'+
        'table{width:100%;border-collapse:collapse;margin:0}td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}'+
        '.k{width:34%;color:#666;font-weight:600}'+
        '.tdocs td:first-child{width:60%}.tdocs a{color:#0a58ca;text-decoration:underline;font-weight:600}'+
        '.no{color:#999;font-style:italic}.tag{display:inline-block;font-size:10px;background:#fff3e6;color:#c15800;border:1px solid #ffd9b0;border-radius:4px;padding:1px 6px;margin-left:6px}'+
        '.mant{background:#f7f7f8;border:1px solid #e6e6e9;border-radius:8px;padding:10px 12px;font-size:13px}'+
        '.ciclo{border:1px solid #e6e6e9;border-radius:8px;margin-bottom:10px;overflow:hidden}'+
        '.ciclo-h{background:#fafafa;padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}'+
        '.vig{color:#1f9d55;font-weight:700;font-size:11px}.his{color:#888;font-weight:700;font-size:11px}'+
        '.foot{margin-top:22px;padding-top:10px;border-top:1px solid #eee;font-size:10px;color:#888;line-height:1.5}'+
        '.pbtn{position:fixed;top:14px;right:14px;background:#FF6600;color:#180a00;border:0;padding:10px 18px;border-radius:8px;font-weight:800;font-size:14px;cursor:pointer}'+
        '@media print{.pbtn{display:none}body{padding:0 6px}.ciclo,.mant,table{page-break-inside:avoid}}'+
        '</style></head><body>'+
        '<button class="pbtn" onclick="window.print()">Descargar / Imprimir PDF</button>'+
        '<div class="head"><div class="brand">MAXIM<span>·</span>NEXUS<small>MAXIM FISHING SOLUTIONS</small></div>'+
        '<div class="doct"><b>HOJA DE VIDA</b><br>Ítem: '+titulo+'<br>Generado: '+esc(fechaDMY(hoyISO()))+'</div></div>'+
        '<h1>Ficha del ítem <span class="cod">'+titulo+'</span></h1>'+
        '<div class="sec">Datos del ítem</div><table>'+datosRows+'</table>'+
        '<div class="sec">Estado de mantenimiento</div><div class="mant">'+esc(mantTxt)+'</div>'+
        '<div class="sec">Documentos estáticos</div><table class="tdocs">'+estRows+'</table>'+
        '<div class="sec">Historial de mantenimiento y documentos por ciclo</div>'+ciclosHTML+
        '<div class="foot">Documento generado por NEXUS · Maxim Fishing Solutions. Los enlaces "Abrir documento" son de acceso directo y caducan aproximadamente en 1 año; trátalos como información interna y no los compartas fuera de la empresa. Los documentos NDT/PH alojados en Google Drive se abren según los permisos de Drive.</div>'+
        '</body></html>';

      var w=window.open("","_blank");
      if(!w){ mostrarMsg("Permite las ventanas emergentes para descargar el PDF.", false); return; }
      w.document.open(); w.document.write(html); w.document.close(); w.focus();
      setTimeout(function(){ try{ w.print(); }catch(e){} }, 500);
      mostrarMsg("Ficha lista. Elige “Guardar como PDF” en el diálogo de impresión.", true);
    }catch(e){ mostrarMsg("No se pudo generar la ficha en PDF.", false); }
    finally{ if(btn){ btn.disabled=false; btn.textContent=txt||"⬇ Descargar PDF"; } }
  }
  (function(){ var b=$("#mDescargarPDF"); if(b) b.addEventListener("click", fichaDescargarPDF); })();
  function slotHTML(scope, tipoObj, doc, permiteSubir){
    const tiene=!!doc; let acc="";
    if(tiene) acc+='<a href="#" data-ver="'+esc(doc.archivo_path)+'">Ver</a>';
    if(permiteSubir) acc+='<button class="'+(tiene?"rep":"up")+'" data-sub="'+scope+':'+tipoObj.k+'">'+(tiene?"Reemplazar":"Subir")+'</button>';
    if(tiene && permiteSubir) acc+='<button class="btn-del-doc" type="button" data-del="'+scope+':'+tipoObj.k+'" data-del-id="'+esc(doc.id)+'" data-del-path="'+esc(doc.archivo_path)+'">Eliminar</button>';
    return '<div class="slot"><span class="sn">'+tipoObj.t+'</span><span class="est'+(tiene?" ok":"")+'">'+(tiene?"Cargado":"Sin cargar")+'</span>'+acc+'</div>';
  }
  function enlazarSlots(cont){
    cont.querySelectorAll("[data-ver]").forEach(function(a){a.addEventListener("click",function(e){e.preventDefault();verArchivo(a.getAttribute("data-ver"));});});
    cont.querySelectorAll("[data-sub]").forEach(function(b){b.addEventListener("click",function(){
      const partes=b.getAttribute("data-sub").split(":"); pendiente={scope:partes[0],tipo:partes[1]};
      $("#filePicker").value=""; $("#filePicker").click();
    });});
    cont.querySelectorAll("[data-del]").forEach(function(b){b.addEventListener("click",async function(){
      const partes=b.getAttribute("data-del").split(":");
      const id=b.getAttribute("data-del-id"), path=b.getAttribute("data-del-path");
      await eliminarDocumento(partes[0],partes[1],id,path);
    });});
  }
  async function eliminarDocumento(scope,tipo,id,path){
    if(!puedeMant() && !esAdmin()) return;
    if(!id){mostrarMsg("No se puede eliminar: documento sin identificador.",false);return;}
    if(!(await uiConfirm("¿Eliminar este documento?",{ok:"Eliminar",peligro:true}))) return;
    try{
      // Archivos sincronizados desde NDT/PH tienen URL de Drive: se desvinculan
      // del ciclo, pero no se borra el certificado original de la carpeta fuente.
      if(path && !/^https?:\/\//i.test(path)){
        await fetch(URL_SB+"/storage/v1/object/documentos/"+encPath(path),{method:"DELETE",headers:headers()});
      }
      var r=scope==="est"
        ? await fetch(URL_SB+"/rest/v1/documentos_estaticos?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:headers()})
        : await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:headers()});
      if(!r.ok) throw new Error("No se pudo eliminar el registro del documento.");
      // Borra el reflejo en Drive cuando es un archivo administrado por NEXUS.
      if(DRIVE_URL){
        var esArchivoNexus = path && !/^https?:\/\//i.test(path);
        var esPdfCorporativo = (scope==="din" && tipo==="reporte_mantenimiento" && path && /^https?:\/\//i.test(path));
        if(esArchivoNexus || esPdfCorporativo){
          try{
            var nombreDrive = scope==="est" ? ("estatico_"+tipo) : (tipo==="reporte_mantenimiento" ? ("MF-F-MTO-025_"+String((cicloDatos||{}).n_reporte||cicloVigente.id)+".pdf") : ("dinamico_"+tipo));
            await fetch(DRIVE_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({
              action:"delete_file",token:DRIVE_TOKEN,categoria:itemActual.categoria_id||"herramienta",
              tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,
              ciclo:(scope==="din"&&cicloVigente)?cicloVigente.id:null,filename:nombreDrive
            })});
          }catch(_e){}
        }
      }
      mostrarMsg("Documento eliminado.",true);
      if(scope==="est") cargarDocsEstaticos(); else cargarDocsDinamicos();
    }catch(e){mostrarMsg(e.message||"No se pudo eliminar el documento.",false);}
  }
  async function cargarDocsEstaticos(){
    const cont=$("#mDocsEst"); cont.innerHTML='<div class="est" style="color:var(--tenue);font-size:13px">Consultando…</div>';
    let docs=[];
    try{ const r=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=id,tipo,archivo_path&item_id=eq."+itemActual.id,{headers:headers()}); if(r.ok) docs=await r.json(); }catch(e){}
    const mapa={}; docs.forEach(d=>mapa[d.tipo]=d);
    const fab=String(itemActual.fabricante||"").trim(), tc=itemActual.tipo_codigo||"";
    const fmapa={};
    if(fab && tc){
      try{ const rf=await fetch(URL_SB+"/rest/v1/documentos_fabricante?select=tipo,archivo_path&fabricante=eq."+encodeURIComponent(fab)+"&tipo_codigo=eq."+encodeURIComponent(tc),{headers:headers()}); if(rf.ok){ (await rf.json()||[]).forEach(function(d){ fmapa[d.tipo]=d; }); } }catch(e){}
    }
    cont.innerHTML = ESTATICOS.map(function(x){
      if(!mapa[x.k] && fmapa[x.k]) return slotHeredado(x, fmapa[x.k]);
      return slotHTML("est",x,mapa[x.k],esAdmin());
    }).join("");
    enlazarSlots(cont);
  }
  function slotHeredado(tipoObj, doc){
    let acc='<a href="#" data-ver="'+esc(doc.archivo_path)+'">Ver</a>';
    if(esAdmin()) acc+='<button class="rep" data-sub="est:'+tipoObj.k+'">Subir propio</button>';
    return '<div class="slot"><span class="sn">'+tipoObj.t+'</span><span class="est ok">Del fabricante</span>'+acc+'</div>';
  }
  async function cargarDocsDinamicos(){
    const cont=$("#mDocsDin");
    if(!cicloVigente){ cont.innerHTML=""; return; }
    let docs=[];
    try{ const r=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,tipo,archivo_path&ciclo_id=eq."+cicloVigente.id,{headers:headers()}); if(r.ok) docs=await r.json(); }catch(e){}
    const mapa={}; docs.forEach(d=>mapa[d.tipo]=d);
    const t=(cicloDatos||{}).tipo_mantenimiento, p=(cicloDatos||{}).ciclo_preventivo;
    let keys=[];
    if(esIzaje()||t==="recertificacion") keys=["certificado_inspeccion"];
    else if(t==="correctivo") keys=["reporte_mantenimiento","reporte_falla"];
    else if(t==="preventivo"&&p==="C2") keys=["reporte_mantenimiento"];
    else if(t==="preventivo"&&p==="C4") keys=["reporte_mantenimiento","ndt"];
    else if(t==="preventivo"&&p==="C6") keys=["reporte_mantenimiento","ndt","prueba_presion"];
    else keys=["reporte_mantenimiento"];
    if(esInstrumento()){ keys=[docCalibKey((cicloDatos||{}).tipo_control||(cicloVigente&&cicloVigente.metodo))]; }
    const catalogo={}; DIN_BASE.concat(DIN_EQUIPO).concat(DIN_IZAJE).concat(DIN_INSTR).forEach(function(x){catalogo[x.k]=x;});
    const lista=keys.map(function(k){return catalogo[k];}).filter(Boolean);
    cont.innerHTML='<div class="seccion" style="margin-top:4px">Documentos del ciclo actual</div>'+
      estadoCompletitud(mapa)+
      lista.map(x=>slotHTML("din",x,mapa[x.k],puedeMant())).join("");
    enlazarSlots(cont);
  }
  // Completitud según tipo de mantenimiento seleccionado.
  function estadoCompletitud(mapa){
    const NOMBRES={reporte_mantenimiento:"Reporte de mantenimiento",reporte_falla:"Reporte de falla",ndt:"Reporte NDT",prueba_presion:"PH",certificado_inspeccion:"Certificado de inspección",certificado_calibracion:"Certificado de calibración",certificado_verificacion:"Reporte de verificación",certificado:"Certificado",reporte_ndt:"Reporte NDT"};
    const datos=(cicloDatos||{});
    const tipo=datos.tipo_mantenimiento;
    const prev=datos.ciclo_preventivo;
    let req=[];
    if(esInstrumento()) req=[docCalibKey(datos.tipo_control||(cicloVigente&&cicloVigente.metodo))];
    else if(esIzaje()||tipo==="recertificacion") req=["certificado_inspeccion"];
    else if(tipo==="correctivo") req=["reporte_mantenimiento","reporte_falla"];
    else if(tipo==="preventivo"&&prev==="C2") req=["reporte_mantenimiento"];
    else if(tipo==="preventivo"&&prev==="C4") req=["reporte_mantenimiento","ndt"];
    else if(tipo==="preventivo"&&prev==="C6") req=["reporte_mantenimiento","ndt","prueba_presion"];
    else req=["reporte_mantenimiento"];
    // El formulario en línea cuenta como reporte de mantenimiento.
    if(cicloVigente && cicloVigente.metodo==="formulario") mapa.reporte_mantenimiento=mapa.reporte_mantenimiento||{archivo_path:"formulario"};
    const faltan=req.filter(k=>!mapa[k]);
    if(cicloVigente){
      const incompleto=faltan.length>0;
      const datos2=Object.assign({},cicloDatos||{}, {incompleto:incompleto, documentos_faltantes:faltan});
      if(JSON.stringify(datos2)!==JSON.stringify(cicloDatos||{})){ fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?id=eq."+cicloVigente.id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({datos_formulario:datos2})}).catch(function(){}); cicloDatos=datos2; }
    }
    if(faltan.length===0) return '<p style="margin:8px 0 6px"><span class="mant-chip ok">Mantenimiento completo</span></p>';
    return '<p class="mant-incomplete"><span class="mant-chip bad">Mantenimiento incompleto</span><span class="mant-falta">Falta: '+faltan.map(k=>NOMBRES[k]||k).join(", ")+'</span></p>';
  }


  $("#filePicker").addEventListener("change", async function(e){
    const file=e.target.files[0]; if(!file||!pendiente) return;
    const pend=pendiente; pendiente=null;
    if(pend.scope==="fab"){ await subirFab(pend,file); return; }
    const scope=pend.scope, tipo=pend.tipo;
    mostrarMsg("Subiendo…", true);
    try{
      if(scope==="est"){
        const ext=(file.name.split(".").pop()||"pdf").toLowerCase().replace(/[^a-z0-9]/g,"")||"pdf";
        const path=rutaBase()+"/estatico_"+tipo+"."+ext;
        await subirArchivo(path,file);
        const rq=await fetch(URL_SB+"/rest/v1/documentos_estaticos?select=id,archivo_path&item_id=eq."+itemActual.id+"&tipo=eq."+encodeURIComponent(tipo),{headers:headers()});
        const ex=await rq.json();
        if(ex&&ex[0]){
          if(ex[0].archivo_path && ex[0].archivo_path!==path) await borrarStorage(ex[0].archivo_path);
          await fetch(URL_SB+"/rest/v1/documentos_estaticos?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({archivo_path:path})});
        }else await fetch(URL_SB+"/rest/v1/documentos_estaticos",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({item_id:itemActual.id,tipo:tipo,archivo_path:path})});
        mostrarMsg("Documento cargado/reemplazado.",true); cargarDocsEstaticos();
        reflejarDrive({categoria:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,filename:"estatico_"+tipo+"."+ext},file);
      }else{
        if(!cicloVigente){ mostrarMsg("Primero registra un mantenimiento.", false); return; }
        const ext=(file.name.split(".").pop()||"pdf").toLowerCase().replace(/[^a-z0-9]/g,"")||"pdf";
        const path=rutaBase()+"/ciclo_"+cicloVigente.id+"/dinamico_"+tipo+"_"+Date.now()+"."+ext;
        const rq=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,archivo_path&ciclo_id=eq."+cicloVigente.id+"&tipo=eq."+encodeURIComponent(tipo),{headers:headers()});
        const ex=await rq.json();
        await subirArchivo(path,file);
        if(ex&&ex[0]){
          if(ex[0].archivo_path && !/^https?:\/\//i.test(ex[0].archivo_path) && ex[0].archivo_path!==path) await borrarStorage(ex[0].archivo_path);
          await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({archivo_path:path})});
        }else await fetch(URL_SB+"/rest/v1/documentos_dinamicos",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({ciclo_id:cicloVigente.id,tipo:tipo,archivo_path:path})});
        mostrarMsg("Documento cargado/reemplazado.",true); cargarDocsDinamicos();
        reflejarDrive({categoria:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,ciclo:cicloVigente.id,filename:"dinamico_"+tipo+"."+ext},file);
      }
    }catch(ex){ mostrarMsg("No se pudo subir/reemplazar el archivo. "+(ex.message||""), false); }
  });

  // ---- Cambiar documento desde el acordeón de historial (cualquier ciclo) ----
  $("#histFile").addEventListener("change", async function(e){
    const file=e.target.files[0]; if(!file||!histPend) return;
    const pend=histPend; histPend=null;
    if(!validarArchivo(file,"El documento")) return;
    mostrarMsg("Subiendo…", true);
    try{
      const ext=(file.name.split(".").pop()||"pdf").toLowerCase().replace(/[^a-z0-9]/g,"")||"pdf";
      const path=rutaBase()+"/ciclo_"+pend.cicloId+"/dinamico_"+pend.tipo+"_"+Date.now()+"."+ext;
      const rq=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?select=id,archivo_path&ciclo_id=eq."+encodeURIComponent(pend.cicloId)+"&tipo=eq."+encodeURIComponent(pend.tipo),{headers:headers()});
      const ex=rq.ok?await rq.json():[];
      await subirArchivo(path,file);
      if(ex&&ex[0]){
        if(ex[0].archivo_path && !/^https?:\/\//i.test(ex[0].archivo_path) && ex[0].archivo_path!==path) await borrarStorage(ex[0].archivo_path);
        const pr=await fetch(URL_SB+"/rest/v1/documentos_dinamicos?id=eq."+ex[0].id,{method:"PATCH",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({archivo_path:path})});
        const pd=pr.ok?await pr.json():[];
        if(!pr.ok || !pd.length) throw new Error("No se pudo reemplazar el documento (posible restricción de permisos/RLS).");
      }else{
        const ir=await fetch(URL_SB+"/rest/v1/documentos_dinamicos",{method:"POST",headers:headers({"Prefer":"return=representation"}),body:JSON.stringify({ciclo_id:Number(pend.cicloId)||pend.cicloId,tipo:pend.tipo,archivo_path:path})});
        const idd=ir.ok?await ir.json():[];
        if(!ir.ok || !idd.length) throw new Error("No se pudo guardar el documento (posible restricción de permisos/RLS).");
      }
      reflejarDrive({categoria:itemActual.categoria_id||"herramienta",tipo_codigo:itemActual.tipo_codigo||"SINTIPO",codigo:itemActual.codigo,ciclo:pend.cicloId,filename:"dinamico_"+pend.tipo+"."+ext},file);
      mostrarMsg("Documento reemplazado.",true);
      histAbierto=String(pend.cicloId);
      cargarHistorialItem(itemActual.id);
      if(cicloVigente && String(cicloVigente.id)===String(pend.cicloId)) cargarDocsDinamicos();
    }catch(ex){ mostrarMsg(ex.message||"No se pudo reemplazar el documento.", false); }
  });

  // ---- Formulario Wireline ----
  function wlMsg(t,ok){ var m=$("#wlMsg"); m.textContent=t; m.className="msg "+(ok?"ok":"bad"); }
  function wlAddDim(p,d){
    var w=document.createElement("div"); w.className="row2"; w.style.gap="8px";
    w.innerHTML='<input class="wl-dp" placeholder="Parte No" value="'+esc(p||"")+'"><input class="wl-dv" placeholder="Dimension" value="'+esc(d||"")+'">';
    $("#wl_dims").appendChild(w);
  }
  function wlAddParte(p,n,c){
    var w=document.createElement("div"); w.style.cssText="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px";
    w.innerHTML='<input class="wl-pp" placeholder="Parte" value="'+esc(p||"")+'"><input class="wl-pn" placeholder="No Part" value="'+esc(n||"")+'"><input class="wl-pc" placeholder="Cant" value="'+esc(c||"")+'">';
    $("#wl_partes").appendChild(w);
  }
  function wlSet(id,v){ var el=$("#"+id); if(el) el.value=(v==null?"":v); }
  async function siguienteNumeroReporte(){
    // Consecutivo corporativo actual: el siguiente reporte debe iniciar en 10005.
    // Si ya existen reportes superiores en Supabase, se respeta el mayor + 1.
    var max=10004;
    try{
      var r=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=datos_formulario&limit=5000",{headers:headers()});
      var d=r.ok?await r.json():[]; d.forEach(function(x){var n=Number((x.datos_formulario||{}).n_reporte);if(Number.isFinite(n)&&n>max)max=n;});
    }catch(e){}
    var local=Number(localStorage.getItem("maxim_ultimo_reporte")||10004);
    max=Math.max(10004, max, local); var next=max+1; localStorage.setItem("maxim_ultimo_reporte",String(next)); return String(next);
  }
  function validarFormularioWL(datos){
    var oblig=['lugar_base','tecnico_repara','operatividad','estado_final','observaciones','firma_repara','supervisa'];
    var falt=oblig.filter(function(k){return !String(datos[k]||'').trim();});
    if(!datos.visual||!String(datos.visual.fishneck||'').trim()) falt.push('Fishneck');
    if(!datos.visual||!String(datos.visual.rosca||'').trim()) falt.push('Rosca');
    if(!datos.visual||!String(datos.visual.cuerpo||'').trim()) falt.push('Cuerpo');
    if(!datos.dimensiones||!String(datos.dimensiones.rosca_od||'').trim()) falt.push('Rosca (OD)');
    if(!datos.dimensiones||!String(datos.dimensiones.fishneck_od||'').trim()) falt.push('Fishneck (OD)');
    return falt;
  }
  function abrirFormWL(datos, soloLectura){
    if(!itemActual) return;
    if(!soloLectura){ mttoDraft.online=true; $("#mMantForm").classList.remove("hidden"); }
    var d=datos||{};
    if(!soloLectura && cicloVigente && datos && datos.n_reporte){
      mttoDraft.editingCycle=true; mttoDraft.cycleCreated=true;
      mttoDraft.tipo=datos.tipo_mantenimiento||mttoDraft.tipo; mttoDraft.preventivo=datos.ciclo_preventivo||mttoDraft.preventivo;
    }
    $("#wlSub").innerHTML = codHTML(itemActual.codigo)+" &nbsp; "+esc(itemActual.descripcion||"");
    wlSet("wl_fecha", (soloLectura && cicloVigente && cicloVigente.fecha_realizado) ? cicloVigente.fecha_realizado : hoyISO());
    if(!soloLectura && !d.n_reporte) siguienteNumeroReporte().then(function(n){wlSet("wl_reporte",n);});
    wlSet("wl_reporte", d.n_reporte || ""); wlSet("wl_lugar", d.lugar_base); wlSet("wl_tecnico", d.tecnico_repara);
    var vis=d.visual||{};
    wlSet("wl_fishneck", vis.fishneck); wlSet("wl_rosca", vis.rosca); wlSet("wl_cuerpo", vis.cuerpo);
    wlSet("wl_cuerpo_cual", vis.cuerpo_cual); wlSet("wl_cuerpo_otro", vis.cuerpo_otro); wlSet("wl_parte_afectada", vis.parte_afectada);
    var dim=d.dimensiones||{};
    wlSet("wl_rosca_od", dim.rosca_od); wlSet("wl_fishneck_od", dim.fishneck_od);
    $("#wl_dims").innerHTML=""; $("#wl_partes").innerHTML="";
    var dp=(dim.partes||[]); if(dp.length){ dp.forEach(function(x){ wlAddDim(x.parte,x.dim); }); } else { wlAddDim("",""); wlAddDim("",""); }
    var pr=(d.partes_reemplazadas||[]); if(pr.length){ pr.forEach(function(x){ wlAddParte(x.parte,x.n_part,x.cant); }); } else { wlAddParte("","",""); wlAddParte("","",""); }
    wlSet("wl_operatividad", d.operatividad); wlSet("wl_estado_final", d.estado_final);
    wlSet("wl_obs", d.observaciones); wlSet("wl_firma", d.firma_repara); wlSet("wl_supervisa", d.supervisa);
    var dis=!!soloLectura;
    $("#formWLbg").querySelectorAll("input,select,textarea").forEach(function(el){ el.disabled=dis; });
    $("#wlGuardar").classList.toggle("hidden", dis);
    $("#wl_dim_add").classList.toggle("hidden", dis);
    $("#wl_parte_add").classList.toggle("hidden", dis);
    $("#wlMsg").className="msg hidden";
    $("#formWLbg").classList.remove("hidden");
  }
  function recolectarWL(){
    var dims=[]; $("#wl_dims").querySelectorAll(".row2").forEach(function(r){
      var p=r.querySelector(".wl-dp").value.trim(), v=r.querySelector(".wl-dv").value.trim();
      if(p||v) dims.push({parte:p, dim:v});
    });
    var partes=[]; $("#wl_partes").querySelectorAll(":scope > div").forEach(function(r){
      var p=r.querySelector(".wl-pp").value.trim(), n=r.querySelector(".wl-pn").value.trim(), c=r.querySelector(".wl-pc").value.trim();
      if(p||n||c) partes.push({parte:p, n_part:n, cant:c});
    });
    return {
      tipo:"reporte_mantenimiento_wl",
      n_reporte:$("#wl_reporte").value.trim(), lugar_base:$("#wl_lugar").value.trim(), tecnico_repara:$("#wl_tecnico").value.trim(),
      visual:{ fishneck:$("#wl_fishneck").value, rosca:$("#wl_rosca").value, cuerpo:$("#wl_cuerpo").value, cuerpo_cual:$("#wl_cuerpo_cual").value, cuerpo_otro:$("#wl_cuerpo_otro").value.trim(), parte_afectada:$("#wl_parte_afectada").value.trim() },
      dimensiones:{ rosca_od:$("#wl_rosca_od").value.trim(), fishneck_od:$("#wl_fishneck_od").value.trim(), partes:dims },
      operatividad:$("#wl_operatividad").value,
      partes_reemplazadas:partes,
      estado_final:$("#wl_estado_final").value,
      observaciones:$("#wl_obs").value.trim(),
      firma_repara:$("#wl_firma").value.trim(), supervisa:$("#wl_supervisa").value.trim()
    };
  }
  $("#wl_dim_add").addEventListener("click", function(){ wlAddDim("",""); });
  $("#wl_parte_add").addEventListener("click", function(){ wlAddParte("","",""); });
  $("#wlCerrar").addEventListener("click", function(){ $("#formWLbg").classList.add("hidden"); });
  $("#formWLbg").addEventListener("click", function(e){ if(e.target===$("#formWLbg")) $("#formWLbg").classList.add("hidden"); });
  $("#mVerFormWL").addEventListener("click", function(){
    if(cicloDatos && puedeMant()){
      mttoDraft.editingCycle=true; mttoDraft.cycleCreated=true;
      mttoDraft.tipo=cicloDatos.tipo_mantenimiento||null; mttoDraft.preventivo=cicloDatos.ciclo_preventivo||null;
      abrirFormWL(cicloDatos,false);
    }else abrirFormWL(cicloDatos,true);
  });
  $("#wlGuardar").addEventListener("click", async function(){
    if(!itemActual) return;
    var btn=$("#wlGuardar"); btn.disabled=true;
    try{
      var editing=!!mttoDraft.editingCycle && !!cicloVigente;
      if(!editing){
        if(!mttoDraft.tipo) throw new Error("Selecciona Correctivo o Preventivo en la ficha del equipo.");
        if(mttoDraft.tipo==="preventivo"&&!mttoDraft.preventivo) throw new Error("Selecciona el tipo preventivo.");
        if(mttoDraft.tipo==="preventivo"&&!reglaPreventiva().ok) throw new Error("El tipo preventivo seleccionado no aplica a la categoría.");
      }
      var datos=recolectarWL();
      if(!datos.n_reporte) throw new Error("Falta el N° de reporte.");
      var falt=validarFormularioWL(datos); if(falt.length) throw new Error("Completa los campos obligatorios: "+falt.join(", ")+".");
      datos.n_reporte=String(datos.n_reporte);
      datos.tipo_mantenimiento=editing?(cicloDatos.tipo_mantenimiento||mttoDraft.tipo):mttoDraft.tipo;
      datos.ciclo_preventivo=editing?(cicloDatos.ciclo_preventivo||mttoDraft.preventivo||null):(mttoDraft.preventivo||null);
      datos.metodo_reporte="formulario"; datos.incompleto=false; datos.documentos_faltantes=[];

      if(editing){
        var up=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?id=eq."+encodeURIComponent(cicloVigente.id),{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({fecha_realizado:$("#wl_fecha").value||cicloVigente.fecha_realizado,datos_formulario:datos})});
        if(!up.ok){var ue=await up.json().catch(function(){return{};});throw new Error(ue.message||"No se pudo actualizar el reporte.");}
        cicloDatos=datos; cicloVigente.fecha_realizado=$("#wl_fecha").value||cicloVigente.fecha_realizado;
        wlMsg("Reporte actualizado. Generando PDF…",true);
      }else{
        if(!/^\d{5,}$/.test(datos.n_reporte)||Number(datos.n_reporte)<10000) throw new Error("El N° de reporte debe ser un consecutivo desde 10000.");
        var qr=await fetch(URL_SB+"/rest/v1/ciclos_mantenimiento?select=id&datos_formulario->>n_reporte=eq."+encodeURIComponent(datos.n_reporte)+"&limit=1",{headers:headers()});
        var qd=qr.ok?await qr.json():[]; if(qd.length) throw new Error("El N° de reporte ya existe. Cierra el formulario y genera un nuevo consecutivo.");
        var body={p_item_id:itemActual.id,p_linea_codigo:itemActual.linea_codigo,p_fecha_realizado:$("#wl_fecha").value||hoyISO(),p_metodo:"formulario",p_datos:datos};
        var r=await fetch(URL_SB+"/rest/v1/rpc/renovar_mantenimiento",{method:"POST",headers:headers(),body:JSON.stringify(body)});
        if(!r.ok){var e=await r.json().catch(function(){return{};});throw new Error(e.message||"error");}
        var ciclo=await r.json(); cicloVigente={id:ciclo,fecha_realizado:body.p_fecha_realizado,metodo:"formulario"}; cicloDatos=datos;
        mttoDraft.cycleCreated=true;
        wlMsg("Mantenimiento guardado. Generando PDF…",true);
      }

      var pdf=await generarPdfMantenimiento(datos,cicloVigente.id);
      await registrarPdfReporteEnCiclo(pdf.url);
      wlMsg("Reporte guardado y PDF corporativo actualizado.",true);
      cargarDocsDinamicos(); cargarEstadoMant(itemActual.id); cargarHistorialItem(itemActual.id);
      setTimeout(function(){ $("#formWLbg").classList.add("hidden"); $("#mMantForm").classList.add("hidden"); },700);
    }catch(e){ wlMsg(e.message||"No se pudo guardar el reporte.",false); }
    finally{ btn.disabled=false; }
  });

  async function iniciar(){
    pagina=0;
    await cargarPerfil();
    if($("#fLinea").options.length<=1) await cargarLineas();
    await cargarBasesUnidades();
    await cargarTipos();
    await buscar();
    actualizarAlertas(); // contador de la campana
    verHub();      // al entrar mostramos el hub de modulos NEXUS TOOLS
  }
  // ===== Banco de infografias =====
  const INFO_BUCKET = "infografias";
  let infoData = [], infoIdx = 0, infoTimer = null;
  const infoPublicURL = p => URL_SB+"/storage/v1/object/public/"+INFO_BUCKET+"/"+encPath(p);

  async function cargarInfografias(){
    const g=$("#infoGear"); if(g) g.classList.toggle("hidden", !esAdmin());
    try{
      const r = await fetch(URL_SB+"/rest/v1/infografias?select=id,titulo,imagen_path,orden&order=orden.asc,id.asc",{headers:headers()});
      infoData = r.ok ? await r.json() : [];
    }catch(e){ infoData = []; }
    if(infoIdx >= infoData.length) infoIdx = 0;
    renderInfo();
  }

  function renderInfo(){
    const track=$("#infoTrack"), dots=$("#infoDots"); if(!track) return;
    const hay = infoData.length>0;
    $("#infoEmpty").classList.toggle("hidden", hay);
    $("#infoPrev").classList.toggle("hidden", infoData.length<2);
    $("#infoNext").classList.toggle("hidden", infoData.length<2);
    $("#infoOpen").classList.toggle("hidden", !hay);
    if(!hay){ track.innerHTML=""; dots.innerHTML=""; $("#infoCap").textContent=""; detenerAuto(); return; }
    track.innerHTML = infoData.map(function(gi){
      return '<div class="info-slide"><img src="'+infoPublicURL(gi.imagen_path)+'" alt="'+esc(gi.titulo||"Infografia")+'"></div>';
    }).join("");
    dots.innerHTML = infoData.map(function(_,i){ return '<button class="dot'+(i===infoIdx?" on":"")+'" data-idx="'+i+'"></button>'; }).join("");
    dots.querySelectorAll(".dot").forEach(function(d){ d.addEventListener("click",function(){ irInfo(parseInt(d.getAttribute("data-idx"),10)); reiniciarAuto(); }); });
    posicionInfo(true);
    reiniciarAuto();
  }

  function posicionInfo(inmediato){
    const track=$("#infoTrack"); if(!track) return;
    if(inmediato) track.classList.add("nodrag");
    track.style.transform = "translateX(-"+(infoIdx*100)+"%)";
    if(inmediato){ void track.offsetWidth; track.classList.remove("nodrag"); }
    const gi = infoData[infoIdx];
    $("#infoCap").textContent = (gi && gi.titulo) ? gi.titulo : "";
    $("#infoDots").querySelectorAll(".dot").forEach(function(d,i){ d.classList.toggle("on", i===infoIdx); });
  }

  function irInfo(i){
    if(!infoData.length) return;
    infoIdx = ((i % infoData.length) + infoData.length) % infoData.length;
    posicionInfo(false);
  }

  function detenerAuto(){ if(infoTimer){ clearInterval(infoTimer); infoTimer=null; } }
  function reiniciarAuto(){
    detenerAuto();
    if(infoData.length<2) return;
    infoTimer = setInterval(function(){ irInfo(infoIdx+1); }, 6000);
  }

  function bindInfoCarrusel(){
    const vp=$("#infoVp"), track=$("#infoTrack");
    if(!vp || vp.dataset.bound) return; vp.dataset.bound="1";
    $("#infoPrev").addEventListener("click", function(){ irInfo(infoIdx-1); reiniciarAuto(); });
    $("#infoNext").addEventListener("click", function(){ irInfo(infoIdx+1); reiniciarAuto(); });
    let arr=false, x0=0, dx=0;
    vp.addEventListener("pointerdown", function(e){
      if(infoData.length<2) return;
      arr=true; x0=e.clientX; dx=0; detenerAuto();
      track.classList.add("nodrag");
      try{ vp.setPointerCapture(e.pointerId); }catch(_e){}
    });
    vp.addEventListener("pointermove", function(e){
      if(!arr) return;
      dx=e.clientX-x0;
      const w=vp.clientWidth||1;
      track.style.transform="translateX("+(-(infoIdx*100)+(dx/w*100))+"%)";
    });
    function soltar(){
      if(!arr) return;
      arr=false; track.classList.remove("nodrag");
      const w=vp.clientWidth||1;
      if(Math.abs(dx) > w*0.15){ irInfo(infoIdx + (dx<0?1:-1)); }
      else { posicionInfo(false); }
      reiniciarAuto();
    }
    vp.addEventListener("pointerup", soltar);
    vp.addEventListener("pointercancel", soltar);
    vp.addEventListener("mouseenter", detenerAuto);
    vp.addEventListener("mouseleave", reiniciarAuto);
  }

  // ---- Panel admin de infografias (solo admin) ----
  function infoMsg(t,ok){ const m=$("#infoMsg"); m.textContent=t; m.className="ia-msg "+(ok?"ok":"bad"); }
  function abrirInfoAdmin(){
    if(!esAdmin()) return;
    $("#infoMsg").textContent=""; $("#infoMsg").className="ia-msg";
    $("#infoFile").value=""; $("#infoTitulo").value="";
    renderInfoAdmin();
    $("#infoAdminBg").classList.remove("hidden");
  }
  function renderInfoAdmin(){
    const cont=$("#infoAdminList");
    if(!infoData.length){ cont.innerHTML='<div style="color:var(--tenue);font-size:13px">Todavia no hay infografias. Sube la primera arriba.</div>'; return; }
    cont.innerHTML = infoData.map(function(gi,i){
      return '<div class="ia-row" data-id="'+gi.id+'">'+
        '<img src="'+infoPublicURL(gi.imagen_path)+'" alt="">'+
        '<span class="ia-tt">'+(gi.titulo?esc(gi.titulo):'<span style="color:var(--tenue)">(sin titulo)</span>')+'</span>'+
        '<button data-mov="up" aria-label="Subir" '+(i===0?"disabled":"")+'>&uarr;</button>'+
        '<button data-mov="down" aria-label="Bajar" '+(i===infoData.length-1?"disabled":"")+'>&darr;</button>'+
        '<button class="ia-del" data-del="'+gi.id+'">Borrar</button>'+
      '</div>';
    }).join("");
    cont.querySelectorAll("[data-mov]").forEach(function(b){
      b.addEventListener("click", function(){
        const fila=b.closest(".ia-row"); const id=parseInt(fila.getAttribute("data-id"),10);
        moverInfo(id, b.getAttribute("data-mov"));
      });
    });
    cont.querySelectorAll("[data-del]").forEach(function(b){
      b.addEventListener("click", function(){ borrarInfo(parseInt(b.getAttribute("data-del"),10)); });
    });
  }

  async function subirInfoImg(path, file){
    const r=await fetch(URL_SB+"/storage/v1/object/"+INFO_BUCKET+"/"+encPath(path),{
      method:"POST",
      headers:{ "apikey":KEY, "Authorization":"Bearer "+token, "x-upsert":"true", "Content-Type": file.type||"image/jpeg" },
      body:file });
    if(!r.ok){ const e=await r.json().catch(function(){return {};}); throw new Error(e.message||"upload"); }
    return path;
  }

  async function subirInfografia(){
    const f=$("#infoFile").files[0];
    if(!f){ infoMsg("Elige una imagen primero.", false); return; }
    if(!/^image\//.test(f.type)){ infoMsg("El archivo debe ser una imagen.", false); return; }
    const btn=$("#infoSubir"); btn.disabled=true;
    infoMsg("Subiendo la infografia…", true);
    try{
      const ext=((f.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")) || "jpg";
      const path="img_"+Date.now()+"."+ext;
      await subirInfoImg(path, f);
      const maxOrden = infoData.reduce(function(m,gi){ return Math.max(m, gi.orden||0); }, 0);
      const body={ titulo: ($("#infoTitulo").value.trim()||null), imagen_path: path, orden: maxOrden+1 };
      if(usuario && usuario.id) body.creado_por = usuario.id;
      const r=await fetch(URL_SB+"/rest/v1/infografias",{method:"POST",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify(body)});
      if(!r.ok) throw new Error("insert");
      infoMsg("Infografia cargada.", true);
      $("#infoFile").value=""; $("#infoTitulo").value="";
      await cargarInfografias();
      renderInfoAdmin();
    }catch(e){ infoMsg("No se pudo subir. Verifica tu rol admin e intenta de nuevo.", false); }
    finally{ btn.disabled=false; }
  }

  async function moverInfo(id, dir){
    const i=infoData.findIndex(function(gi){ return gi.id===id; });
    const j = dir==="up" ? i-1 : i+1;
    if(i<0 || j<0 || j>=infoData.length) return;
    const a=infoData[i], b=infoData[j];
    const oa=a.orden, ob=b.orden;
    try{
      await fetch(URL_SB+"/rest/v1/infografias?id=eq."+a.id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({orden:ob})});
      await fetch(URL_SB+"/rest/v1/infografias?id=eq."+b.id,{method:"PATCH",headers:headers({"Prefer":"return=minimal"}),body:JSON.stringify({orden:oa})});
      await cargarInfografias();
      renderInfoAdmin();
    }catch(e){ infoMsg("No se pudo reordenar.", false); }
  }

  async function borrarInfo(id){
    const gi=infoData.find(function(x){ return x.id===id; });
    if(!gi) return;
    if(!(await uiConfirm("Borrar esta infografia? No se puede deshacer.",{ok:"Borrar",peligro:true}))) return;
    try{
      await fetch(URL_SB+"/rest/v1/infografias?id=eq."+id,{method:"DELETE",headers:headers({"Prefer":"return=minimal"})});
      try{ await fetch(URL_SB+"/storage/v1/object/"+INFO_BUCKET+"/"+encPath(gi.imagen_path),{method:"DELETE",headers:{ "apikey":KEY, "Authorization":"Bearer "+token }}); }catch(_e){}
      infoMsg("Infografia borrada.", true);
      await cargarInfografias();
      renderInfoAdmin();
    }catch(e){ infoMsg("No se pudo borrar.", false); }
  }

  bindInfoCarrusel();
  $("#infoGear").addEventListener("click", abrirInfoAdmin);
  $("#infoOpen").addEventListener("click", function(){ const gi=infoData[infoIdx]; if(gi) window.open(infoPublicURL(gi.imagen_path), "_blank"); });
  $("#infoSubir").addEventListener("click", subirInfografia);
  $("#infoAdminX").addEventListener("click", function(){ $("#infoAdminBg").classList.add("hidden"); });
  $("#infoAdminBg").addEventListener("click", function(e){ if(e.target===$("#infoAdminBg")) $("#infoAdminBg").classList.add("hidden"); });

  if(token && usuario){
    // Al recargar no sabemos cuánto le queda al access_token guardado.
    // Si tenemos refresh_token, renovamos primero para arrancar con sesión fresca.
    if(refreshToken){
      refrescarSesion().then(function(ok){ if(ok) iniciar(); else verLanding(); });
    } else { iniciar(); }
  } else { verLanding(); }
