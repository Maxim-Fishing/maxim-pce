/**
 * Maxim PCE - Reflejo de documentos a Google Drive + Listado NDT, PH y COC
 * ------------------------------------------------------------------------
 * Vive en tu cuenta de Google.
 *
 * Acciones GET:
 *   ?action=list_ndt&token=...&callback=...
 *   ?action=list_ph&token=...&callback=...
 *   ?action=list_coc&token=...&callback=...
 *
 * Los listados devuelven [{n:nombre, i:idDeDrive}].
 * La app interpreta nombres como:
 * 0003-260611-PH-EPLST312F0058_EPLST312F0059_...
 *            ^ YYMMDD            ^ todos los códigos
 * Para COC basta que el nombre contenga el codigo: p.ej. COC_EPLST312F0058.pdf
 */

// ==== CONFIGURACION ====
var TOKEN = 'maxim-pce-2026'; // debe coincidir con index.html

var CARPETAS = {
  herramienta: '1hkn8Q9jYilfXFS4HdbjShmq7FZX1vlk7',
  equipo:      '1ccVuAY0zThN-mHfMfkCw9hx6_tIE9yXQ'
};

// NDT: carpeta existente
var NDT_FOLDER_NAME = 'NEXUS - Certificados NDT';

// PH: carpeta compartida para pruebas hidrostáticas
var PH_FOLDER_ID = '11hzHuw3f7o2syCGk9a7vMJkVHqKovVJn';

// COC: carpeta "bandeja" donde sueltas los COC nuevos.
// Al sincronizar, cada archivo se mueve a su ruta final Categoria/Tipo/Codigo.
// >>> PON AQUI EL ID DE TU CARPETA DE COC <<<
var COC_INBOX_ID = '1FIYmqEOj8nQSx4-aKGu50YOfhP4l_Hhi';


// ==== PROCEDIMIENTOS OPERATIVOS ====
// Base de documentos por linea. Cada carpeta se lee en vivo: lo que subas
// aparece en la app al recargar la vista de Procedimientos.
// Raiz Drive: "NEXUS - Procedimientos Operativos" (14fBBLwIViamCMr_ngh_aGszMB31WZth_)
var PROC_FOLDERS = {
  ws: '1bhSq1zaUIowkQnS6sZx_cfhPLsRdTNPG', // Linea WS (Well Services)
  wl: '18dqX9n7k6F8Gj62uV89RHG5wkKvIHHfC', // Linea WL (Wireline)
  tx: '14ufj_7KNs65RJvuSckIVIk8zeUeGqq7x'  // Transversales (WS + WL)
};

// ==== DISEÑO Y DIBUJO ====
// Raiz Drive: "NEXUS - DISEÑO Y DIBUJO" (1V7x4lMeg4nwokHw6oTOSABgXp4iUFa6E)
var DD_FORMATOS_ID = '12gjalzbAqZdnoc5Q63zm4zCHosmQpH7V'; // formato diligenciado (PDF)
var DD_PLANOS_ID   = '1s1pgQeGol6-NeQkgThJUFOT5B0iXU8jo'; // entregables (planos, avances)
var DD_TIPOS_TXT = {
  levantamiento_3d:'Levantamiento y modelado 3D', modelado_3d:'Modelado 3D',
  diseno_3d:'Diseño y modelado 3D', planos:'Planos', informes_aef:'Informes / AEF',
  ficha_tecnica:'Ficha técnica', simulaciones:'Simulaciones'
};
// Plantilla del formato (para PDF IDÉNTICO al oficial). Sube el .xlsx a tu Drive
// (a la carpeta FORMATOS o donde quieras); el script lo busca por nombre.
// Opcional: pon el ID exacto en DD_FORMATO_TEMPLATE_ID para no depender del nombre.
var DD_FORMATO_TEMPLATE_NAME = 'MF-F-QHSE-142 SOLICITUD DE TAREA V1.xlsx';
var DD_FORMATO_TEMPLATE_ID = '';
// Rango del formato a exportar (dimensiones de la hoja MF-F-QHSE-142: A1:J39).
var DD_FORMATO_RANGE = 'A1:J39';


// ==== REPORTE DE MANTENIMIENTO MF-F-MTO-025 ====
// La plantilla se busca por nombre en Drive. Puede ser XLSX o Google Sheets.
var REPORTE_TEMPLATE_NAME = 'MF-F-MTO-025 REPORTE MANTENIMIENTO DE HERRAMIENTAS WIRELINE V2.xlsx';
var REPORTE_TEMPLATE_ID = ''; // Opcional: si se conoce el ID, se usa directamente.


