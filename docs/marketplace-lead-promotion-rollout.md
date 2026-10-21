# Promozione manuale dei lead Marketplace

## Stato del rilascio

Le due migration sono applicate. Collaudo isolato e concorrente superato. Il codice
consente ora l'attivazione esplicita del superadmin solo con archivio vendite pronto
e motore compensi generale attivo. Il flag database resta false: nessuna attivazione
automatica al rilascio. I paragrafi degli step seguenti conservano lo storico del lavoro.

Configurazione: Team / Impostazioni compensi / Promozione lead Marketplace. Salvare
minuti e importo non attiva il servizio. Selezionare Abilita promozione lead e salvare
richiede conferma. Zero minuti e zero EUR ammessi. Spegnere il servizio blocca nuove
promozioni/vendite attribuite; le vendite gia catturate e i loro rimborsi vengono
comunque riconciliati. Nessuna cancellazione di storico o liquidazioni.

Sicurezze applicative: schema assente impedisce claim e attivazione; motore generale
spento impedisce claim e attivazione. Il rilascio admin resta consentito anche da spento.
Controlli ripetuti nelle API e nelle RPC. L'API impostazioni aggiorna solo le tre nuove
colonne, senza alterare i compensi esistenti. Nessuna pagina QA inclusa nel rilascio.

## Regole approvate

- Comando `Vendi il Lead` nella sola tab Lead / Marketplace, al posto della colonna Acquisti.
- Disponibile solo dopo i minuti configurati dal superadmin, dalla pubblicazione nel Marketplace pubblico.
- Attesa 0 consentita. Importo fisso in euro, memorizzato all'assegnazione.
- Un membro attivo con permesso di lavorazione lead puo assegnare a se stesso la promozione; gli altri vedono il nome del membro.
- Il superadmin puo assegnare a un collaboratore idoneo, riassegnare o rilasciare la promozione.
- Un acquisto pubblico completato dopo l'assegnazione attribuisce il compenso al promotore, anche se spontaneo e anche se l'acquirente e PRIME.
- Acquisti nella Prime Zone esclusi. Restano separati dai compensi Account Manager.
- Un solo compenso per lead: nessun raddoppio per slot condivisi, retry o ripubblicazioni. Un rimborso comporta storno tracciato, senza cancellare liquidazioni gia avvenute.
- Nessuna attribuzione retroattiva a vendite anteriori alla promozione.
- Nessun cambiamento a qualifica, ultima attivita, prima lavorazione o presa in carico dei Nuovi Lead.

## Step 1: foundation SQL

Applicare `supabase/migrations/202610210001_marketplace_lead_promotion_foundation.sql`.
La migration include RLS e revoca gli accessi diretti anon/authenticated: non aggiungere policy automatiche.

Aggiunge tre colonne alle impostazioni compensi: attivazione (false), attesa (0), importo (0).
Non modifica `feature_enabled` generale o i compensi esistenti. Aggiunge registrazione della
promozione, storico e due RPC riservate al server. Lo step 2 collega soltanto la RPC impostazioni.

Non aggiunge trigger, non sostituisce funzioni esistenti e non genera eventi di compenso.
Acquisti, Wallet, rimborsi, fatture e commissioni PRIME restano invariati. La funzione deve
rimanere disattivata: questo step NON abilita ancora pulsante o compenso automatico.

La transazione ha timeout di lock di 5 secondi e statement di 60 secondi. In caso di errore
non proseguire con il rilascio. Prerequisiti: struttura compensi del 17 agosto, pubblicazione
PRIME/pubblica del 16 agosto e funzione `can_take_owner_request` del 16 ottobre.

## Garanzie della registrazione

La RPC di assegnazione blocca la riga del singolo lead, come l'acquisto Wallet, e controlla
una revisione attesa. Un secondo comando concorrente non puo sovrascrivere l'assegnazione.
Le operazioni cambiano esclusivamente la promozione e il suo storico, non il lead.

Sono esclusi lead privati, esauriti, scaduti, non pubblicati o non disponibili. I minuti
sono verificati dal server; l'orologio del browser non puo anticipare l'assegnazione.
Prima della cattura acquisto, il controllo del canale andra ripetuto sulla transazione
Wallet immutabile, non sulla visibilita corrente del lead o sulla sola iscrizione PRIME.

