/* =========================================================================
   NEXUS TOOLS · Módulo Instrumentación (IT) — dedicado
   -------------------------------------------------------------------------
   Autónomo: reutiliza config.js (window.NEXUS_CONFIG), db.js (window.DB) y la
   sesión/rol de nexus.js (window.NEXUS_APP). Vive en su propia pantalla #appIT.
   Pantallas: Tablero · Equipos · Hoja de vida (detalle).
   Tablas: mtto_equipo, mtto_matriz, mtto_programa, mtto_reporte, mtto_falla,
           mtto_indicador. Ciclos C1=1m C2=3m C4=6m C6=12m.
   ========================================================================= */
(function () {
  "use strict";
  var CFG = window.NEXUS_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function tk(){ try{ return localStorage.getItem("maxim_token")||""; }catch(e){ return ""; } }
  function rol(){ try{ return (window.NEXUS_APP&&window.NEXUS_APP.rol&&window.NEXUS_APP.rol())||"consulta"; }catch(e){ return "consulta"; } }
  function puedeMant(){ var r=rol(); return r==="admin"||r==="operador"; }
  function hoyISO(){ return new Date().toISOString().slice(0,10); }
  function pad2(n){ return (n<10?"0":"")+n; }
  function fechaDMY(iso){ if(!iso) return "—"; var s=String(iso).slice(0,10).split("-"); return (s.length===3)?(s[2]+"-"+s[1]+"-"+s[0]):String(iso); }
  function encPath(p){ return String(p).split("/").map(encodeURIComponent).join("/"); }
  function safeName(s){ return String(s||"archivo").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9._-]+/g,"_").slice(0,80); }
  async function DBcount(t,o){ try{ return await window.DB.count(t,o||{}); }catch(e){ return 0; } }
  async function subirArchivo(path, file){
    var r = await fetch(CFG.URL_SB+"/storage/v1/object/documentos/"+encPath(path),{
      method:"POST", headers:{ "apikey":CFG.KEY, "Authorization":"Bearer "+tk(), "x-upsert":"true", "Content-Type": file.type||"application/pdf" }, body:file });
    if(!r.ok){ var e=await r.json().catch(function(){return {};}); throw new Error(e.message||"No se pudo subir el archivo"); }
    return path;
  }

  var CRIT={A:"Ajustar",B:"Calibración",C:"Cambiar/recargar",D:"Engrase/Lubric.",E:"Verif. Funcionamiento",F:"Revisar Filtros",I:"Inspeccionar/Corregir",L:"Limpiar",S:"Verif. Partes/Conex.",V:"Verif. Color/Textura"};
  var MESES=["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  var MESES_L=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  var state = { view:"tablero", equipos:null, filtro:"", detCod:null, metas:null };

  // ---------- Entrada al módulo ----------
  function entrar(){
    ["landing","login","hub","guia","app","appProc","appDD"].forEach(function(p){ var el=document.getElementById(p); if(el) el.classList.add("hidden"); });
    var it=$("#appIT"); if(it) it.classList.remove("hidden");
    window.scrollTo(0,0);
    var n=$("#itNombre"); if(n) n.textContent=(window.NEXUS_APP&&window.NEXUS_APP.nombre&&window.NEXUS_APP.nombre())||"";
    var rl=$("#itRol"); if(rl){ rl.textContent=rol(); rl.className="rol "+rol(); }
    if(!entrar._bound){
      entrar._bound=true;
      var h=$("#itHome"); if(h) h.addEventListener("click", function(){ if(window.NEXUS_APP&&window.NEXUS_APP.hub) window.NEXUS_APP.hub(); });
      var s=$("#itSalir"); if(s) s.addEventListener("click", function(){ if(window.NEXUS_APP&&window.NEXUS_APP.salir) window.NEXUS_APP.salir(); });
      var dc=$("#itDetCerrar"); if(dc) dc.addEventListener("click", function(){ $("#itDetBg").classList.add("hidden"); });
      document.querySelectorAll("#it2Nav .it2-tab").forEach(function(b){
        b.addEventListener("click", function(){ irVista(b.getAttribute("data-view")); });
      });
    }
    irVista(state.view||"tablero");
  }
  function irVista(v){
    state.view=v;
    document.querySelectorAll("#it2Nav .it2-tab").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-view")===v); });
    if(v==="equipos") renderEquipos(); else renderTablero();
  }

  // ---------- Tablero ----------
  async function renderTablero(){
    var body=$("#it2Body"); if(!body) return;
    var now=new Date(), mes=now.getMonth()+1, anio=now.getFullYear();
    body.innerHTML =
      '<div class="it2-row">'
      + '<div class="it2-titulo">Tablero · '+MESES_L[mes-1]+' '+anio+'</div>'
      + '<div class="it2-selper"><select id="tbMes"></select><select id="tbAnio"></select></div>'
      + '</div><div id="tbCards"><div class="rs-empty">Calculando…</div></div>';
    var selM=$("#tbMes"), selA=$("#tbAnio");
    selM.innerHTML=MESES_L.map(function(m,i){ return '<option value="'+(i+1)+'"'+((i+1)===mes?" selected":"")+'>'+m+'</option>'; }).join("");
    var yo=""; for(var a=anio;a>=anio-3;a--) yo+='<option value="'+a+'"'+(a===anio?" selected":"")+'>'+a+'</option>'; selA.innerHTML=yo;
    selM.addEventListener("change", calcularTablero); selA.addEventListener("change", calcularTablero);
    calcularTablero();
  }
  async function calcularTablero(){
    var cont=$("#tbCards"); if(!cont) return; cont.innerHTML='<div class="rs-empty">Calculando…</div>';
    var mes=parseInt($("#tbMes").value,10)||(new Date().getMonth()+1);
    var anio=parseInt($("#tbAnio").value,10)||new Date().getFullYear();
    var d1=anio+"-"+pad2(mes)+"-01", nm=(mes===12)?(anio+1)+"-01-01":(anio+"-"+pad2(mes+1)+"-01");
    var hoy=hoyISO(); var d30=new Date(); d30.setDate(d30.getDate()+30); var hoy30=d30.toISOString().slice(0,10);
    try{
      if(!state.metas){ try{ var cat=await window.DB.select("mtto_indicador",{}); state.metas={}; (cat||[]).forEach(function(k){ state.metas[k.codigo]=k; }); }catch(e){ state.metas={}; } }
      var mP=(state.metas["MTO-04"]&&state.metas["MTO-04"].meta)||0.8;
      var mF=(state.metas["MTO-03"]&&state.metas["MTO-03"].meta)||0.8;
      var progTot=await DBcount("mtto_programa",{eq:{anio:anio,mes:mes}});
      var progEje=await DBcount("mtto_programa",{eq:{anio:anio,mes:mes,estado:"ejecutado"}});
      var falTot=await DBcount("mtto_falla",{filters:["fecha=gte."+d1,"fecha=lt."+nm]});
      var falCer=await DBcount("mtto_falla",{filters:["fecha=gte."+d1,"fecha=lt."+nm,"estado=eq.cerrada"]});
      var falAbi=await DBcount("mtto_falla",{eq:{estado:"abierta"}});
      var repMes=await DBcount("mtto_reporte",{filters:["fecha=gte."+d1,"fecha=lt."+nm]});
      var calVen=await DBcount("mtto_equipo",{select:"codigo",filters:["vence_calibracion=lt."+hoy]});
      var calPor=await DBcount("mtto_equipo",{select:"codigo",filters:["vence_calibracion=gte."+hoy,"vence_calibracion=lte."+hoy30]});
      var equip =await DBcount("mtto_equipo",{select:"codigo"});
      var pP=progTot?progEje/progTot:null, pF=falTot?falCer/falTot:null;
      function kpi(cod,nom,pct,meta,det){ var has=(pct!=null), ok=has&&pct>=meta;
        return '<div class="ind-card '+(has?(ok?"ok":"bad"):"")+'"><div class="ind-cod">'+cod+'</div><div class="ind-nom">'+esc(nom)+'</div><div class="ind-val">'+(has?Math.round(pct*100)+"%":"—")+'</div><div class="ind-meta">Meta '+Math.round(meta*100)+'% · '+esc(det)+'</div></div>'; }
      function stat(nom,val,cls){ return '<div class="ind-card '+(cls||"")+'"><div class="ind-nom">'+esc(nom)+'</div><div class="ind-val">'+val+'</div></div>'; }
      cont.innerHTML =
        '<div class="ind-grid">'
          + kpi("MTO-04","Cumplimiento del programa",pP,mP,progEje+" de "+progTot+" programados")
          + kpi("MTO-03","Fallas solucionadas",pF,mF,falCer+" cerradas de "+falTot)
        + '</div>'
        + '<div class="ind-grid" style="margin-top:10px">'
          + stat("Reportes de mtto (mes)",repMes)
          + stat("Fallas del mes",falTot)
          + stat("Fallas abiertas (total)",falAbi,falAbi>0?"warn":"")
          + stat("Calibración vencida",calVen,calVen>0?"bad":"ok")
          + stat("Por vencer (30 días)",calPor,calPor>0?"warn":"")
          + stat("Equipos registrados",equip)
        + '</div>'
        + '<p class="sub" style="margin-top:10px">MTO-01 y MTO-02 son cuatrimestrales (se registran manualmente en el tablero MF-F-DE-030).</p>';
    }catch(e){ cont.innerHTML='<div class="rs-empty">No se pudo calcular: '+esc(e&&e.message||String(e))+'</div>'; }
  }

  // ---------- Equipos ----------
  async function renderEquipos(){
    var body=$("#it2Body"); if(!body) return;
    body.innerHTML =
      '<div class="it2-row"><div class="it2-titulo">Equipos</div>'
      + '<input id="itBuscar" class="it2-buscar" placeholder="Buscar por código, tipo o unidad…" value="'+esc(state.filtro||"")+'"></div>'
      + '<div id="itEqList"><div class="rs-empty">Cargando…</div></div>';
    $("#itBuscar").addEventListener("input", function(){ state.filtro=this.value; pintarEquipos(); });
    if(!state.equipos){
      try{ state.equipos = await window.DB.select("mtto_equipo",{ select:"codigo,tipo_equipo,equipo,modelo,marca,ubicacion_unidad,vence_calibracion,estado", order:"codigo.asc", limit:5000 }); }
      catch(e){ $("#itEqList").innerHTML='<div class="rs-empty">No se pudieron cargar los equipos: '+esc(e&&e.message||e)+'</div>'; return; }
    }
    pintarEquipos();
  }
  function pintarEquipos(){
    var cont=$("#itEqList"); if(!cont) return;
    var q=(state.filtro||"").trim().toLowerCase();
    var hoy=hoyISO(); var d30=new Date(); d30.setDate(d30.getDate()+30); var hoy30=d30.toISOString().slice(0,10);
    var rows=(state.equipos||[]).filter(function(e){
      if(!q) return true;
      return (String(e.codigo||"")+" "+String(e.tipo_equipo||"")+" "+String(e.equipo||"")+" "+String(e.ubicacion_unidad||"")).toLowerCase().indexOf(q)>=0;
    });
    if(!rows.length){ cont.innerHTML='<div class="rs-empty">Sin equipos'+(q?" para «"+esc(q)+"»":"")+'.</div>'; return; }
    var head='<table class="it2-tab"><thead><tr><th>Código</th><th>Tipo</th><th>Unidad</th><th>Vence calib.</th><th>Estado</th></tr></thead><tbody>';
    var body=rows.slice(0,600).map(function(e){
      var vc=e.vence_calibracion?String(e.vence_calibracion).slice(0,10):"";
      var cls=""; if(vc){ if(vc<hoy) cls="vc-bad"; else if(vc<=hoy30) cls="vc-warn"; }
      var est=String(e.estado||"").toLowerCase();
      return '<tr data-cod="'+esc(e.codigo)+'"><td class="mono">'+esc(e.codigo)+'</td><td>'+esc(e.tipo_equipo||"—")+'</td><td>'+esc(e.ubicacion_unidad||"—")+'</td>'
        + '<td class="'+cls+'">'+(vc?fechaDMY(vc):"—")+'</td><td>'+esc(est||"—")+'</td></tr>';
    }).join("");
    cont.innerHTML=head+body+'</tbody></table>'+(rows.length>600?'<p class="sub">Mostrando 600 de '+rows.length+'. Refina la búsqueda.</p>':'<p class="sub">'+rows.length+' equipos.</p>');
    cont.querySelectorAll("tr[data-cod]").forEach(function(tr){ tr.addEventListener("click", function(){ abrirDetalle(tr.getAttribute("data-cod")); }); });
  }

  // ---------- Hoja de vida (detalle) ----------
  async function abrirDetalle(cod){
    state.detCod=cod;
    var bg=$("#itDetBg"), body=$("#itDetBody");
    body.innerHTML='<div class="rs-empty">Cargando…</div>'; bg.classList.remove("hidden");
    var eq=null; try{ eq=await window.DB.first("mtto_equipo",{eq:{codigo:cod}}); }catch(e){}
    var tipo=(eq&&eq.tipo_equipo)||"";
    var acc = puedeMant()
      ? '<div class="it-acc"><button class="btn2" id="idBtnMtto" type="button">➕ Agregar mantenimiento</button><button class="btn2" id="idBtnFalla" type="button">➕ Anexar reporte de falla</button></div>'
        + formMtto() + formFalla()
      : '';
    var ficha = eq
      ? '<div class="inv-pairs">'+[
          ["Tipo",esc(eq.tipo_equipo||"—")],["Modelo/Ref",esc(eq.modelo||eq.referencia||"—")],
          ["Serie",esc(eq.serie||"—")],["Marca",esc(eq.marca||"—")],["Ubicación",esc(eq.ubicacion_unidad||"—")],
          ["Vence calibración",eq.vence_calibracion?fechaDMY(eq.vence_calibracion):"—"],["Vida útil",esc(eq.vida_util||"—")],["Estado",esc(eq.estado||"—")]
        ].map(function(p){return '<div class="inv-pair"><span class="k">'+p[0]+'</span><span class="v">'+p[1]+'</span></div>';}).join("")+'</div>'
      : '<div class="rs-empty">Sin ficha de Mantenimiento IT para '+esc(cod)+'.</div>';
    body.innerHTML =
      '<h2 style="margin:0 0 2px">'+esc(cod)+'</h2><p class="sub" style="margin-top:0">'+esc((eq&&eq.equipo)||tipo||"Instrumento")+'</p>'
      + acc
      + '<div class="seccion">Ficha</div>'+ficha
      + '<details style="margin-top:10px"><summary class="it-sum">Matriz de mantenimiento (por tipo)</summary><div id="idMatriz" style="margin-top:8px"></div></details>'
      + '<details style="margin-top:10px" open><summary class="it-sum">Programa del año</summary><div id="idPrograma" style="margin-top:8px"></div></details>'
      + '<details style="margin-top:10px" open><summary class="it-sum">Historial: reportes y fallas</summary><div id="idHist" style="margin-top:8px"></div></details>';
    if(puedeMant()) bindDetForms(cod);
    cargarMatriz(tipo); cargarPrograma(cod); cargarHist(cod);
  }
  function formMtto(){
    return '<div class="it-form hidden" id="idFormMtto"><div class="seccion" style="margin-top:4px">Nuevo mantenimiento</div>'
      + '<div class="row2"><label>Fecha<input id="dmFecha" type="date"></label><label>Ciclo<select id="dmCiclo"><option value="">—</option><option value="C1">C1 · 1 mes</option><option value="C2">C2 · 3 meses</option><option value="C4">C4 · 6 meses</option><option value="C6">C6 · 12 meses</option></select></label></div>'
      + '<div class="row2"><label>Tipo de trabajo<select id="dmTipo"><option value="mantenimiento">Mantenimiento</option><option value="calibracion">Calibración</option><option value="verificacion">Verificación</option><option value="prueba_hidrostatica">Prueba hidrostática</option></select></label><label>N° certificado/reporte<input id="dmCert" type="text" autocomplete="off"></label></div>'
      + '<div class="row2"><label>Ubicación/unidad<input id="dmUbic" type="text" autocomplete="off"></label><label>Costo<input id="dmCosto" type="number" min="0" step="1000"></label></div>'
      + '<label>Técnico<input id="dmTec" type="text" autocomplete="off"></label>'
      + '<label>Descripción del trabajo<textarea id="dmDesc" rows="3"></textarea></label>'
      + '<div class="seccion" style="margin-top:4px">Adjunto (PDF) — opcional</div><input type="file" id="dmFile" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"><div id="dmFileSt" class="sub"></div>'
      + '<div class="row2" style="margin-top:8px"><button class="btn" id="dmGuardar" type="button">Guardar</button><button class="btn2" id="dmCancel" type="button">Cancelar</button></div><p class="msg hidden" id="dmMsg"></p></div>';
  }
  function formFalla(){
    return '<div class="it-form hidden" id="idFormFalla"><div class="seccion" style="margin-top:4px">Nuevo reporte de falla</div>'
      + '<div class="row2"><label>Fecha<input id="dfFecha" type="date"></label><label>Unidad<input id="dfUnidad" type="text" autocomplete="off"></label></div>'
      + '<div class="row2"><label>Quién reporta<input id="dfQuien" type="text" autocomplete="off"></label><label>Proceso<select id="dfProc"><option value="">—</option><option>MEC.</option><option>OP. SL</option><option>ING. IT</option><option>AUX. OP</option><option>AUX. MTTO</option><option>SUPERVISOR</option><option>OP GRUA</option><option>OTRO</option></select></label></div>'
      + '<label>Descripción de la falla<textarea id="dfDesc" rows="3"></textarea></label>'
      + '<div class="seccion" style="margin-top:4px">Soporte — opcional</div><input type="file" id="dfFile" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"><div id="dfFileSt" class="sub"></div>'
      + '<div class="row2" style="margin-top:8px"><button class="btn" id="dfGuardar" type="button">Guardar</button><button class="btn2" id="dfCancel" type="button">Cancelar</button></div><p class="msg hidden" id="dfMsg"></p></div>';
  }
  function bindDetForms(cod){
    var fm=$("#idFormMtto"), ff=$("#idFormFalla");
    $("#idBtnMtto").onclick=function(){ ff.classList.add("hidden"); fm.classList.toggle("hidden"); $("#dmFecha").value=hoyISO(); };
    $("#idBtnFalla").onclick=function(){ fm.classList.add("hidden"); ff.classList.toggle("hidden"); $("#dfFecha").value=hoyISO(); };
    $("#dmCancel").onclick=function(){ fm.classList.add("hidden"); };
    $("#dfCancel").onclick=function(){ ff.classList.add("hidden"); };
    $("#dmGuardar").onclick=function(){ guardarReporte(cod); };
    $("#dfGuardar").onclick=function(){ guardarFalla(cod); };
  }
  function setMsg(sel,txt,ok){ var e=$(sel); if(!e) return; e.textContent=txt; e.className="msg "+(ok?"ok":"err"); }
  async function guardarReporte(cod){
    if(!puedeMant()) return;
    var fecha=$("#dmFecha").value||hoyISO(), cert=$("#dmCert").value.trim();
    var b=$("#dmGuardar"); b.disabled=true; setMsg("#dmMsg","Guardando…",true);
    try{
      var f=$("#dmFile").files[0]||null, adj=null;
      if(f){ $("#dmFileSt").textContent="Subiendo adjunto…"; adj=await subirArchivo("mtto/reporte/"+safeName(cod)+"/"+Date.now()+"_"+safeName(f.name), f); $("#dmFileSt").textContent="Adjunto listo."; }
      var costo=$("#dmCosto").value; costo = costo===""?null:Number(costo);
      var ins=await window.DB.insert("mtto_reporte",{ codigo:cod, consecutivo:(cert||null), no_certificado:(cert||null), fecha:fecha, ciclo:($("#dmCiclo").value||null), tipo_trabajo:$("#dmTipo").value, ubicacion:($("#dmUbic").value.trim()||null), costo:costo, tecnico:($("#dmTec").value.trim()||null), descripcion_trabajo:($("#dmDesc").value.trim()||null), adjunto_path:adj, origen:"app" });
      var repId=(ins&&ins[0]&&ins[0].id)||null; var ciclo=$("#dmCiclo").value;
      if(ciclo){ var mes=parseInt(fecha.slice(5,7),10), an=parseInt(fecha.slice(0,4),10);
        try{ await window.DB.update("mtto_programa",{ fecha_ejecutado:fecha, reporte_id:repId, estado:"ejecutado" },{ eq:{ codigo:cod, anio:an, mes:mes, ciclo:ciclo, estado:"programado" } }); }catch(_e){} }
      setMsg("#dmMsg","Mantenimiento guardado ✓",true);
      $("#idFormMtto").classList.add("hidden");
      cargarPrograma(cod); cargarHist(cod);
    }catch(e){ setMsg("#dmMsg","No se pudo guardar: "+(e&&e.message||e),false); }
    finally{ b.disabled=false; }
  }
  async function guardarFalla(cod){
    if(!puedeMant()) return;
    var fecha=$("#dfFecha").value||hoyISO(), desc=$("#dfDesc").value.trim();
    if(!desc){ setMsg("#dfMsg","Escribe la descripción de la falla.",false); return; }
    var b=$("#dfGuardar"); b.disabled=true; setMsg("#dfMsg","Guardando…",true);
    try{
      var f=$("#dfFile").files[0]||null, sop=null;
      if(f){ $("#dfFileSt").textContent="Subiendo soporte…"; sop=await subirArchivo("mtto/falla/"+safeName(cod)+"/"+Date.now()+"_"+safeName(f.name), f); $("#dfFileSt").textContent="Soporte listo."; }
      await window.DB.insert("mtto_falla",{ codigo:cod, codigo_serial_texto:cod, unidad:($("#dfUnidad").value.trim()||null), fecha:fecha, quien_reporta:($("#dfQuien").value.trim()||null), proceso:($("#dfProc").value||null), descripcion:desc, soporte_path:sop, estado:"abierta", origen:"app" });
      setMsg("#dfMsg","Reporte de falla guardado ✓",true);
      $("#idFormFalla").classList.add("hidden");
      cargarHist(cod);
    }catch(e){ setMsg("#dfMsg","No se pudo guardar: "+(e&&e.message||e),false); }
    finally{ b.disabled=false; }
  }
  async function cargarMatriz(tipo){
    var box=$("#idMatriz"); if(!box) return;
    try{
      var mtz=tipo?await window.DB.select("mtto_matriz",{eq:{tipo_equipo:tipo},order:"orden.asc"}):[];
      if(mtz&&mtz.length){
        function c(v){ return v?('<b title="'+esc(CRIT[v]||v)+'">'+esc(v)+'</b>'):'·'; }
        var rr=mtz.map(function(m){ return '<tr><td>'+esc(m.sistema||"")+'</td><td>'+esc(m.componente||"")+'</td><td class="ct">'+c(m.c1)+'</td><td class="ct">'+c(m.c2)+'</td><td class="ct">'+c(m.c4)+'</td><td class="ct">'+c(m.c6)+'</td></tr>'; }).join("");
        box.innerHTML='<div style="overflow-x:auto"><table class="it-tab"><thead><tr><th>Sistema</th><th>Componente</th><th>C1<br>1m</th><th>C2<br>3m</th><th>C4<br>6m</th><th>C6<br>12m</th></tr></thead><tbody>'+rr+'</tbody></table></div>';
      }else box.innerHTML='<div class="rs-empty">Sin matriz para el tipo «'+esc(tipo||"—")+'».</div>';
    }catch(e){ box.innerHTML='<div class="rs-empty">No se pudo cargar la matriz.</div>'; }
  }
  async function cargarPrograma(cod){
    var box=$("#idPrograma"); if(!box) return; var anio=new Date().getFullYear();
    try{
      var pr=await window.DB.select("mtto_programa",{eq:{codigo:cod,anio:anio},order:"mes.asc"});
      if(pr&&pr.length){
        box.innerHTML='<div class="it-chips">'+pr.map(function(p){ var ok=(p.estado==="ejecutado");
          return '<span class="it-chip '+(ok?"ok":"")+'">'+esc(MESES[p.mes||0]+" "+(p.ciclo||"")+(ok?(" ✓"+(p.fecha_ejecutado?(" "+fechaDMY(p.fecha_ejecutado)):"")):""))+'</span>'; }).join(" ")+'</div>';
      }else box.innerHTML='<div class="rs-empty">Sin programa '+anio+' para este equipo.</div>';
    }catch(e){ box.innerHTML='<div class="rs-empty">No se pudo cargar el programa.</div>'; }
  }
  async function cargarHist(cod){
    var box=$("#idHist"); if(!box) return;
    try{
      var reps=[],fls=[];
      try{ reps=await window.DB.select("mtto_reporte",{eq:{codigo:cod},order:"fecha.desc"}); }catch(e){}
      try{ fls =await window.DB.select("mtto_falla",{eq:{codigo:cod},order:"fecha.desc"}); }catch(e){}
      var arr=[]; (reps||[]).forEach(function(r){arr.push({t:r.fecha,k:"rep",d:r});}); (fls||[]).forEach(function(r){arr.push({t:r.fecha,k:"fal",d:r});});
      arr.sort(function(a,b){ return String(b.t||"").localeCompare(String(a.t||"")); });
      if(!arr.length){ box.innerHTML='<div class="rs-empty">Sin reportes ni fallas registrados.</div>'; return; }
      box.innerHTML=arr.map(function(x){
        if(x.k==="rep"){ var r=x.d; return '<div class="it-hi"><span class="it-badge rep">MTTO</span> <b>'+fechaDMY(r.fecha)+'</b> · '+esc(r.tipo_trabajo||"mantenimiento")+(r.no_certificado?(" · Cert "+esc(r.no_certificado)):"")+(r.ubicacion?(" · "+esc(r.ubicacion)):"")+'<div class="it-hi-d">'+esc(r.descripcion_trabajo||"")+'</div></div>'; }
        var f=x.d; return '<div class="it-hi"><span class="it-badge '+(f.estado==="cerrada"?"fcl":"fab")+'">FALLA'+(f.estado==="cerrada"?" ✓":"")+'</span> <b>'+fechaDMY(f.fecha)+'</b>'+(f.unidad?(" · "+esc(f.unidad)):"")+(f.quien_reporta?(" · "+esc(f.quien_reporta)):"")+'<div class="it-hi-d">'+esc(f.descripcion||"")+(f.descripcion_cierre?("<br><i>Cierre: "+esc(f.descripcion_cierre)+"</i>"):"")+'</div></div>';
      }).join("");
    }catch(e){ box.innerHTML='<div class="rs-empty">No se pudo cargar el historial.</div>'; }
  }

  window.NEXUS_IT = { entrar: entrar };
})();
