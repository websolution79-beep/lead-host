# Collaudo promozione lead Marketplace

Data: 21 ottobre 2026. Esito: PASS in ambiente locale isolato.
Nessuna attivazione, pubblicazione o scrittura economica in produzione.

## Ambiente

- PostgreSQL 18.4 temporaneo, bind esclusivamente 127.0.0.1, dati fittizi.
- Tre connessioni indipendenti per le gare SQL; ulteriori connessioni per le API.
- Migration compensi, assegnazione, cattura vendita e storno effettive del progetto.
- Funzione SQL di acquisto Wallet esistente caricata senza riscriverne il corpo.
- Report e liquidazioni del progetto, con resolver prezzo e accesso Prime di fixture.
- Browser Chromium su componenti e hook effettivi, con handler API compilato dal progetto.
- Solo autenticazione e gate di sviluppo sostituiti nel bundle di test isolato.
- Nessuna connessione a Supabase o Stripe durante questi test.

## Concorrenza Verificata

| Caso | Esito |
| --- | --- |
| Due claim sulla stessa revisione | Un vincitore; secondo comando in attesa del lock e poi conflitto |
| Primo claim annullato con rollback | Il secondo puo acquisire il lead dalla revisione iniziale |
| Riassegnazione prima dell'acquisto | Compenso al membro della riassegnazione confermata |
| Acquisto prima della riassegnazione | Attribuzione congelata; riassegnazione rifiutata |
| Due acquisti condivisi da Wallet diversi | Entrambi completati, due slot, un solo compenso |
| Due worker sullo stesso compenso | Un solo evento positivo |
| Storno mentre il lock liquidazioni e occupato | Attesa effettiva sul lock del membro |
| Due elaborazioni parallele del rimborso | Un solo evento negativo |

Le attese sono state osservate tramite pg_stat_activity, non simulate con soli ritardi.

## Flusso Browser

Due browser hanno cliccato Vendi il Lead sul medesimo record. Il database ha conservato
un solo promotore e le due schermate hanno mostrato lo stesso vincitore; il browser
perdente ha ricevuto il conflitto previsto, senza sovrascrivere la presa in carico.

Verificati: attesa non cliccabile, assenza selezione altrui per membro, colore del
promotore, selezione/riassegnazione/rilascio del superadmin, conferma di rilascio,
rifiuto API per utente in sola lettura. Screenshot a 1440, 390 e 320 px: nessun overflow
orizzontale o errore JavaScript. Le risposte API provenivano dal PostgreSQL isolato,
non da risposte JSON inventate dal test browser.

## Finanza e Regressioni

Rieseguita la suite dei precedenti step: flag off, tariffa zero, snapshot importo/membro,
acquisto esclusivo e condiviso, saldi Wallet esatti, Prime Zone esclusa, transazione
iniziata prima del claim, nessuna attribuzione retroattiva, rollback atomico, rimborsi
prima/dopo worker e liquidazione, nessuna modifica ai pagamenti gia registrati,
storni anche dopo disattivazione, retry e recupero dopo errore, RLS e privilegi.

## Limiti e Prossimo Passo

Il collaudo usa utenti e accessi simulati, non una sessione Supabase di clienti reali.
PostgreSQL locale 18.4 non certifica la configurazione operativa del database remoto.
Non sono state inviate notifiche, email, pagamenti Stripe o richieste di rimborso reali.

Il server temporaneo e stato arrestato e la pagina QA rimossa dal sorgente applicativo.
Successivamente verificati anche interruttore, conferma/annullamento, disattivazione,
motore generale spento e schema vendite assente. Il gate di sviluppo e stato rimosso
solo dopo questi test; rimane il gate operativo controllato dalle impostazioni, con
verifiche di archivio e motore nelle API. Il flag remoto non e stato modificato.
Il rilascio controllato mantiene quindi la funzione inizialmente disattivata.
