# Email promozione Marketplace

## Modifiche

- Nuovo template `team.marketplace_promotion_earned` in Email / Template-Flussi /
  Team e compensi. Badge Membro interessato. Contenuti, CTA e attivazione modificabili.
- Destinatario dinamico: soltanto il membro titolare del compenso. Nessuna copia
  automatica ad admin, ruoli o collaboratori. Reply-To transazionale invariato.
- Invio dopo registrazione di un compenso positivo per promozione Marketplace,
  non dopo presa in carico e non per commissioni PRIME.
- Nessuna email per gli storni, le commissioni zero o le commissioni precedenti
  all'applicazione della migration.
- Notifica admin esistente: blocco opzionale Promozione assegnata a: Nome.
  Dati ricavati dalla vendita catturata, identificata dal singolo acquisto, non
  dall'assegnazione attuale del lead. Il secondo slot senza un nuovo compenso
  non viene presentato come una nuova vendita attribuita al promotore.
- Metatag admin: promotion_member_name, promotion_compensation, promotion_details.
  Quest'ultimo include la frase completa, oppure stringa vuota senza promotore.

## Installazione

Applicare `supabase/migrations/202610210003_marketplace_promotion_emails.sql` come
SQL completo, senza aggiungere policy automatiche. RLS e privilegi gia inclusi.
Transazione unica, timeout lock 5 secondi. Il flag promozione e gli importi non
vengono modificati. Non sono eseguiti invii dalla migration.

La migration accoda solo eventi nuovi. Il template admin salvato viene esteso
con il solo metatag opzionale; oggetto, corpo, attivazione e altri template
restano invariati. Nessuna modifica alle regole dei destinatari esistenti.

## Consegna e Sicurezza

Coda persistente separata dal ledger. Chiave unica sul compenso, lease con token,
SKIP LOCKED e retry con backoff. Un problema email non annulla il compenso o
l'acquisto. Il worker opera dopo la riconciliazione compensi e nel cron esistente.
Schema non ancora applicato: il worker email termina senza bloccare il resto.

Prima dell'invio verifica ledger, vendita, rimborsi, identita/attivazione del membro
e log di invio. Nessuna email se al momento del controllo il compenso risulta
gia stornato/rimborsato o il membro e inattivo. Un rimborso successivo al controllo
puo naturalmente avvenire mentre il provider sta consegnando il messaggio: non
si tengono lock finanziari durante chiamate di rete.

Chiave Resend stabile per compenso e log persistente evitano ripetizioni.
I retry automatici si fermano entro 23 ore e dopo al massimo 10 tentativi; i casi
ambigui diventano needs_review anziche ripetere un possibile invio oltre la
[finestra di idempotenza del provider](https://resend.com/docs/dashboard/emails/idempotency-keys).
Una modifica al template durante un retry puo richiedere verifica manuale se il
provider rifiuta un payload diverso sulla medesima chiave. Nessun reinvio storico
automatico quando si riabilita un template prima disattivato.

## Verifiche

Test PostgreSQL isolato: accodamento solo per eventi nuovi positivi, unicita,
token di lease, ripresa dopo crash, scadenza dei retry, compensi rimborsati/membri
inattivi esclusi, log sent riconosciuto, RLS, riapplicazione e personalizzazioni
template preservate. Suite acquisti/compensi precedente rieseguita.

Test worker con provider simulato: unico destinatario, metadati e chiave stabili,
assenza copie interne, log inviato, template spento, errori e configurazione assente,
schema mancante. Test template: metatag, escaping HTML, blocco admin opzionale,
preservazione contenuti personalizzati e nessun template storno.

Nessuna email reale inviata durante sviluppo o collaudo. L'utente ha confermato
l'applicazione della migration: verificate tabella, tre RPC e lettura anonima negata.
Verificata la presenza del nuovo blocco opzionale nel template admin salvato.
Parametri promozione rilevati e lasciati invariati: attiva, 90 minuti, 500 centesimi.

Il rilascio usa al massimo 10 email per esecuzione ordinaria, anche se il batch
compensi e maggiore. I retry restano nella coda dedicata. Nessuna email di prova
inviata a membri o admin e nessuna attivazione/modifica commerciale eseguita.