// ==== SUBIDA DESDE LA APP ====
function doPost(e){
  try{
    var body = JSON.parse(e.postData.contents);
    if(body.token !== TOKEN) return salida({ok:false, error:'token invalido'});

    if(body.action === 'generate_report') {
      try{
        var generado=generarReporteMantenimiento(body);
        PropertiesService.getScriptProperties().deleteProperty('report_error_'+String(body.filename||''));
        return salida(generado);
      }catch(genErr){
        PropertiesService.getScriptProperties().setProperty('report_error_'+String(body.filename||''),String(genErr));
        return salida({ok:false,error:String(genErr)});
      }
    }
    if(body.action === 'delete_file') {
      return salida(eliminarReflejoDrive(body));
    }
    if(body.action === 'file_coc') {
      return salida(archivarCoc(body));
    }
    if(body.action === 'send_email') {
      return salida(enviarCorreoDiseno(body));
    }
    if(body.action === 'upload_dd') {
      return salida(subirArchivoDD(body));
    }
    if(body.action === 'generar_formato_diseno') {
      return salida(generarFormatoDiseno(body));
    }

    var raizId = CARPETAS[body.categoria] || CARPETAS.herramienta;
    var carpeta = DriveApp.getFolderById(raizId);

    carpeta = subcarpeta(carpeta, body.tipo_codigo || 'SINTIPO');
    carpeta = subcarpeta(carpeta, body.codigo);
    if(body.ciclo) carpeta = subcarpeta(carpeta, 'ciclo_' + body.ciclo);

    var iguales = carpeta.getFilesByName(body.filename);
    while(iguales.hasNext()) iguales.next().setTrashed(true);

    var bytes = Utilities.base64Decode(body.dataB64);
    var blob  = Utilities.newBlob(bytes, body.mime || 'application/pdf', body.filename);
    var archivo = carpeta.createFile(blob);

    return salida({ok:true, id:archivo.getId(), url:archivo.getUrl()});
  }catch(err){
    return salida({ok:false, error:String(err)});
  }
}

// ==== LISTADOS GET ====
function doGet(e){
  var p = (e && e.parameter) || {};
  var cb = p.callback || '';

  if(p.token && p.token !== TOKEN){
    return salida({ok:false, error:'token invalido'}, cb);
  }

  try{
    if(p.action === 'list_ndt'){
      var ndt = listarNdt(p.since || '');
      return salida({ok:true, archivos:ndt, total:ndt.length}, cb);
    }

    if(p.action === 'list_ph'){
      var ph = listarPh(p.since || '');
      return salida({ok:true, archivos:ph, total:ph.length}, cb);
    }

    if(p.action === 'list_coc'){
      var coc = listarCoc(p.since || '');
      return salida({ok:true, archivos:coc, total:coc.length}, cb);
    }

    if(p.action === 'list_proc'){
      return salida({
        ok:true,
        ws: listarArchivosCarpeta(PROC_FOLDERS.ws),
        wl: listarArchivosCarpeta(PROC_FOLDERS.wl),
        tx: listarArchivosCarpeta(PROC_FOLDERS.tx)
      }, cb);
    }

    if(p.action === 'find_dd'){
      return salida(buscarArchivoDD(p.folder, p.codigo, p.filename), cb);
    }

    if(p.action === 'find_report'){
      var err=PropertiesService.getScriptProperties().getProperty('report_error_'+String(p.filename||''));
      if(err) return salida({ok:false,found:false,error:err},cb);
      var f = buscarReporte(p.categoria || 'herramienta', p.tipo_codigo || 'SINTIPO', p.codigo || '', p.ciclo || '', p.filename || '');
      return salida(f, cb);
    }

    return salida({
      ok:true,
      msg:'Maxim PCE - reflejo a Drive activo',
      actions:['list_ndt','list_ph','list_coc','list_proc','generate_report','find_report','delete_file','file_coc','send_email','upload_dd','find_dd','generar_formato_diseno']
    }, cb);

  }catch(err){
    return salida({ok:false, error:String(err)}, cb);
  }
}

// ==== NDT ====
function listarNdt(since){
  var it = DriveApp.getFoldersByName(NDT_FOLDER_NAME);
  if(!it.hasNext()) return [];
  var root = it.next();
  return listarPdfRecursivo(root, since);
}

// ==== PH ====
function listarPh(since){
  var root = DriveApp.getFolderById(PH_FOLDER_ID);
  return listarPdfRecursivo(root, since);
}

