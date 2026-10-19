/*  Sync Vendite Invibe — foglio bloccaposti → Supabase (tabella prenotazioni)
 *  ---------------------------------------------------------------------------
 *  COSA FA
 *    Legge la scheda del bloccaposti, tiene solo le righe con un CODICE
 *    CAPOGRUPPO valido (es. 121CAPUTO), un CANALE che è un PR vero (preso dalla
 *    tabella venditori) e uno stato nel FUNNEL. Poi fa UPSERT su Supabase con
 *    chiave = cod: aggiorna chi c'è già, inserisce chi è nuovo. Mai doppioni.
 *    Non cancella mai nulla dal database.
 *
 *  PRIMA DELL'USO (una volta)
 *    Impostazioni progetto (ingranaggio) → Proprietà script, aggiungi:
 *      SUPABASE_URL           = https://kiqghrxygraijcozdmkp.supabase.co
 *      SUPABASE_SERVICE_ROLE  = <chiave service_role del progetto Supabase>
 *      FUNNEL_SHEET_ID        = 1mMjK6kugD94eE2-OaazISk0c3b1CxyFUHbe8C5Na9bo
 *      FUNNEL_TAB             = Bloccaposti estate 2026      (facoltativa)
 *
 *  PIU' FOGLI (es. Bloccaposti 2026 + Bloccaposti 2027)
 *    Proprietà FUNNEL_SHEETS, una riga per foglio:  ID_DEL_FOGLIO | Nome scheda
 *    Se c'è, vince su FUNNEL_SHEET_ID / FUNNEL_TAB. Il nome scheda si può omettere:
 *    allora prende la prima scheda che ha le colonne Canale e Funnel.
 *    Se lo stesso codice capogruppo è in due fogli, vince l'ultimo dell'elenco.
 *    Comodo: aggiungiFoglioVendite('ID o link del foglio', 'Nome scheda') lo aggiunge da solo.
 *
 *  USO
 *    syncVenditeAnteprima()  → SOLA LETTURA. Dice cosa cambierebbe. Lanciala SEMPRE prima.
 *    syncVendite()           → scrive davvero su Supabase.
 *    installaTriggerVendite()→ fa partire syncVendite da solo ogni 30 minuti.
 *    rimuoviTriggerVendite() → spegne l'automatismo.
 */

var IV_TAB_DEFAULT = 'Bloccaposti estate 2026';

