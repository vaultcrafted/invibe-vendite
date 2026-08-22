/*  Sync Vendite Invibe — foglio funnel → Supabase (tabella prenotazioni)
 *  ---------------------------------------------------------------------
 *  COSA FA
 *    Legge il foglio funnel, tiene solo le righe con CODICE CAPOGRUPPO valido,
 *    e fa UPSERT su Supabase con chiave = cod. Aggiorna le prenotazioni esistenti
 *    (lo stato cambia) e inserisce solo capigruppo davvero nuovi. Mai doppioni:
 *    la colonna cod è UNIQUE nel database.
 *
 *  PRIMA DELL'USO (una volta)
 *    Progetto → Impostazioni → Proprietà script, aggiungi:
 *      SUPABASE_URL           = https://kiqghrxygraijcozdmkp.supabase.co
 *      SUPABASE_SERVICE_ROLE  = <service_role key del progetto>
 *      FUNNEL_SHEET_ID        = 1mMjK6kugD94eE2-OaazISk0c3b1CxyFUHbe8C5Na9bo   (aggiorna a ottobre)
 *
 *  USO
 *    syncVenditeAnteprima()  → SOLA LETTURA: dice quante righe valide, quante nuove
 *                              e quante aggiornate, e cosa scarterebbe. Lancia SEMPRE questa prima.
 *    syncVendite()           → scrive davvero su Supabase.
 *    installaTriggerVendite()→ installa un trigger ogni 15 minuti.
 */

function _cfg_(k){ var v = PropertiesService.getScriptProperties().getProperty(k); if(!v) throw new Error('Manca la proprietà script: '+k); return v; }

// Trova il foglio (tab) che contiene le intestazioni Canale + Funnel, e mappa le colonne per NOME.
function _leggiFunnel_(){
  var ss = SpreadsheetApp.openById(_cfg_('FUNNEL_SHEET_ID'));
  var sheets = ss.getSheets();
  for (var s=0; s<sheets.length; s++){
    var sh = sheets[s];
    var values = sh.getDataRange().getValues();
    var hdrRow = -1, H = {};
    for (var i=0; i<Math.min(values.length, 15); i++){
      var row = values[i].map(function(x){ return String(x||'').trim().toLowerCase(); });
      if (row.indexOf('canale') > -1 && row.indexOf('funnel') > -1){ hdrRow = i;
        row.forEach(function(name, idx){ if(name) H[name] = idx; }); break; }
    }
    if (hdrRow === -1) continue;

    var col = function(names){ for (var n=0;n<names.length;n++){ if (H[names[n]] != null) return H[names[n]]; } return -1; };
    var cNome = col(['nome']);
    var cCog  = col(['cognome']);              // qui sta il codice capogruppo
    var cPax  = col(['pax']);
    var cMeta = col(['scegli la meta','meta']);
    var cCan  = col(['canale']);
    var cFun  = col(['funnel']);
    var cCity = col(['da quale città ci stai scrivendo?','città','citta']);
    var cData = col(['data']);
    var cTur  = [ col(['scegli turno pag']), col(['scegli turno corfu','scegli turno corfù']),
                  col(['scegli turno zante']), col(['scegli turno gallipoli']), col(['scegli il turno sardegna']) ];

    var codeRe = /^\s*\d{2,4}[A-Za-zÀ-ÿ]/;
    var canRe  = /^(SO|SC|[A-Z]{2,3}\d{1,3})$/;
    var funRe  = /^\s*(\d)\s*-\s*(.+?)\s*$/;
    var out = [];
    for (var r=hdrRow+1; r<values.length; r++){
      var row = values[r];
      var cod = String(row[cCog]||'').trim();
      if (!codeRe.test(cod)) continue;
      var can = String(row[cCan]||'').trim();
      if (!canRe.test(can)) continue;
      var fun = String(row[cFun]||'').trim();
      var fm = fun.match(funRe);
      if (!fm) continue;
      var turno = '';
      for (var t=0;t<cTur.length;t++){ if (cTur[t]>-1 && String(row[cTur[t]]||'').trim()){
        var tm = String(row[cTur[t]]).match(/Turno\s*(\d)/i); turno = tm ? ('T'+tm[1]) : ''; break; } }
      var pax = parseInt(String(row[cPax]||'0').replace(/[^0-9]/g,''),10) || 0;
      out.push({
        cod: cod,
        nome: cNome>-1 ? String(row[cNome]||'').trim() : '',
        pax: pax,
        meta: cMeta>-1 ? String(row[cMeta]||'').trim() : '',
        turno: turno,
        canale: can,
        stage: parseInt(fm[1],10),
        stato: fun,
        citta: cCity>-1 ? String(row[cCity]||'').trim() : '',
        data_richiesta: cData>-1 ? String(row[cData]||'').trim().slice(0,10) : ''
      });
    }
    // dedup su cod: l'ultima riga (più recente, in basso) vince
    var map = {}; out.forEach(function(o){ map[o.cod] = o; });
    return { tab: sh.getName(), rows: Object.keys(map).map(function(k){ return map[k]; }) };
  }
  throw new Error('Nessun foglio con intestazioni Canale + Funnel trovato.');
}

function syncVenditeAnteprima(){
  var res = _leggiFunnel_();
  var url = _cfg_('SUPABASE_URL'), key = _cfg_('SUPABASE_SERVICE_ROLE');
  // codici già presenti nel DB
  var r = UrlFetchApp.fetch(url+'/rest/v1/prenotazioni?select=cod', {
    headers:{ apikey:key, Authorization:'Bearer '+key }, muteHttpExceptions:true });
  var esistenti = {}; try{ JSON.parse(r.getContentText()).forEach(function(x){ esistenti[x.cod]=true; }); }catch(e){}
  var nuovi=0, agg=0;
  res.rows.forEach(function(o){ if(esistenti[o.cod]) agg++; else nuovi++; });
  var byStage={}; res.rows.forEach(function(o){ byStage[o.stage]=(byStage[o.stage]||0)+1; });
  Logger.log('Foglio/tab: %s', res.tab);
  Logger.log('Capigruppo validi: %s  →  nuovi da inserire: %s | esistenti da aggiornare: %s', res.rows.length, nuovi, agg);
  Logger.log('Per stadio: %s', JSON.stringify(byStage));
  Logger.log('(sola lettura: non ho scritto nulla)');
  return res.rows.length;
}

function syncVendite(){
  var res = _leggiFunnel_();
  var url = _cfg_('SUPABASE_URL'), key = _cfg_('SUPABASE_SERVICE_ROLE');
  var rows = res.rows;
  var CH = 200, scritti = 0;
  for (var i=0;i<rows.length;i+=CH){
    var batch = rows.slice(i, i+CH);
    var resp = UrlFetchApp.fetch(url+'/rest/v1/prenotazioni?on_conflict=cod', {
      method:'post', contentType:'application/json',
      headers:{ apikey:key, Authorization:'Bearer '+key, Prefer:'resolution=merge-duplicates,return=minimal' },
      payload: JSON.stringify(batch), muteHttpExceptions:true });
    var code = resp.getResponseCode();
    if (code>=200 && code<300){ scritti += batch.length; }
    else { Logger.log('ERRORE batch %s: HTTP %s — %s', i, code, resp.getContentText().slice(0,300)); }
  }
  Logger.log('Sync completato: %s capigruppo su %s (tab "%s").', scritti, rows.length, res.tab);
  return scritti;
}

function installaTriggerVendite(){
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==='syncVendite') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncVendite').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installato: syncVendite ogni 15 minuti.');
}
