# Invibe · Pannello Controllo Venditori

PWA (React + Vite) per i venditori/PR Invibe. Ogni venditore vede i propri clienti
(filtrati per codice PR) e a che punto sono nel funnel; l'ufficio vede tutti + classifica.
Sola lettura. Stessa infrastruttura delle altre app Invibe (Supabase `kiqghrxygraijcozdmkp`, Vercel).

## Come funziona
- **Login**: email + password (bcrypt, `pgcrypto`). Gli account li crea l'ufficio.
- **Isolamento**: ogni lettura passa da funzioni Postgres `SECURITY DEFINER`; un venditore
  non può vedere i dati altrui nemmeno bypassando l'interfaccia. Le tabelle non sono leggibili
  direttamente con la chiave pubblica.
- **Dati**: tabella `prenotazioni`, chiave unica = **codice capogruppo** (`cod`). Il sync dal
  foglio funnel fa upsert su `cod`: aggiorna lo stato esistente, mai doppioni.

## Sviluppo
```bash
npm install
npm run dev
```
Le variabili Supabase hanno un fallback pubblico integrato; per sovrascriverle usa `.env`
(vedi `.env.example`). La chiave è `publishable`, pubblica per design.

## Deploy (Vercel)
Push su `main` → deploy automatico. Nessuna env obbligatoria (fallback integrati).

## Database (Supabase)
Tabelle: `venditori`, `venditori_sessioni`, `prenotazioni`.
Funzioni RPC: `venditore_login`, `venditore_me`, `prenotazioni_lista`, `venditore_logout`.
Lo schema è già applicato sul progetto. Migrazioni: `vendite_panel_schema`, `vendite_panel_fix_searchpath`.

### Creare un account venditore
```sql
insert into public.venditori (email, nome, codice_pr, ruolo, pass_hash)
values ('mario@invibe.it','Mario Rossi','MR12','venditore', crypt('LA_PASSWORD', gen_salt('bf')));
```
Ruoli: `admin` (ufficio, vede tutti), `venditore`, `canale` (es. SO = Social).

## Sync dal foglio funnel
Vedi `Sync_Vendite.gs` (Google Apps Script). Imposta le Proprietà script
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `FUNNEL_SHEET_ID`), lancia
`syncVenditeAnteprima()` (sola lettura) e poi `syncVendite()`; `installaTriggerVendite()`
per l'automatismo ogni 15 min. Trova da solo il tab e le colonne per intestazione,
quindi regge il cambio foglio di ottobre (basta aggiornare `FUNNEL_SHEET_ID`).