// ==== COC ====
// Recorre TODO el arbol de la carpeta bandeja (subcarpetas incluidas) con el
// servicio avanzado de Drive (Drive.Files.list): una consulta paginada por
// carpeta, en bloques de 1000. Es mucho mas rapido que recorrer archivo por
// archivo con DriveApp y no se queda pegado con miles de archivos.
// Requiere el servicio avanzado "Drive" activado (ya lo usa el reporte MF-025).
function listarCoc(since){
  if(!COC_INBOX_ID || COC_INBOX_ID.indexOf('PON_AQUI') === 0) return [];
  var out = [], cola = [COC_INBOX_ID], vistos = {};
  while(cola.length){
    var folderId = cola.shift();
    if(vistos[folderId]) continue;   // evita ciclos por accesos directos
    vistos[folderId] = true;
    var pageToken = null;
    do {
      var res = Drive.Files.list({
        q: "'" + folderId + "' in parents and trashed = false",
        maxResults: 1000,
        fields: 'nextPageToken, items(id, title, mimeType)',
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      var items = (res && res.items) || [];
      for(var k = 0; k < items.length; k++){
        var f = items[k], name = f.title || '';
        if(f.mimeType === 'application/vnd.google-apps.folder'){
          cola.push(f.id);
        }else if(name.length > 4 && name.substring(name.length - 4).toLowerCase() === '.pdf'){
          out.push({ n: name, i: f.id });
        }
      }
      pageToken = res ? res.nextPageToken : null;
    } while(pageToken);
  }
  return out;
}

// Mueve un COC desde la bandeja a su ruta final Categoria/Tipo/Codigo.
// Conserva el nombre original del archivo (mejor para trazabilidad del certificado).
function archivarCoc(body){
  if(body.token !== TOKEN) return {ok:false, error:'token invalido'};
  if(!body.file_id) return {ok:false, error:'falta file_id'};
  var archivo = DriveApp.getFileById(body.file_id);
  var raizId = CARPETAS[body.categoria] || CARPETAS.herramienta;
  var carpeta = DriveApp.getFolderById(raizId);
  carpeta = subcarpeta(carpeta, body.tipo_codigo || 'SINTIPO');
  carpeta = subcarpeta(carpeta, body.codigo || '');
  archivo.moveTo(carpeta);
  return {ok:true, id:archivo.getId(), url:archivo.getUrl()};
}

// Lista PDF recursivamente.
// since es opcional YYYY-MM-DD. Si se envía, poda subcarpetas antiguas.
function listarPdfRecursivo(root, since){
  var sinceMs = since ? new Date(since + 'T00:00:00').getTime() : 0;
  var out = [];
  scanPdf(root, sinceMs, out, 0);
  return out;
}

function scanPdf(folder, sinceMs, out, depth){
  var fit = folder.getFiles();
  while(fit.hasNext()){
    var f = fit.next();
    var name = f.getName();
    if(name.length > 4 && name.substring(name.length - 4).toLowerCase() === '.pdf'){
      out.push({ n:name, i:f.getId() });
    }
  }

  var dit = folder.getFolders();
  while(dit.hasNext()){
    var sub = dit.next();
    if(sinceMs > 0 && depth >= 1 && sub.getDateCreated().getTime() < sinceMs) continue;
    scanPdf(sub, sinceMs, out, depth + 1);
  }
}

// ==== GENERACION MF-F-MTO-025 ====
function generarReporteMantenimiento(body){
  var d = body.datos || {};
  var item = body.item || {};
  var categoria = body.categoria || item.categoria_id || 'herramienta';
  var tipoCodigo = body.tipo_codigo || item.tipo_codigo || 'SINTIPO';
  var codigo = body.codigo || item.codigo || '';
  var ciclo = String(body.ciclo || '');
  if(!codigo || !ciclo) throw new Error('Faltan codigo o ciclo para generar el reporte.');

  var carpetaRaiz = DriveApp.getFolderById(CARPETAS[categoria] || CARPETAS.herramienta);
  var carpeta = subcarpeta(carpetaRaiz, tipoCodigo);
  carpeta = subcarpeta(carpeta, codigo);
  carpeta = subcarpeta(carpeta, 'ciclo_' + ciclo);

  var filename = body.filename || ('MF-F-MTO-025_' + (d.n_reporte || ciclo) + '.pdf');
  var template = obtenerPlantillaReporte();
  var ssId = null, temporal = false;

  try{
    if(template.getMimeType() === MimeType.GOOGLE_SHEETS || template.getMimeType() === 'application/vnd.google-apps.spreadsheet'){
      var copia = template.makeCopy('TMP_' + filename.replace(/\.pdf$/i,'') + '_' + new Date().getTime());
      ssId = copia.getId();
      temporal = true;
    }else{
      // Para XLSX se convierte una copia a Google Sheets mediante el servicio avanzado de Drive.
      // En Apps Script: Servicios > Servicios avanzados de Google > Drive API = ON.
      var blob = template.getBlob();
      var recurso = {name:'TMP_' + filename.replace(/\.pdf$/i,''), mimeType:'application/vnd.google-apps.spreadsheet'};
      var convertido = Drive.Files.insert(recurso, blob, {convert:true, supportsAllDrives:true});
      ssId = convertido.id;
      temporal = true;
    }

    var ss = SpreadsheetApp.openById(ssId);
    var sh = ss.getSheets()[0];
    try{ sh.setHiddenGridlines(true); }catch(e){}
    diligenciarPlantillaMF025(sh, d, item);
    SpreadsheetApp.flush();
    Utilities.sleep(700);

    // Exportar SOLO el área oficial del formato (A1:AB51), en carta vertical,
    // ajustado a una sola página y centrado. Esto evita que Google Sheets
    // fragmente la plantilla en 2-3 páginas por ancho/alto de impresión.
    var pdfUrl = 'https://docs.google.com/spreadsheets/d/' + ssId +
      '/export?format=pdf' +
      '&size=letter' +
      '&portrait=true' +
      '&fitw=true' +
      '&scale=4' +
      '&sheetnames=false' +
      '&printtitle=false' +
      '&pagenumbers=false' +
      '&gridlines=false' +
      '&fzr=false' +
      '&horizontal_alignment=CENTER' +
      '&vertical_alignment=MIDDLE' +
      '&top_margin=0.20' +
      '&bottom_margin=0.20' +
      '&left_margin=0.20' +
      '&right_margin=0.20' +
      '&gid=' + sh.getSheetId() +
      '&range=A1:AB51';
    var resp = UrlFetchApp.fetch(pdfUrl, {
      headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},
      muteHttpExceptions:true
    });
    if(resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) throw new Error('No se pudo exportar el reporte a PDF.');

    var blobPdf = resp.getBlob().setName(filename).setContentType('application/pdf');
    var iguales = carpeta.getFilesByName(filename);
    while(iguales.hasNext()) iguales.next().setTrashed(true);
    var archivo = carpeta.createFile(blobPdf);

    return {ok:true,id:archivo.getId(),url:archivo.getUrl(),filename:filename};
  }finally{
    if(temporal && ssId){
      try{ DriveApp.getFileById(ssId).setTrashed(true); }catch(e){}
    }
  }
}

function obtenerPlantillaReporte(){
  if(REPORTE_TEMPLATE_ID){ return DriveApp.getFileById(REPORTE_TEMPLATE_ID); }
  var it = DriveApp.getFilesByName(REPORTE_TEMPLATE_NAME);
  if(!it.hasNext()) throw new Error('No se encontró en Drive la plantilla: ' + REPORTE_TEMPLATE_NAME);
  return it.next();
}

function insertarX_(sh, cellA1){
  var r=sh.getRange(cellA1), row=r.getRow(), col=r.getColumn();
  var png='iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAr0lEQVR4nO3VQQ6AIAwEwMUn9P9v5At4MiFi211E48E9cbCMxlJKaw1vZntV+8E7MbNmZkODuKBXwGJXaxeMChQMAGqtJQXPD7FohrngDMpgIaigLJaCDKpgFBihKgYARZml0X9kMEA8+N6mLCaDKyKBbJcuAbMGYVEK9LAZNAWzL1PREGTPmYKG1xODqWh6PTGYgg7gLMaiA9gXqBiDSrNUzQH1L/AoeJVvz9IV2QGV+pCcTTUmlgAAAABJRU5ErkJggg==';
  try{
    var blob=Utilities.newBlob(Utilities.base64Decode(png),'image/png','x.png');
    var img=sh.insertImage(blob,col,row);
    img.setWidth(16).setHeight(16);
    img.setAnchorCell(r);
    img.setOffsetX(2).setOffsetY(1);
  }catch(e){}
}

function diligenciarPlantillaMF025(sh, d, item){
  function put(cell, value){ sh.getRange(cell).setValue(value == null ? '' : value); }
  function x(cell, label, selected){
    if(selected) insertarX_(sh, cell);
  }
  function val(v){ return v == null ? '' : String(v); }

  // Encabezado operativo: reafirmar combinaciones para evitar líneas internas.
  ['B7:C7','D7:H7','I7:L7','M7:R7','S7:V7','W7:AA7','B9:G9','H9:AA9','B11:E11','H11:M11','N11:R11','S11:AA11'].forEach(function(a){ try{ sh.getRange(a).merge(); }catch(e){} });
  put('B7','Fecha:'); put('I7','Lugar/Base:'); put('S7','Nº Reporte:'); put('B9','Técnico que repara:'); put('B11','Código Hta:'); put('N11','Nombre Hta:');
  put('D7', d.fecha_reporte || d.fecha || '');
  put('M7', d.lugar_base || '');
  put('W7', d.n_reporte || '');
  put('H9', d.tecnico_repara || '');
  put('H11', item.codigo || d.codigo || '');
  put('S11', item.nombre || item.descripcion || d.nombre_herramienta || '');

  var v = d.visual || {};
  x('J14','Bueno',v.fishneck === 'bueno');
  x('N14','Malo',v.fishneck === 'malo');
  x('U14','Buena',v.rosca === 'buena');
  x('Y14','Mala',v.rosca === 'mala');
  x('E16','Bueno',v.cuerpo === 'bueno');
  x('I16','Malo',v.cuerpo === 'malo');
  x('N16','Colapso',v.cuerpo_cual === 'colapso');
  x('R16','Fisura',v.cuerpo_cual === 'fisura');
  x('V16','Deformidad',v.cuerpo_cual === 'deformidad');
  put('Y17', v.parte_afectada || '');
  if(v.cuerpo_cual === 'otro') put('Y17', v.cuerpo_otro || '');

  var dim = d.dimensiones || {};
  put('L19', dim.rosca_od || '');
  put('W19', dim.fishneck_od || '');
  var partesDim = dim.partes || [];
  for(var i=0;i<20;i++) put(columnaExcel_(7+i) + '22', i<partesDim.length ? (partesDim[i].dim || '') : '');

  x('I25','Buena',d.operatividad === 'buena');
  x('M25','Mala',d.operatividad === 'mala');
  x('Q25','No Aplica',d.operatividad === 'na');

  var rep = d.partes_reemplazadas || [];
  var max = Math.min(rep.length,8);
  for(var r=0;r<4;r++){
    put('C'+(30+r), r<max ? rep[r].parte : '');
    put('K'+(30+r), r<max ? rep[r].n_part : '');
    put('M'+(30+r), r<max ? rep[r].cant : '');
    put('O'+(30+r), (r+4)<max ? rep[r+4].parte : '');
    put('W'+(30+r), (r+4)<max ? rep[r+4].n_part : '');
    put('Y'+(30+r), (r+4)<max ? rep[r+4].cant : '');
  }

  x('J36','Buena',d.estado_final === 'buena');
  x('N36','Regular',d.estado_final === 'regular');
  x('R36','Mala',d.estado_final === 'mala');

  // Observaciones: se escriben por líneas dentro del recuadro existente.
  for(var rr=38;rr<=47;rr++) put('C'+rr,'');
  var texto = val(d.observaciones).replace(/\r?\n/g,' ');
  var palabras = texto.split(/\s+/), lineas=[], actual='';
  for(var k=0;k<palabras.length;k++){
    var palabra=palabras[k];
    if((actual+' '+palabra).trim().length > 82){ lineas.push(actual); actual=palabra; }
    else actual=(actual+' '+palabra).trim();
  }
  if(actual) lineas.push(actual);
  for(var li=0;li<Math.min(lineas.length,10);li++) put('C'+(38+li), lineas[li]);

  put('C49', d.firma_repara || '');
  put('N49', d.supervisa || '');
}

function columnaExcel_(n){
  var s='';
  while(n>0){ var r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
  return s;
}

function buscarReporte(categoria,tipoCodigo,codigo,ciclo,filename){
  if(!codigo || !ciclo) return {ok:false,error:'faltan parametros'};
  var raiz = DriveApp.getFolderById(CARPETAS[categoria] || CARPETAS.herramienta);
  var carpeta = buscarSubcarpeta_(raiz,tipoCodigo);
  if(!carpeta) return {ok:false,found:false};
  carpeta = buscarSubcarpeta_(carpeta,codigo);
  if(!carpeta) return {ok:false,found:false};
  carpeta = buscarSubcarpeta_(carpeta,'ciclo_'+ciclo);
  if(!carpeta) return {ok:false,found:false};
  var nombre = filename || ('MF-F-MTO-025_'+ciclo+'.pdf');
  var it=carpeta.getFilesByName(nombre);
  if(!it.hasNext()) return {ok:true,found:false};
  var f=it.next();
  return {ok:true,found:true,id:f.getId(),url:f.getUrl(),filename:f.getName()};
}

function buscarSubcarpeta_(padre,nombre){
  var it=padre.getFoldersByName(nombre);
  return it.hasNext()?it.next():null;
}

function eliminarReflejoDrive(body){
  var raizId=CARPETAS[body.categoria] || CARPETAS.herramienta;
  var carpeta=DriveApp.getFolderById(raizId);
  carpeta=subcarpeta(carpeta,body.tipo_codigo||'SINTIPO');
  carpeta=subcarpeta(carpeta,body.codigo||'');
  if(body.ciclo) carpeta=subcarpeta(carpeta,'ciclo_'+body.ciclo);
  var pref=String(body.filename||'');
  var it=carpeta.getFiles(), n=0;
  while(it.hasNext()){ var f=it.next(); if(!pref || f.getName()===pref || f.getName().indexOf(pref)===0){ f.setTrashed(true); n++; } }
  return {ok:true,deleted:n};
}

// ==== AUXILIARES ====
function subcarpeta(padre, nombre){
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// Si hay callback -> JSONP para la app.
// ==== DISEÑO Y DIBUJO: enviar correo al cliente (entrega parcial/total) ====
function enviarCorreoDiseno(body){
  try{
    if(!body.to) return {ok:false, error:'Sin destinatario (email_cliente vacío)'};
    var opt = { name: 'NEXUS TOOLS · Maxim Fishing' };
    if(body.htmlBody) opt.htmlBody = body.htmlBody;
    MailApp.sendEmail(body.to, body.subject || 'Notificación de diseño', body.body || '', opt);
    return {ok:true};
  }catch(e){ return {ok:false, error:String(e)}; }
}

// ==== DISEÑO Y DIBUJO: carpeta destino ====
function ddFolderBase(folder){
  return DriveApp.getFolderById(folder === 'formatos' ? DD_FORMATOS_ID : DD_PLANOS_ID);
}
function ddFolderDestino(folder, codigo){
  var base = ddFolderBase(folder);
  if(codigo) base = subcarpeta(base, String(codigo));
  return base;
}

// Sube un archivo (base64) a PLANOS o FORMATOS. Devuelve {ok,id,url}.
function subirArchivoDD(body){
  try{
    var carpeta = ddFolderDestino(body.folder, body.codigo);
    var nombre = body.filename || ('archivo_'+Date.now());
    var iguales = carpeta.getFilesByName(nombre);
    while(iguales.hasNext()) iguales.next().setTrashed(true);
    var bytes = Utilities.base64Decode(body.dataB64);
    var blob = Utilities.newBlob(bytes, body.mime || 'application/octet-stream', nombre);
    var f = carpeta.createFile(blob);
    try{ f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
    return {ok:true, id:f.getId(), url:f.getUrl()};
  }catch(e){ return {ok:false, error:String(e)}; }
}

// Busca un archivo por nombre en PLANOS/FORMATOS (subcarpeta por codigo). Devuelve {found,url}.
function buscarArchivoDD(folder, codigo, filename){
  try{
    var carpeta = ddFolderDestino(folder, codigo);
    var it = carpeta.getFilesByName(filename);
    if(it.hasNext()){ var f=it.next(); return {ok:true, found:true, id:f.getId(), url:f.getUrl()}; }
    return {ok:true, found:false};
  }catch(e){ return {ok:false, found:false, error:String(e)}; }
}

// Genera el formato MF-F-QHSE-142 diligenciado en PDF (IDÉNTICO al oficial) y lo
// guarda en FORMATOS/<codigo>. Rellena TU plantilla .xlsx y la exporta centrada.
// Si no encuentra la plantilla, cae al render HTML de respaldo.
function generarFormatoDiseno(body){
  var d = body || {};
  var plantilla = obtenerPlantillaFormato();
  if(!plantilla) return generarFormatoDisenoHTML(body);
  var ssId = null, temporal = false;
  try{
    // Borra el formato anterior ANTES de regenerar, para que "Ver formato" nunca
    // devuelva un PDF viejo mientras se genera el nuevo.
    var nombre = (d.codigo || ('DD-' + Date.now())) + '.pdf';
    var carpetaDest = ddFolderDestino('formatos', d.codigo);
    var prev = carpetaDest.getFilesByName(nombre);
    while(prev.hasNext()) prev.next().setTrashed(true);

    if(plantilla.getMimeType() === MimeType.GOOGLE_SHEETS){
      ssId = plantilla.makeCopy('TMP_DD_' + new Date().getTime()).getId(); temporal = true;
    }else{
      var blob = plantilla.getBlob();
      var recurso = {name:'TMP_DD_' + new Date().getTime(), mimeType:'application/vnd.google-apps.spreadsheet'};
      var convertido = Drive.Files.insert(recurso, blob, {convert:true, supportsAllDrives:true});
      ssId = convertido.id; temporal = true;
    }
    var ss = SpreadsheetApp.openById(ssId);
    var sh = ss.getSheets()[0];
    try{ sh.setHiddenGridlines(true); }catch(e){}
    diligenciarFormatoDiseno(sh, d);
    SpreadsheetApp.flush();
    Utilities.sleep(700);

    var pdfUrl = 'https://docs.google.com/spreadsheets/d/' + ssId +
      '/export?format=pdf&size=letter&portrait=true&fitw=true&scale=4' +
      '&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false&fzr=false' +
      '&horizontal_alignment=CENTER&vertical_alignment=MIDDLE' +
      '&top_margin=0.30&bottom_margin=0.30&left_margin=0.30&right_margin=0.30' +
      '&gid=' + sh.getSheetId() + '&range=' + DD_FORMATO_RANGE;
    var resp = UrlFetchApp.fetch(pdfUrl, {headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions:true});
    if(resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) throw new Error('No se pudo exportar el formato a PDF.');

    var f = carpetaDest.createFile(resp.getBlob().setName(nombre).setContentType('application/pdf'));
    try{ f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
    return {ok:true, id:f.getId(), url:f.getUrl(), filename:nombre};
  }catch(e){
    try{ return generarFormatoDisenoHTML(body); }catch(e2){ return {ok:false, error:String(e)}; }
  }finally{
    if(temporal && ssId){ try{ DriveApp.getFileById(ssId).setTrashed(true); }catch(e){} }
  }
}

// Ubica la plantilla .xlsx del formato en tu Drive (por ID o por nombre).
function obtenerPlantillaFormato(){
  try{
    if(DD_FORMATO_TEMPLATE_ID){ return DriveApp.getFileById(DD_FORMATO_TEMPLATE_ID); }
    var it = DriveApp.getFilesByName(DD_FORMATO_TEMPLATE_NAME);
    if(it.hasNext()) return it.next();
    // intento flexible: cualquier archivo que empiece por "MF-F-QHSE-142"
    var q = DriveApp.searchFiles('title contains "MF-F-QHSE-142"');
    if(q.hasNext()) return q.next();
  }catch(e){}
  return null;
}

// Rellena la plantilla (hoja Google) con los datos de la solicitud, respetando el
// layout del MF-F-QHSE-142. Anexa el valor a la etiqueta (formulario "de línea").
function diligenciarFormatoDiseno(sh, d){
  d = d || {};
  var tipos = d.tipos || [];
  function put(a1, valor){ try{ var r=sh.getRange(a1); r.setValue(String(r.getValue()||'') + '   ' + (valor==null?'':valor)); }catch(e){} }
  function multi(a1, valor){ try{ var r=sh.getRange(a1); r.setValue(String(r.getValue()||'') + '\n' + (valor==null?'':valor)); r.setWrap(true); r.setVerticalAlignment('top'); }catch(e){} }
  // Pone una X (recuadro de marca vacío)
  function equis(a1){ try{ var r=sh.getRange(a1); r.setValue('X'); r.setHorizontalAlignment('center'); r.setVerticalAlignment('middle'); r.setFontWeight('bold'); }catch(e){} }
  // Antepone una X a una etiqueta (cuando no hay recuadro aparte)
  function marcaLabel(a1){ try{ var r=sh.getRange(a1); r.setValue('X  ' + String(r.getValue()||'')); r.setFontWeight('bold'); }catch(e){} }
  // Datos generales (valor a continuación de la etiqueta)
  put('A5', d.nombre_solicita);
  put('A6', d.area);
  put('D6', d.contacto);
  put('A7', d.lugar);
  put('A8', d.nombre_proyecto);
  // Prioridad: C9 ALTA · D9 MEDIA · E9 BAJA (sin recuadro → se marca la opción)
  var pcell = {alta:'C9', media:'D9', baja:'E9'}[d.prioridad];
  if(pcell) marcaLabel(pcell);
  // Tipo de solicitud (encabezados fila 13, sin recuadro → se marca la opción)
  var tmap = {levantamiento_3d:'A13', modelado_3d:'B13', diseno_3d:'C13', planos:'D13', informes_aef:'E13', ficha_tecnica:'F13', simulaciones:'I13'};
  for(var i=0;i<tipos.length;i++){ if(tmap[tipos[i]]) marcaLabel(tmap[tipos[i]]); }
  // Descripción (área A24:J28)
  multi('A24', d.descripcion);
  // Memoria de cálculo: recuadro H29 (SI) / J29 (NO) · Norma: H30 (SI) / J30 (NO)
  equis(d.requiere_memoria_calculo ? 'H29' : 'J29');
  equis(d.requiere_norma ? 'H30' : 'J30');
  put('A31', d.norma_cual);
  // Info adicional (A32:J35)
  multi('A32', d.info_adicional);
}

// Respaldo: genera el formato como PDF por HTML (si no hay plantilla .xlsx).
function generarFormatoDisenoHTML(body){
  try{
    var d = body || {};
    var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var tipos = d.tipos || [];
    var chk = function(k){ return tipos.indexOf(k)>=0 ? '&#9745;' : '&#9744;'; }; // ☑ / ☐
    var mark = function(cond){ return cond ? '&#9745; S&iacute;' : '&#9744; No'; };
    var pr = function(p){ return (d.prioridad===p) ? '<b style="color:#FF6600">&#9745; '+p.toUpperCase()+'</b>' : '&#9744; '+p.toUpperCase(); };
    var fecha = d.created_at ? new Date(d.created_at) : new Date();
    var fstr = Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var css = 'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px;margin:24px}'+
      '.hd{display:table;width:100%;border:1px solid #333;border-collapse:collapse}'+
      '.hd>div{display:table-cell;border:1px solid #333;padding:6px 8px;vertical-align:middle}'+
      '.hd .t{width:62%;font-size:18px;font-weight:bold;text-align:center}'+
      '.hd .m{font-size:10px}'+
      'table.f{width:100%;border-collapse:collapse;margin-top:10px}'+
      'table.f td{border:1px solid #333;padding:6px 8px;vertical-align:top}'+
      '.lbl{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.4px}'+
      '.val{font-size:12px;font-weight:bold;margin-top:2px}'+
      '.sec{background:#111;color:#fff;font-weight:bold;padding:5px 8px;margin-top:12px;font-size:11px;letter-spacing:1px}'+
      '.tipos td{font-size:11px}'+
      '.box{border:1px solid #333;padding:8px;min-height:48px;margin-top:2px;font-size:12px;white-space:pre-wrap}'+
      '.nota{margin-top:14px;font-size:9px;color:#555;border-top:1px solid #ccc;padding-top:6px}';
    var html = '<html><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+
      '<div class="hd">'+
        '<div class="t">SOLICITUD DE TAREA</div>'+
        '<div class="m">Versi&oacute;n: 001<br>Fecha: 09/10/2025<br>C&oacute;digo: MF-F-QHSE-142<br>P&aacute;gina: 1 de 1</div>'+
      '</div>'+
      '<div style="text-align:right;margin-top:6px;font-size:11px">Radicado: <b>'+esc(d.codigo||'')+'</b> &nbsp;&middot;&nbsp; '+esc(fstr)+'</div>'+
      '<table class="f">'+
        '<tr><td colspan="2"><div class="lbl">Nombre de quien solicita</div><div class="val">'+esc(d.nombre_solicita)+'</div></td></tr>'+
        '<tr><td width="50%"><div class="lbl">&Aacute;rea</div><div class="val">'+esc(d.area)+'</div></td>'+
            '<td width="50%"><div class="lbl">Contacto</div><div class="val">'+esc(d.contacto)+'</div></td></tr>'+
        '<tr><td colspan="2"><div class="lbl">Lugar de la solicitud</div><div class="val">'+esc(d.lugar)+'</div></td></tr>'+
        '<tr><td colspan="2"><div class="lbl">Nombre del proyecto</div><div class="val">'+esc(d.nombre_proyecto)+'</div></td></tr>'+
        '<tr><td colspan="2"><div class="lbl">Prioridad de la solicitud</div>'+
            '<div class="val">'+pr('alta')+' &nbsp;&nbsp; '+pr('media')+' &nbsp;&nbsp; '+pr('baja')+'</div></td></tr>'+
      '</table>'+
      '<div class="sec">TIPO DE SOLICITUD</div>'+
      '<table class="f tipos">'+
        '<tr><td>'+chk('levantamiento_3d')+' Levantamiento y modelado 3D</td><td>'+chk('modelado_3d')+' Modelado 3D</td></tr>'+
        '<tr><td>'+chk('diseno_3d')+' Dise&ntilde;o y modelado 3D</td><td>'+chk('planos')+' Planos</td></tr>'+
        '<tr><td>'+chk('informes_aef')+' Informes / AEF</td><td>'+chk('ficha_tecnica')+' Ficha t&eacute;cnica</td></tr>'+
        '<tr><td>'+chk('simulaciones')+' Simulaciones</td><td></td></tr>'+
      '</table>'+
      '<div class="sec">DESCRIPCI&Oacute;N DE LA SOLICITUD</div><div class="box">'+esc(d.descripcion)+'</div>'+
      '<table class="f" style="margin-top:10px">'+
        '<tr><td width="50%"><div class="lbl">&iquest;Requiere memoria de c&aacute;lculo?</div><div class="val">'+mark(d.requiere_memoria_calculo)+'</div></td>'+
            '<td width="50%"><div class="lbl">&iquest;Requiere cumplimiento de norma?</div><div class="val">'+mark(d.requiere_norma)+(d.requiere_norma&&d.norma_cual?(' &mdash; '+esc(d.norma_cual)):'')+'</div></td></tr>'+
      '</table>'+
      '<div class="sec">&iquest;INFORMACI&Oacute;N ADICIONAL PARA LA ENTREGA?</div><div class="box">'+esc(d.info_adicional)+'</div>'+
      '<div class="nota">NOTA: La asignaci&oacute;n del tiempo y la prioridad, en caso de ser necesario, ser&aacute; consultada con el l&iacute;der del &aacute;rea QA/QC y con el l&iacute;der del &aacute;rea solicitante. De lo contrario es criterio del dise&ntilde;ador industrial el orden en que se ejecutan las solicitudes radicadas.</div>'+
      '</body></html>';
    var nombre = (d.codigo||('DD-'+Date.now()))+'.pdf';
    var carpeta = ddFolderDestino('formatos', d.codigo);
    var iguales = carpeta.getFilesByName(nombre);
    while(iguales.hasNext()) iguales.next().setTrashed(true);
    var pdf = Utilities.newBlob(html, 'text/html', nombre).getAs('application/pdf').setName(nombre);
    var f = carpeta.createFile(pdf);
    try{ f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }catch(e){}
    return {ok:true, id:f.getId(), url:f.getUrl(), filename:nombre};
  }catch(e){ return {ok:false, error:String(e)}; }
}

// ==== PROCEDIMIENTOS: listar archivos de una carpeta ====
// Devuelve todos los archivos (no solo PDF, no carpetas) ordenados por nombre.
// Formato: [{ n:nombre, i:id, m:mimeType, f:fechaModificacionISO }]
function listarArchivosCarpeta(folderId){
  if(!folderId) return [];
  var out = [];
  try{
    var folder = DriveApp.getFolderById(folderId);
    var it = folder.getFiles();
    while(it.hasNext()){
      var f = it.next();
      out.push({
        n: f.getName(),
        i: f.getId(),
        m: f.getMimeType(),
        f: f.getLastUpdated().toISOString()
      });
    }
  }catch(err){
    return [];
  }
  out.sort(function(a,b){ return a.n.localeCompare(b.n, 'es', {numeric:true}); });
  return out;
}

function salida(obj, callback){
  var json = JSON.stringify(obj);
  if(callback){
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
