# Integrazione Brevo

Lead Host rimane la fonte autorevole per profili, consensi, wallet, acquisti e
rimborsi. Brevo riceve una copia sincronizzata dei dati e gli eventi
comportamentali. Le email transazionali Lead Host continuano a usare il sistema
esistente.

## Variabili Vercel

Configurare in Production e Preview:

```text
BREVO_ENABLED=true
BREVO_API_KEY=xkeysib-...
BREVO_LIST_ID=123
BREVO_WEBHOOK_SECRET=<segreto-casuale-lungo>
```

`BREVO_API_KEY` e `BREVO_WEBHOOK_SECRET` devono essere variabili server-side e
Sensitive. Non usare il prefisso `NEXT_PUBLIC_`.

Per trovare `BREVO_LIST_ID`:

1. Aprire Brevo.
2. Andare in Contatti > Liste.
3. Aprire `Lead Host - Property Manager`.
4. Leggere l'ID numerico nell'URL della lista.
5. In alternativa usare `GET /v3/contacts/lists` con la API key.

## Attributi contatto richiesti

Gli attributi devono esistere in Brevo con questi nomi esatti:

| Attributo | Tipo Brevo consigliato |
| --- | --- |
| `NOME` | Testo |
| `COGNOME` | Testo |
| `DATA_ISCRIZIONE` | Data |
| `ULTIMO_ACCESSO` | Data |
| `STATO_ACCOUNT` | Testo |
| `CONSENSO_MARKETING` | Booleano |
| `STATO_CONSENSO_MARKETING` | Testo |
| `SALDO_WALLET` | Numero |
| `HA_RICARICATO_WALLET` | Booleano |
| `DATA_PRIMA_RICARICA` | Data |
| `DATA_ULTIMA_RICARICA` | Data |
| `NUMERO_RICARICHE` | Numero |
| `TOTALE_RICARICATO` | Numero |
| `NUMERO_LEAD_ACQUISTATI` | Numero |
| `DATA_PRIMO_LEAD_ACQUISTATO` | Data |
| `DATA_ULTIMO_LEAD_ACQUISTATO` | Data |
| `SPESA_LEAD_LORDA` | Numero |
| `TOTALE_RIACCREDITI_WALLET` | Numero |
| `SPESA_LEAD_NETTA` | Numero |
| `STATO_PM` | Testo |

Gli importi sono sincronizzati in euro. `profiles.id` viene inviato come
`ext_id`; tutti i PM vengono aggiunti alla lista indicata da `BREVO_LIST_ID`.

## Eventi

Il worker invia:

- `user_registered`
- `first_wallet_topup`
- `wallet_recharged`
- `first_lead_purchased`
- `lead_purchased`
- `wallet_refunded`
- `account_suspended`

Gli eventi economici includono importo in centesimi/euro e, quando disponibile,
modalità di acquisto, città, provincia e tipologia dell'opportunità. Non vengono
inviati contatti o indirizzi dei proprietari.

## Webhook disiscrizione

Creare in Brevo un webhook di tipo `marketing`:

```text
URL: https://www.leadhost.it/api/webhooks/brevo
Evento: unsubscribed
Autenticazione: Bearer token
Token: stesso valore di BREVO_WEBHOOK_SECRET
Batched: disattivato
```

L'endpoint accetta sia `unsubscribe` sia `unsubscribed`. La revoca viene
registrata come `withdrawn`, con storico e ID esterno idempotente. Le
riconciliazioni successive inviano sempre il valore Lead Host senza impostare
`emailBlacklisted=false`, quindi non possono riattivare una revoca.

Solo una nuova concessione esplicita effettuata dal PM nella pagina Profilo può
richiedere la rimozione della blacklist marketing in Brevo.

## Outbox e retry

La migration crea:

- `pm_marketing_preferences`: stato corrente del consenso;
- `pm_marketing_consent_events`: storico append-only;
- `pm_brevo_snapshots`: proiezione aggregata;
- `brevo_outbox`: coda transazionale.

Gli eventi sono identificati da `event_key` univoca. Il worker usa claim
atomico, lock, massimo 8 tentativi, exponential backoff, `Retry-After` e
`x-sib-ratelimit-reset`. Gli errori non recuperabili o oltre il limite finiscono
in `dead_letter`.

Il cron `/api/cron/brevo-sync` esegue ogni giorno riconciliazione e recupero. Le
operazioni normali avviano inoltre il worker con `after()` dopo avere risposto
all'utente.

## Strumenti amministrativi

`GET /api/admin/brevo/outbox` restituisce elementi aperti o falliti.

`POST /api/admin/brevo/outbox` supporta:

```json
{ "action": "process", "batchSize": 50 }
```

```json
{ "action": "reconcile" }
```

```json
{ "action": "requeue", "ids": ["UUID_OUTBOX"] }
```

Le route richiedono una sessione super admin.

## Attivazione

1. Applicare `202607260001_brevo_integration_foundation.sql`.
2. Verificare che la query termini con `Success. No rows returned`.
3. Creare/verificare gli attributi Brevo.
4. Impostare le quattro variabili Vercel.
5. Creare il webhook marketing Brevo.
6. Eseguire un redeploy.
7. Chiamare l'azione admin `reconcile` per processare subito il backfill, oppure
   attendere il cron giornaliero.

## Checklist test

1. Registrare un PM senza checkbox marketing.
2. Verificare contatto presente nella lista e `CONSENSO_MARKETING=false`.
3. Registrare un PM con checkbox marketing.
4. Verificare `CONSENSO_MARKETING=true` e evento `user_registered`.
5. Concedere e revocare il consenso dal Profilo.
6. Verificare lo storico in `pm_marketing_consent_events`.
7. Ricaricare il wallet e controllare attributi ed eventi top-up.
8. Acquistare un Lead e controllare attributi ed eventi purchase.
9. Riaccreditare il Lead e controllare importi netti ed evento refund.
10. Sospendere il PM e verificare stato ed evento.
11. Usare il link unsubscribe di una campagna di prova.
12. Verificare lo stato `withdrawn` in Lead Host.
13. Eseguire una riconciliazione e verificare che resti `withdrawn`.
14. Disattivare temporaneamente `BREVO_ENABLED`, generare un evento e
    verificare che l'operazione Lead Host riesca comunque.
15. Riattivare Brevo, processare la coda e verificare il recupero.