Importo e minuti vengono copiati nell'assegnazione. Richiamare lo stesso comando per il
medesimo membro non aggiorna data, tariffa o storico. Una riassegnazione autorizzata e invece
una nuova assegnazione, con la tariffa allora vigente. Il rilascio e consentito al superadmin
anche quando la nuova funzione e disattivata. Le promozioni convertite non sono riassegnabili.

Pubblicazione, ripubblicazione e uscita dalla Prime Zone aggiornano gia `leads.published_at`.
La promozione memorizza quella data: un nuovo periodo di pubblicazione richiede una nuova
presa in carico e non eredita silenziosamente il promotore precedente.

## Step successivi prima di attivare

1. Verificare in lettura la migration applicata e la funzione ancora disattivata.
2. Collegare impostazioni e API protette, con fallback se lo schema non e disponibile.
3. Introdurre il nuovo tipo di evento nel sistema compensi, report, filtri e viste dei membri.
4. Catturare l'assegnazione valida al momento dell'acquisto pubblico con idempotenza per lead,
   senza modificare prezzi, addebiti o commissioni Prime Zone. Evitare attribuzioni basate
   soltanto sull'assegnazione corrente letta dopo la vendita.
5. Integrare storni e riconciliazione dei rimborsi, preservando le liquidazioni gia registrate.
6. Aggiungere la colonna Promozione e gli strumenti del superadmin; non allargare i permessi PM.
7. Testare in ambiente isolato e anteprima, rilasciare con flag off e attivare solo dopo approvazione.

## Verifiche locali dello step 1

Test PostgreSQL isolato: migration e riapplicazione; default disattivato; compensi preesistenti
invariati; impostazioni riservate al superadmin; attesa e importi anche zero; gate del motore
generale; esclusione Prime Zone/venduti/scaduti; operatori non autorizzati o inattivi; nessuna
assegnazione a terzi da parte di un membro; conflitti di revisione; occupazione; riassegnazione
e rilascio admin; tariffa storicizzata; nuovo periodo di pubblicazione; impossibilita di
riassegnare una promozione convertita; storico; RLS e privilegi. Nessun evento compenso,
nessuna modifica ai lead o alla funzione acquisto e nessun trigger aggiunto.

I test usano fixture locali, non acquistano lead reali e non dimostrano da soli la concorrenza
tra connessioni di produzione: il rilascio completo richiedera anche i test di integrazione
tra assegnazione e acquisto. Non viene attivata nessuna automatizzazione in questo step.

## Step 2: configurazione isolata (locale, non pubblicata)

Verifica live in sola lettura del 21 ottobre: colonne e tabelle presenti, flag disattivato,
attesa e importo zero, nessuna assegnazione o voce di storico.

Nuovo endpoint `/api/admin/team/marketplace-promotion-settings`: accesso rigorosamente
superadmin, identita ricavata dalla sessione, nessun campo extra accettato. Salvataggio
dei soli tre nuovi parametri tramite RPC con audit atomico. Nessuna modifica alle API o
agli importi preesistenti. Risposte non memorizzabili; schema assente o illeggibile
disabilita il salvataggio senza impedire l'uso delle altre impostazioni compensi.

Nuova sezione in Team / Impostazioni compensi: minuti e compenso EUR, salvataggio
indipendente, zero ammesso, massimo due decimali. Limiti applicativi: 525600 minuti e
10000 EUR. Attivazione bloccata anche lato API dal gate di sviluppo
`marketplacePromotionEngineReady = false`. Non rimuovere il gate prima di completare
cattura acquisto, compenso una tantum, rimborsi e test di integrazione.

Test eseguiti: TypeScript completo, ESLint dei file interessati, test unitari di
validazione/fallback, API reale con autenticazione e database simulati (401/403, input
non valido, identita non falsificabile, zero, blocco attivazione, errori RPC/schema),
nuova esecuzione dei test PostgreSQL dello step 1. Playwright sul componente reale a
1440, 390 e 320 px: nessun overflow o errore JS, salvataggio zero e decimali, errore
visibile per minuti frazionari. Nessuna scrittura sul database live.

Restano da realizzare API/UI della promozione, cattura e liquidazione del compenso,
storni e verifiche finali. Questa configurazione non abilita ancora "Vendi il Lead".

## Step 3: API e colonna Promozione (locale, non pubblicato)