function _cfg_(k, opt){
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v && !opt) throw new Error('Manca la proprietà script: ' + k);
  return v;
}
function _norm_(s){ return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function _sb_(path, opts){
  var url = _cfg_('SUPABASE_URL'), key = _cfg_('SUPABASE_SERVICE_ROLE');
  opts = opts || {};
  opts.headers = Object.assign({ apikey: key, Authorization: 'Bearer ' + key }, opts.headers || {});
  opts.muteHttpExceptions = true;
  return UrlFetchApp.fetch(url + '/rest/v1/' + path, opts);
}
// Legge TUTTE le righe paginando: Supabase ne restituisce max 1000 per volta.
function _sbAll_(path){
  var out = [], step = 1000;
  for (var from = 0; ; from += step){
    var r = _sb_(path, { headers: { Range: from + '-' + (from + step - 1), 'Range-Unit': 'items' } });
    var code = r.getResponseCode();
    if (code >= 300) throw new Error('Supabase HTTP ' + code + ': ' + r.getContentText().slice(0, 200));
    var page = JSON.parse(r.getContentText());
    out = out.concat(page);
    if (page.length < step) break;
  }
  return out;
}
// Codici PR validi = codice_pr della tabella venditori (PR + canali Social/Scuole).
function _codiciPR_(){
  var m = {};
  _sbAll_('venditori?select=codice_pr&codice_pr=not.is.null').forEach(function(v){ m[String(v.codice_pr).trim()] = true; });
  return m;
}
function _dataTxt_(v){
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Europe/Rome', 'dd-MM-yyyy');
  return String(v || '').trim().slice(0, 10);
}

// Elenco dei fogli da leggere: FUNNEL_SHEETS (una riga "id | scheda") oppure il vecchio FUNNEL_SHEET_ID.
function _fogli_(){
  var lista = _cfg_('FUNNEL_SHEETS', true);
  if (lista){
    return lista.split(/\n|;/).map(function(r){ return r.trim(); }).filter(String).map(function(r){
      var p = r.split('|'); return { id: _idDaLink_(p[0]), tab: (p[1] || '').trim() };
    });
  }
  return [{ id: _cfg_('FUNNEL_SHEET_ID'), tab: _cfg_('FUNNEL_TAB', true) || IV_TAB_DEFAULT }];
}
function _idDaLink_(x){ var m = String(x).match(/\/d\/([a-zA-Z0-9_-]{20,})/); return (m ? m[1] : String(x)).trim(); }
function _intestazioni_(values){
  for (var i = 0; i < Math.min(values.length, 15); i++){
    var row = values[i].map(_norm_);
    if (row.indexOf('canale') > -1 && row.indexOf('funnel') > -1) return { hdr: i, H: row };
  }
  return null;
}

// Legge tutti i fogli e unisce: per lo stesso codice vince l'ultimo foglio dell'elenco.
function _leggiFunnel_(prOk){
  var map = {}, scarti = { senzaCodice: 0, canaleNonPR: 0, senzaFunnel: 0 }, nomi = [];
  _fogli_().forEach(function(f){
    var r = _leggiFoglio_(prOk, f.id, f.tab);
    nomi.push(r.tab + ' (' + r.rows.length + ')');
    r.rows.forEach(function(o){ map[o.cod] = o; });
    Object.keys(scarti).forEach(function(k){ scarti[k] += r.scarti[k]; });
  });
  return { tab: nomi.join(' + '), rows: Object.keys(map).map(function(k){ return map[k]; }), scarti: scarti };
}

function _leggiFoglio_(prOk, id, tabName){
  var ss = SpreadsheetApp.openById(id);
  var sh, found = null;
  if (tabName){
    sh = ss.getSheetByName(tabName);
    if (!sh) throw new Error('Scheda "' + tabName + '" non trovata nel foglio "' + ss.getName() + '".');
  } else {
    var tutte = ss.getSheets();
    for (var t = 0; t < tutte.length && !sh; t++){
      var v = tutte[t].getRange(1, 1, Math.min(15, tutte[t].getMaxRows()), tutte[t].getMaxColumns()).getValues();
      if (_intestazioni_(v)){ sh = tutte[t]; }
    }
    if (!sh) throw new Error('Nel foglio "' + ss.getName() + '" nessuna scheda ha le colonne Canale e Funnel.');
    tabName = sh.getName();
  }
  var values = sh.getDataRange().getValues();

  // riga intestazioni: la prima che contiene sia "canale" che "funnel"
  found = _intestazioni_(values);
  if (!found) throw new Error('Nella scheda "' + tabName + '" non trovo le intestazioni Canale e Funnel.');
  var hdr = found.hdr, H = found.H;

  var esatta  = function(n){ return H.indexOf(n); };
  var inizia  = function(p){ for (var c = 0; c < H.length; c++) if (H[c].indexOf(p) === 0) return c; return -1; };
  var cNome = esatta('nome'), cCog = esatta('cognome'), cPax = esatta('pax'), cCan = esatta('canale'), cFun = esatta('funnel');
  var cMeta = inizia('scegli la meta');
  var cCity = inizia('da quale citt');
  var cData = inizia('data e ora'); if (cData < 0) cData = esatta('data');
  var cTur = []; H.forEach(function(h, c){ if (h.indexOf('scegli il turno') === 0 || h.indexOf('scegli turno') === 0) cTur.push(c); });
  [['Nome', cNome], ['Cognome', cCog], ['Pax', cPax], ['Canale', cCan], ['Funnel', cFun]].forEach(function(x){
    if (x[1] < 0) throw new Error('Colonna "' + x[0] + '" non trovata.');
  });

  var codeRe = /^\s*\d{2,4}[A-Za-zÀ-ÿ]/;
  var funRe  = /^\s*(\d)\s*-\s*(.+?)\s*$/;
  var map = {}, scarti = { senzaCodice: 0, canaleNonPR: 0, senzaFunnel: 0 };
  for (var r = hdr + 1; r < values.length; r++){
    var v = values[r];
    var cod = String(v[cCog] || '').trim();
    if (!codeRe.test(cod)){ if (String(v[cCan] || '').trim()) scarti.senzaCodice++; continue; }
    var can = String(v[cCan] || '').trim();
    if (!prOk[can]){ if (can) scarti.canaleNonPR++; continue; }
    var fun = String(v[cFun] || '').trim(), stage;
    var fm = fun.match(funRe);
    if (fm) stage = parseInt(fm[1], 10);
    else {
      var fl = fun.toLowerCase();
      if (fl.indexOf('cancellat') > -1 || fl.indexOf('errati') > -1 || fl.indexOf('doppi') > -1) stage = 0;
      else { scarti.senzaFunnel++; continue; }
    }
    var turno = '';
    for (var t = 0; t < cTur.length; t++){
      var tv = String(v[cTur[t]] || '').trim();
      if (tv){ var tm = tv.match(/turno\s*(\d)/i); turno = tm ? 'T' + tm[1] : ''; break; }
    }
    // le righe sono in ordine di arrivo: per lo stesso codice vince l'ultima
    map[cod] = {
      cod: cod,
      nome: String(v[cNome] || '').trim(),
      pax: Math.round(Number(v[cPax]) || 0),
      meta: cMeta > -1 ? String(v[cMeta] || '').trim() : '',
      turno: turno,
      canale: can,
      stage: stage,
      stato: fun,
      citta: cCity > -1 ? String(v[cCity] || '').trim() : '',
      data_richiesta: cData > -1 ? _dataTxt_(v[cData]) : ''
    };
  }
  return { tab: ss.getName() + ' / ' + tabName, rows: Object.keys(map).map(function(k){ return map[k]; }), scarti: scarti };
}

function syncVenditeAnteprima(){
  var res = _leggiFunnel_(_codiciPR_());
  var db = {}; _sbAll_('prenotazioni?select=cod,stage,pax,canale').forEach(function(x){ db[x.cod] = x; });
  var nuovi = 0, cambiati = 0, uguali = 0, esempi = [];
  res.rows.forEach(function(o){
    var e = db[o.cod];
    if (!e) nuovi++;
    else if (e.stage !== o.stage || e.pax !== o.pax || e.canale !== o.canale){
      cambiati++;
      if (esempi.length < 10) esempi.push(o.cod + ': stato ' + e.stage + '→' + o.stage + ', pax ' + e.pax + '→' + o.pax + (e.canale !== o.canale ? ', PR ' + e.canale + '→' + o.canale : ''));
    } else uguali++;
  });
  var nelFoglio = {}; res.rows.forEach(function(o){ nelFoglio[o.cod] = true; });
  var soloDb = Object.keys(db).filter(function(k){ return !nelFoglio[k]; }).length;
  var perPR = {}; res.rows.forEach(function(o){ perPR[o.canale] = (perPR[o.canale] || 0) + 1; });
  var top = Object.keys(perPR).sort(function(a, b){ return perPR[b] - perPR[a]; }).map(function(k){ return k + ' ' + perPR[k]; });

  Logger.log('Fogli letti: %s', res.tab);
  Logger.log('Capigruppo validi nel foglio: %s', res.rows.length);
  Logger.log('  nuovi da inserire: %s | da aggiornare: %s | già uguali: %s', nuovi, cambiati, uguali);
  if (esempi.length) Logger.log('  esempi di aggiornamenti: \n    ' + esempi.join('\n    '));
  Logger.log('Nel database ma non più nel foglio (NON vengono toccati): %s', soloDb);
  Logger.log('Righe scartate: senza codice capogruppo %s, canale non PR %s, senza stato funnel %s',
    res.scarti.senzaCodice, res.scarti.canaleNonPR, res.scarti.senzaFunnel);
  Logger.log('Prenotazioni per PR: %s', top.join(' · '));
  Logger.log('(sola lettura: non ho scritto nulla)');
}

function syncVendite(){
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)){ Logger.log('Un altro sync è in corso: salto.'); return 0; }
  try {
    var res = _leggiFunnel_(_codiciPR_());
    var rows = res.rows, CH = 200, scritti = 0, errori = 0;
    for (var i = 0; i < rows.length; i += CH){
      var batch = rows.slice(i, i + CH);
      var resp = _sb_('prenotazioni?on_conflict=cod', {
        method: 'post', contentType: 'application/json',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        payload: JSON.stringify(batch.map(function(o){ o.updated_at = new Date().toISOString(); return o; }))
      });
      var code = resp.getResponseCode();
      if (code >= 200 && code < 300) scritti += batch.length;
      else { errori++; Logger.log('ERRORE blocco %s: HTTP %s — %s', i, code, resp.getContentText().slice(0, 300)); }
    }
    Logger.log('Sync completato: %s capigruppo su %s (scheda "%s")%s.', scritti, rows.length, res.tab, errori ? ' — ' + errori + ' blocchi con errore' : '');
    return scritti;
  } finally { lock.releaseLock(); }
}

function installaTriggerVendite(){
  rimuoviTriggerVendite();
  ScriptApp.newTrigger('syncVendite').timeBased().everyMinutes(30).create();
  Logger.log('Automatismo attivo: syncVendite ogni 30 minuti.');
}
function rimuoviTriggerVendite(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction() === 'syncVendite') ScriptApp.deleteTrigger(t); });
}

// Aggiunge un foglio all'elenco (link o ID). Se l'elenco non esiste ancora, ci mette prima il foglio attuale.
function aggiungiFoglioVendite(idOLink, scheda){
  if (!idOLink) throw new Error('Passa il link o l\'ID del foglio.');
  var props = PropertiesService.getScriptProperties();
  var righe = props.getProperty('FUNNEL_SHEETS');
  if (!righe){
    righe = props.getProperty('FUNNEL_SHEET_ID') + ' | ' + (props.getProperty('FUNNEL_TAB') || IV_TAB_DEFAULT);
  }
  var id = _idDaLink_(idOLink);
  if (righe.indexOf(id) === -1) righe += '\n' + id + ' | ' + (scheda || '');
  props.setProperty('FUNNEL_SHEETS', righe);
  Logger.log('Fogli letti dal sync:\n%s', righe);
}
