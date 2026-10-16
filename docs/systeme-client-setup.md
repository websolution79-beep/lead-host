# Collegare LeadHostPro al CRM di Lead Host

Configurazione del collegamento, flussi per landing, associazioni dei campi e verifica dei contatti importati.

## Cosa serve

Il collegamento importa i nuovi invii Opt-In nel tuo CRM privato. Non trasferisce automaticamente i contatti storici e non sincronizza le fasi delle pipeline nei due servizi.

- Un account Lead Host con Modulo Marketing attivo.
- Il tuo account LeadHostPro su leadhostpro.it, distinto da quello degli altri clienti.
- Una landing con un modulo che raccolga almeno nome ed email.
- Accesso alla sezione Impostazioni > Webhook di LeadHostPro.

## 1. Prepara il CRM

Apri Marketing > CRM e prepara le fasi di destinazione, per esempio Lead Milano e Lead Roma. Ogni collegamento usa esclusivamente la pipeline del tuo account.

## 2. Crea il collegamento personale

Apri Marketing > Integrazioni e seleziona Crea collegamento. Il collegamento nasce in pausa.

In Configurazione webhook trovi il tuo URL e il segreto, mostrato una sola volta. Copiali direttamente nei campi corrispondenti di LeadHostPro. Non condividere il segreto con altri clienti, non inserirlo nelle landing e non inviarlo per email.

Per il collegamento definitivo usa https://www.leadhost.it/app/marketing/integrazioni. Non usare un URL di preview o localhost.

## 3. Configura LeadHostPro

Nel tuo account su leadhostpro.it apri Impostazioni > Webhook > Crea e compila i seguenti campi.

Salva il webhook come attivo. Durante la preparazione mantieni invece l'importazione generale di Lead Host in pausa: i due interruttori sono indipendenti.

Seleziona solo Opt-In, non Contatto creato, tag, vendite o altri eventi. Usa il servizio webhook firmato delle Impostazioni, non una semplice chiamata URL da una regola di automazione.

| Campo | Valore |
| --- | --- |
| Nome | Lead Host CRM |
| URL | Il tuo URL webhook copiato da Lead Host |
| Segreto | Il segreto mostrato da Lead Host |
| Evento | Solo Opt-In |

## 4. Crea i flussi

Apri Nuovo flusso oppure modifica il Flusso iniziale, se presente.

Una pagina appartiene a un solo flusso dello stesso account. Tutte le altre pagine raccoglie le pagine non assegnate agli altri flussi. Una pagina assegnata a un flusso in pausa non passa automaticamente al flusso generale.

Il primo salvataggio della configurazione precedente richiede conferma e mantiene l'importazione generale in pausa. La duplicazione crea una bozza in pausa: cambia nome e pagine prima di salvarla.

Gli URL vengono confrontati senza parametri UTM, frammenti e barra finale. Non occorre un flusso diverso per ogni campagna Meta che porta alla stessa landing.

- Nome riconoscibile, per esempio Proprietari Milano.
- Fase di destinazione del tuo CRM.
- Pagine selezionate con l'URL completo, oppure Tutte le altre pagine per il flusso generale.
- Associazioni dei campi indipendenti per ciascun flusso.

## 5. Associa i campi

Il nome tecnico di un campo LeadHostPro può essere diverso dal testo visibile sul modulo. Gli esempi sotto non sostituiscono i nomi effettivamente inviati dal tuo modulo.

Associa Nome e Cognome oppure un unico Nome e cognome, senza sovrapporre le due alternative. Nome finale ed email devono essere validi per importare il contatto.

| Origine, come esempio | Destinazione |
| --- | --- |
| first_name | Nome |
| last_name | Cognome |
| email | Email |
| city | Città |
| property_type | Tipologia immobile |
| Una domanda personalizzata | Risposta aggiuntiva, con una tua etichetta |
| Un campo che non serve | Non importare |

## Rileva i campi personalizzati

Il rilevamento conserva nomi tecnici, etichette e pagina di origine, non copie dei valori compilati. LeadHostPro può includere altri campi del profilo del contatto: la lista rilevata non garantisce che ogni campo sia un input presente su quella specifica landing.

1. Salva almeno un flusso, anche in pausa. Mantieni in pausa l'importazione generale.
2. Seleziona Rileva per 15 minuti.
3. Compila il modulo pubblico con un contatto di prova nuovo, usando dati non sensibili.
4. Torna in Lead Host e seleziona Aggiorna campi.
5. Apri il flusso, aggiungi i campi rilevati e controlla ogni associazione. I campi non riconosciuti restano Non importare finché non li configuri.
6. Salva il flusso e interrompi il rilevamento quando hai finito.

## Dove trovare le risposte aggiuntive

Le Risposte aggiuntive compaiono nel dettaglio del proprietario, nella sezione Risposte da LeadHostPro, in sola lettura. Non vengono mescolate alle note manuali del PM.

## 6. Attiva e verifica

Usa contatti nuovi e distinti per provare le diverse landing. Inviare la stessa persona prima da Milano e poi da Roma non verifica due acquisizioni indipendenti.

1. Abilita i flussi pronti e salva.
2. Attiva l'importazione generale e conferma. Un flusso Pronto non importa se l'interruttore generale resta in pausa.
3. Invia un nuovo contatto di prova dal modulo della landing.
4. In Ultimi invii seleziona Controlla ricezione: verifica Importato o Collegato al CRM.
5. Apri il CRM e controlla fase, campi standard e risposte aggiuntive.
6. Ripeti sulle altre landing usando altri contatti di prova nuovi.

## Contatti ripetuti e prima provenienza

La versione attuale mantiene una scheda per contatto riconosciuto. Un nuovo invio della stessa persona non crea automaticamente una seconda scheda immobile.

Le informazioni già compilate, la fase di lavorazione, le note e i promemoria non vengono sovrascritti automaticamente. L'importazione completa soltanto i campi vuoti compatibili. Anche le risposte aggiuntive già presenti vengono conservate.

Per un contatto esistente, LeadHostPro può comunicare la prima pagina di acquisizione anche quando compila un altro modulo in seguito. Il filtro segue quella provenienza, non deduce l'ultima landing da città o risposte. Un contatto acquisito prima a Milano può restare associato al flusso Milano dopo un nuovo invio da Roma.

Se un proprietario propone un secondo immobile, verifica manualmente la scheda: il riconoscimento automatico di più immobili dello stesso proprietario non fa parte di questa versione.

## Pausa e problemi di ricezione

- Per fermare tutte le importazioni usa l'interruttore generale. Per una sola pagina metti in pausa il relativo flusso.
- Controlla Ultimi invii per gli eventi esclusi o da verificare. Un evento escluso mentre l'importazione era in pausa non viene importato automaticamente riattivando l'interruttore.
- Se mancano campi, verifica nomi tecnici e associazioni. I campi non associati non vengono importati.
- Se compare un conflitto di salvataggio, conserva o annota le modifiche della bozza, ricarica la configurazione e riapplicale senza sovrascrivere modifiche di un'altra scheda.
- Se termina l'accesso al Modulo Marketing o l'account viene sospeso, l'importazione non può proseguire.

## Segreto smarrito e assistenza

Se non hai conservato il segreto, metti in pausa l'importazione e usa Rigenera segreto. Aggiorna subito il webhook nel tuo account LeadHostPro. Il vecchio segreto smette di funzionare: la rigenerazione non mostra quello precedente.

Non inviare password o segreti all'assistenza. Sono sufficienti data e ora del test, pagina di origine ed esito mostrato nella cronologia; non condividere dati personali non necessari.
