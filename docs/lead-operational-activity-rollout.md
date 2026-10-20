# Ultima attivita della pipeline Nuovi Lead

## Rilascio

1. Applicare in Supabase `supabase/migrations/202610200001_lead_operational_activity.sql` prima del rilascio applicativo. La migration abilita gia RLS: non aggiungere policy automatiche per gli utenti autenticati.
2. Verificare che la tabella `owner_request_operational_activity` esista e che abbia RLS attiva. I dati sono accessibili solo tramite le API server autorizzate.
3. Pubblicare l'applicazione e verificare le card con un account superadmin e un membro con permesso di modifica dei lead.

La migration aggiunge una tabella isolata e aggiorna la funzione di spostamento senza cambiare firma. Usa una transazione e timeout di lock di 5 secondi: in caso di errore non proseguire con il rilascio. Nessuna modifica a stati, assegnazioni, prezzi o compensi. Il prerequisito e la migration di presa in carico del 16 ottobre (`can_take_owner_request`).

## Significato dei dati

- Cambiare effettivamente fase, note o dati manuali della scheda aggiorna l'attivita.
- Aprire una scheda, salvare valori invariati, spostare nella stessa fase, cambiare presa in carico e aggiornare controlli automatici dei duplicati non aggiornano l'attivita.
- Una chiamata conta soltanto se viene documentata con una modifica: la data non certifica automaticamente un contatto telefonico.
- Il recupero dai vecchi audit e indicato come `Da storico`: i vecchi log possono includere operazioni senza variazioni effettive.
- Senza storico compare `Nessuna attivita registrata` con la data di arrivo, non una data di ultima lavorazione inventata.
- Lo stato visuale diventa ambra dopo 3 giorni e rosso dopo 7; per i lead senza storico l'eta si riferisce all'arrivo.
- L'ordine predefinito resta invariato. L'opzione `Meno lavorati di recente` ordina ciascuna colonna per data attivita, usando l'arrivo se assente.

## Controlli dopo la migration e il rilascio

1. Aprire e chiudere una scheda: la data deve restare invariata.
2. Salvare senza modifiche: la data deve restare invariata.
3. Aggiungere una nota: verificare la nuova data e l'assenza dell'etichetta `Da storico`.
4. Spostare un lead in un'altra fase: verificare data e conservazione del badge della prima lavorazione.
5. Cambiare soltanto la presa in carico: la data deve restare invariata.
6. Verificare l'ordinamento opzionale e il ritorno all'ordine attuale.
7. Controllare su smartphone i filtri, le card e lo scorrimento orizzontale delle colonne.

## Compatibilita e recupero

Il codice precedente continua a usare la stessa funzione di spostamento dopo la migration. Se occorre ripristinare la versione applicativa precedente, lasciare la tabella e le funzioni installate; non cancellare dati operativi per fare rollback.

Se la nuova lettura non e disponibile, la lista dei lead rimane utilizzabile e mostra `Ultima attivita non disponibile`. In caso di errore della registrazione dopo un salvataggio riuscito, l'editor informa esplicitamente che i dati sono salvati ma la data non e aggiornata: non viene richiesto di ripetere il salvataggio. Lo spostamento e la registrazione dell'attivita avvengono invece nella stessa transazione SQL.

## Verifiche locali effettuate

- TypeScript completo e lint dei file interessati.
- Test unitari di soglie, ordinamento, assenza di storico, salvataggi invariati e lettura compatibile in assenza della tabella.
- PostgreSQL locale isolato: migration e riapplicazione, recupero storico, variazione reale di fase, esclusione dei no-op, attribuzione iniziale preservata, rollback atomico e privilegi/RLS.
- Browser con API simulate, senza scritture live: viewport 1440, 390 e 320 pixel, ordinamento, stati delle card, apertura senza scritture e assenza di overflow della pagina.

## Verifica migration online del 20 ottobre 2026

Controllo esclusivamente in lettura dopo la conferma di applicazione: tabella presente,
389 attivita storiche, nuove funzioni RPC presenti e accesso anonimo negato.
Il caricatore reale dei lead admin completa senza errori: 440 richieste totali,
100 in verifica; 99 con attivita storica e una senza storico. Nessuna scrittura
o variazione di fase e stata effettuata sui lead reali per questi controlli.
