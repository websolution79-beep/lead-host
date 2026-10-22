# Iscrizione PM: check unico e attivazione marketing automatica

## Ambito

Nuovo modulo pubblico con una sola spunta obbligatoria, inizialmente non selezionata:

> Preso visione della Privacy Policy e accettazione dei Termini e Condizioni inclusa la possibilità di ricevere chiamate esplicative.

Link privacy e termini mantenuti. Nessuna autorizzazione ai cookie viene dedotta
dalla registrazione. L'attivazione marketing automatica e una regola operativa
richiesta dal titolare: non viene presentata nello storico come una spunta marketing
esplicita, ne come attestazione di conformita normativa.

## Implementazione

Il nuovo modulo invia signupNoticeVersion. Il server valida la versione, mantiene
legalAccepted obbligatorio e imposta l'attivazione automatica nei metadati Auth.
Il trigger di iscrizione esistente crea la preferenza granted e la coda Brevo come
prima; il worker e le sue regole di disiscrizione non sono modificati.

Nuova evidenza: source pm_registration_automatic, explicit_checkbox false,
automatic_activation true, versione e testo esatto del modulo. La data resta
quella di creazione del record. Nessuna riscrittura di eventi o preferenze storiche.

I vecchi moduli ancora aperti continuano a rispettare la scelta realmente mostrata,
anche quando la seconda spunta facoltativa non era selezionata. Nessuna migrazione
massiva degli iscritti e nessuna rimozione forzata delle blacklist Brevo.
L'utente puo continuare a modificare la preferenza dal profilo o disiscriversi.

La registrazione dell'accettazione dei termini usa profiles.id risolto tramite
auth_user_id, non l'UUID Auth. Una risposta fittizia a un'iscrizione duplicata non
produce una nuova evidenza senza un profilo corrispondente.

## Ordine Di Rilascio

1. Applicare integralmente 202610220001_pm_signup_automatic_marketing_evidence.sql.
   Non aggiungere policy RLS: non crea tabelle e preserva quelle esistenti.
2. Verificare RPC di readiness e trigger, senza registrazioni reali di prova.
3. Pubblicare il codice e controllare il nuovo modulo su desktop e mobile.

La readiness RPC e eseguibile solo dal service_role. Senza migration il server
non avvia iscrizioni del nuovo modulo: ritorna 503 prima di creare l'account.
Il modulo e il backend attualmente online restano invariati fino al rilascio.

## Collaudo

- Test del testo esatto, regola automatica e compatibilita con la scelta legacy.
- Handler di registrazione reale con provider simulati: obbligatorieta, versione,
  iscrizioni chiuse, gate della migration, metadati, profilo corretto, duplicati.
- PostgreSQL isolato: migration idempotente, storico immutato, sorgente automatica,
  collegamento Auth/profilo e vincoli di esecuzione della readiness.
- Client Brevo reale con fetch simulato: attributo marketing abilitato per i nuovi
  contatti granted, opt-out invariato, nessuna rimozione implicita della blacklist.
- Browser 1440, 390 e 320 px: un solo check obbligatorio, testo esatto e link,
  mancata spunta impedisce l'invio, cookie consent separato, nessun overflow.

Nessun account reale creato, nessuna email inviata e nessuna chiamata reale a Brevo
durante il collaudo. Pagina QA rimossa. Migration non applicata alla produzione
dall'agente; la pubblicazione attende la conferma della sua applicazione.