L'endpoint `/api/admin/leads/promotions` richiede il permesso lead in lettura o scrittura.
La lettura accetta solo UUID e al massimo 100 ID, interroga esclusivamente i lead della
pagina corrente e non espone contatti PM o elenchi di utenti estranei alla promozione.
I candidati sono quelli gia autorizzati alla lavorazione: il membro vede solo se stesso,
il superadmin puo scegliere fra i collaboratori attivi autorizzati. I promotori correnti
restano riconoscibili anche se non piu selezionabili, con nome e colore del membro.

Comandi rigorosamente validati: identita dalla sessione, revisione attesa e RPC atomica.
Il rilascio e riservato al superadmin, anche a funzione disattivata; qualsiasi claim e
ancora bloccato dal gate di sviluppo. Nessuna API nuova puo anticipare l'attivazione.
Schema mancante rende indisponibile solo la promozione; i lead restano consultabili.

Solo nella tab Marketplace la colonna Acquisti diventa Promozione. Contiene attesa,
Vendi il Lead o Promosso da; per il superadmin selezione, riassegnazione e rilascio con
conferma. Tutte le altre tab mantengono la precedente colonna Acquisti. Nessun polling
remoto: lettura al cambio pagina/rientro finestra e dopo un comando, conto alla rovescia
locale riferito all'orologio server. Aggiornamenti limitati ai metadati promozione;
il completamento di un comando non attende il caricamento dell'intero elenco lead.

Test API con database simulato: permessi, massimo ID, candidati propri, colori, pubblicazione
precedente non ereditata, esclusione Prime Zone, conversione, attivazione bloccata,
rilascio admin, conflitti ed errori schema. Test UI sul componente e hook reali con API
simulate: ruoli membro/admin, attesa, claim, riassegnazione e rilascio, gate disattivato,
assenza richieste dopo uscita dalla tab; screenshot a 1440, 390 e 320 px senza overflow
o errori JavaScript. Test PostgreSQL dello step 1 rieseguiti. Nessuna assegnazione live.

Operazione successiva: migrazione additiva per il tipo compenso e la cattura immutabile
dell'assegnazione durante l'acquisto pubblico, idempotenza per lead e storni rimborsi.
Non abilitare il gate e non pubblicare la funzionalita come completa prima dei relativi test.

## Step 4: compensi e rimborsi (locale, migration da applicare)

File: `supabase/migrations/202610210002_marketplace_promotion_compensations.sql`.
Richiede lo step 1 applicato. Non applicata automaticamente al database live.
Eseguire come migration SQL completa; contiene gia RLS e privilegi, non aggiungere policy
automatiche. Timeout lock 5 secondi e transazione unica: in caso di errore fermarsi.

Aggiunge il tipo `marketplace_promotion_sale` al ledger e una tabella riservata delle
vendite catturate. Non riscrive acquisto Wallet, commissioni PRIME, rimborsi o liquidazioni
esistenti. Un trigger limitato all'inserimento di acquisti Wallet completati registra
esclusivamente il promotore presente durante la transazione, con membro, importo, revisione
e pubblicazione. Con flag promozione o motore generale disattivato non registra nulla.
Non acquisisce pagamenti storici, aggiornamenti di vecchi movimenti, ricariche o bonus.

Il trigger riusa il lock sul lead dell'acquisto e rende la promozione convertita, impedendo
riassegnazioni successive. La chiave primaria sul lead garantisce un solo compenso anche
su slot condivisi, retry, rimborsi o ripubblicazioni. La cattura e atomica con l'acquisto:
un rollback annulla entrambe, non rimane un credito al collaboratore senza acquisto.
Non esegue chiamate esterne o calcoli del ledger nella transazione del pagamento.
Un eventuale errore della cattura a funzione abilitata annulla l'acquisto, non viene
ignorato silenziosamente: verificare l'integrazione completa prima dell'attivazione.

Elaborazione separata dopo risposta acquisto/rimborso e nel cron gia esistente. Queue
durabile con batch massimo 100, lock SKIP LOCKED e retry con backoff. Identita e tariffa
non sono ricavate dall'assegnazione corrente. Solo evidenze pubbliche esplicite sono
ammesse; nessun controllo sull'abbonamento PRIME del compratore. Il vecchio worker AM
continua a considerare soltanto gli acquisti Prime Zone.

Rimborso pagato della vendita che ha generato il compenso: una sola voce negativa
`Lead rimborsato - storno promozione Marketplace`, collegata alla voce originale. Un
rimborso di un altro slot non storna quel compenso. Nessuna cancellazione di eventi,
liquidazioni o allocazioni gia pagate. Il saldo negativo riduce le future disponibilita
di liquidazione; non effettua recuperi monetari automatici. Anche disabilitando nuove
promozioni si completano vendite gia catturate e relativi storni. Zero EUR viene
registrato come conversione senza inserire eventi di importo zero.

