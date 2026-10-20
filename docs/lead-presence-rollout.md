# Presenza temporanea sulle schede dei Nuovi Lead

## Ambito

Avviso nel dettaglio e nel modulo di modifica dei lead `to_verify`, per superadmin
e membri autorizzati alla lavorazione dei lead. Mostra gli altri operatori con nome
e colore personale. E informativo: non blocca lettura, chiamate o salvataggi.
Non riguarda le schede dei PM nel Marketplace.

Ogni apertura ha un identificativo distinto. Piu finestre dello stesso operatore
non producono avvisi verso se stesso; agli altri il nome appare una sola volta.
Chiudere una finestra non rimuove eventuali altre finestre ancora aperte.

## Ciclo di vita

- Controllo immediato all'apertura, poi un heartbeat ogni 30 secondi solo sulla scheda aperta.
- Presenza valida per 3 minuti dall'ultimo heartbeat accettato dal server.
- Rilascio alla chiusura normale o alla navigazione, con richiesta keepalive autenticata.
- Chiusura improvvisa o connessione interrotta: scadenza automatica.
- Riapertura o ritorno dalla cache del browser: nuova sessione, controllo immediato.
- Una chiusura lascia un marcatore interno non visibile per un giorno: impedisce
  a un heartbeat in ritardo di riattivare una finestra gia chiusa.
- Record scaduti ripuliti durante gli heartbeat; esclusi dalle letture anche se
  non c'e traffico per effettuare la pulizia. Non serve un cron.
- Se il controllo fallisce, l'avviso segnala l'indisponibilita. I nomi gia noti
  restano visibili solo entro la loro validita; nessuna conferma ingannevole di scheda libera.

La presenza significa scheda aperta con collegamento attivo, non chiamata certificata.
Se due operatori aprono nello stesso istante, il controllo successivo puo essere
necessario per mostrare entrambi: non e un blocco esclusivo. Browser e sistemi
operativi possono sospendere le pagine in background, soprattutto su cellulare;
dopo 3 minuti senza aggiornamenti la presenza scade anche in questo caso.

## Sicurezza e isolamento

Tabella autonoma `owner_request_presence`, RLS gia abilitata e accesso diretto
revocato a public/anon/authenticated. Solo il server puo chiamare la funzione.
L'API richiede permesso `leads:write`; l'identita proviene dalla sessione verificata,
non dal corpo della richiesta. Anche SQL verifica che l'operatore sia ancora attivo.
Una sessione non puo essere usata da un altro profilo o per un altro lead.

Nessuna scrittura su `owner_requests`, audit, ultima attivita, prima lavorazione,
assegnazioni, stati o compensi. Nessun polling dell'intera pipeline e nessun nuovo
servizio esterno. Il dettaglio e l'editor possono avere sessioni indipendenti sullo
stesso lead: chiudere l'editor lascia correttamente aperta quella del dettaglio.

## Rilascio controllato

1. Applicare `supabase/migrations/202610200002_owner_request_presence.sql`.
   La migration e additiva e include RLS; non aggiungere policy automatiche.
   Richiede la funzione `can_take_owner_request` della migration del 16 ottobre.
2. Verificare tabella, funzione, grant e diniego dell'accesso anonimo in lettura.
3. Pubblicare prima in anteprima, poi in produzione dopo build e controlli riusciti.
4. Aprire lo stesso lead da due account team: il secondo vede subito il primo;
   il primo vede il secondo al successivo heartbeat, entro circa 30 secondi.
5. Verificare apertura dell'editor, chiusura, piu finestre dello stesso utente,
   scadenza dopo interruzione degli aggiornamenti e nessun cambio all'ultima attivita.

Se la migration non e disponibile, solo il controllo presenze segnala indisponibilita:
la scheda e le operazioni preesistenti restano utilizzabili. Per rollback ripristinare
il deployment precedente; non serve cancellare tabelle o dati della piattaforma.

## Verifiche locali

- TypeScript, lint, test unitari di scadenza, deduplicazione e orologio client.
- SQL isolato: due operatori, piu schede proprie, isolamento per lead, rinnovo e
  scadenza esatta di 180 secondi, chiusure indipendenti, heartbeat ritardato,
  impossibilita di modificare sessioni altrui, RLS/grant, riapplicazione e lead invariati.
- Handler API reale con auth/DB simulati: 401/403, permessi, identita non falsificabile,
  validazione, heartbeat/rilascio, 503 per schema assente e 409 su sessione invalida.
- Browser con API simulate: 1440/390/320 pixel, colori e nomi lunghi, nessun overflow,
  avviso non bloccante, heartbeat, rilascio, assenza di richieste dopo la chiusura,
  nuova sessione alla riapertura, errore di rete e rimozione degli avvisi scaduti.

I test non effettuano scritture sui lead reali e non sostituiscono la verifica
autenticata in produzione dopo la migration.

## Verifica migration online

Il 20 ottobre 2026, dopo la conferma di applicazione, verificati esclusivamente
in lettura: tabella presente, RPC disponibile, accesso anonimo negato e nessuna
sessione esistente prima dell'attivazione. Nessuna presenza fittizia o modifica
di un lead reale e stata inserita in produzione durante questa verifica.