Report e filtri admin/membro/CSV riconoscono Vendita lead Marketplace. Le formule dei
totali e delle liquidazioni preesistenti includono gia gli eventi positivi e negativi,
senza riscritture. I lock per membro coincidono con quelli delle liquidazioni manuali.

Test PostgreSQL isolato con ledger e funzioni di report/liquidazione reali: cattura e
rollback, flag off, assenza promotore, nessuna retroattivita, uno per lead, snapshot,
esclusione privati/evidenze incomplete/pubblicazione vecchia, storno prima/dopo worker,
prima/dopo liquidazione, refund multipli o di altro slot, flag disattivati dopo vendita,
zero, retry dopo errore e riapplicazione migration. Funzioni finanziarie esistenti
invariate. Test worker con client simulato: batch, schema assente ed errori non bloccanti.
TypeScript, ESLint e test delle impostazioni compensi completati.

Questi test non sostituiscono un test end-to-end con connessioni concorrenti e il vero
acquisto in anteprima. Il gate applicativo resta false; non pubblicato e non attivato.
Prossimo passo: applicazione migration con flag off, verifica read-only e collaudo finale
prima del rilascio controllato e dell'attivazione esplicita.

## Verifica dopo applicazione dello step 4

Il 21 ottobre l'utente ha confermato l'applicazione della seconda migration. Controlli
live in sola lettura: tabella vendite presente, quattro RPC previste esposte, lettura
anonima delle vendite negata, flag promozione false, zero assegnazioni e vendite catturate.
Nessun acquisto, storno, compenso o cambio impostazioni eseguito in produzione.

Collaudo isolato esteso caricando direttamente la funzione SQL di acquisto esistente
`202608160007_prime_zone_purchase.sql`, senza riscriverne il corpo. Verificati due
acquisti condivisi di PM differenti sullo stesso lead (un compenso), acquisto esclusivo,
addebiti e saldi Wallet esatti, slot aggiornati, acquisto privato e acquisto con flag off
inalterati, tentativo duplicato rifiutato senza un nuovo movimento. Verificato anche
il caso now() della transazione precedente alla presa in carico: la cattura resta valida
perche segue il lock effettivo e non un confronto ingenuo sui timestamp.

La fixture usa PostgreSQL isolato con enum Wallet e lead, tabella termini, resolver del
prezzo e controllo accesso Prime sostituiti da fixture locali. Non rappresenta un test
browser con pagamento reale o concorrenza fra connessioni indipendenti. Nessun servizio
PostgreSQL multi-connessione risulta disponibile localmente. Restano quindi da eseguire
verifica integrata in anteprima e collaudo concorrente prima di rimuovere il gate.

Rieseguiti con esito positivo i test delle API impostazioni/promozioni, del worker
e i quattro test unitari delle impostazioni compensi. Il codice applicativo resta
locale, non pubblicato; nessuna ulteriore migration richiesta per questo controllo.

## Collaudo concorrente e browser completato

Superati i limiti dell'ultimo controllo mediante PostgreSQL 18.4 temporaneo locale,
accessibile solo su loopback, installato esclusivamente sotto tmp (nessuna dipendenza
applicativa modificata). Connessioni indipendenti e attese dei lock osservate su
pg_stat_activity: claim concorrenti, rollback, entrambi gli ordini acquisto/riassegnazione,
due slot condivisi, worker paralleli, storni concorrenti e lock delle liquidazioni.

Collaudo browser collegato all'handler API effettivo e al PostgreSQL temporaneo, con
override soltanto dell'identita e del gate di sviluppo nel bundle di test. Due browser
concorrenti, attesa, colori, comandi del superadmin e utente read-only verificati.
Screenshot desktop/mobile senza overflow o errori JS. Nessun dato o pagamento reale.

Server PostgreSQL arrestato e pagina QA rimossa. Gate applicativo e flag online non
modificati. Dettagli, limiti e prossimo passo in `docs/marketplace-lead-promotion-collaudo.md`.

## Rollback

Prima dell'attivazione lasciare il flag disattivato e mantenere le strutture additive.
Non eliminare tabelle o storico per ripristinare un'interfaccia. Dopo l'attivazione preservare
sempre compensi e rettifiche maturati; un rollback non deve cancellare obblighi gia registrati.
