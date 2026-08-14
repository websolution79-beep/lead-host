# Lead Host - Backup e disaster recovery

## Obiettivo

Il motore crea una copia indipendente e cifrata di database, Supabase Storage e repository Git. I processi di backup leggono la produzione ma non eseguono scritture sul database o sui bucket Supabase.

Supabase Pro resta il primo livello di recupero con i backup gestiti giornalieri. Cloudflare R2 e GitHub Actions costituiscono la copia esterna per incidenti più estesi.

## Sicurezza operativa

- Il workflow usa `pg_dump`, che produce uno snapshot consistente senza fermare le normali scritture.
- `--lock-wait-timeout=5s` impedisce al backup di attendere a lungo un lock applicativo.
- I file temporanei vengono eliminati dal runner anche in caso di errore.
- Database e file Storage sono cifrati AES-256-GCM prima del caricamento.
- I file Storage sono content-addressed: un oggetto identico viene caricato una sola volta.
- Il job ordinario non cancella oggetti da R2.
- Il ripristino Storage è bloccato se non viene indicato esplicitamente un progetto isolato.

## Configurazione richiesta

### 1. Supabase Pro

Verificare in Supabase Dashboard che `Database > Backups` mostri un backup giornaliero recente e la retention prevista dal piano.

### 2. Cloudflare R2

Creare un bucket privato, ad esempio `leadhost-disaster-recovery`, e un token API limitato a quel bucket. Il bucket non deve essere esposto con dominio pubblico o `r2.dev`.

### 3. Chiave di cifratura

Generare una chiave una sola volta:

```bash
npm run backup:generate-key
```

Conservare il valore in:

1. GitHub Actions Secret `BACKUP_ENCRYPTION_KEY`;
2. password manager del titolare;
3. seconda copia offline protetta.

Se la chiave viene persa, i backup non sono recuperabili.

### 4. GitHub Actions Secrets

Configurare nel repository:

- `BACKUP_SUPABASE_DB_URL`: connessione PostgreSQL con password, preferibilmente Session Pooler;
- `BACKUP_SUPABASE_URL`: URL del progetto;
- `BACKUP_SUPABASE_SERVICE_ROLE_KEY`: chiave server per leggere Storage;
- `BACKUP_R2_ACCOUNT_ID`;
- `BACKUP_R2_ACCESS_KEY_ID`;
- `BACKUP_R2_SECRET_ACCESS_KEY`;
- `BACKUP_R2_BUCKET`;
- `BACKUP_ENCRYPTION_KEY`.

Creare la Repository Variable `BACKUP_ENABLED=true` solo dopo il primo test manuale riuscito. Finche la variabile non esiste, le esecuzioni programmate vengono saltate.

## Frequenza

- Database: ogni giorno alle 02:27 UTC.
- Storage: ogni giorno nella stessa esecuzione.
- Mirror Git: domenica alle 03:41 UTC.
- Supabase Pro: backup gestito giornaliero indipendente dai workflow.

## Primo collaudo

1. Lasciare `BACKUP_ENABLED` non configurata.
2. Aprire GitHub Actions e avviare manualmente `Disaster recovery backup`.
3. Verificare che i job `Database cifrato`, `Supabase Storage incrementale` e `Verifica backup esterno` siano verdi.
4. Controllare su R2 la presenza dei manifesti `lead-host/manifests/database/latest.json` e `lead-host/manifests/storage/latest.json`.
5. Eseguire un ripristino in un progetto Supabase temporaneo.
6. Solo dopo il ripristino riuscito, impostare `BACKUP_ENABLED=true`.

## Ripristino database

Il ripristino non e automatizzato intenzionalmente. Va eseguito su un nuovo progetto Supabase o su un ambiente isolato:

1. scaricare il file indicato dal manifesto database;
2. decifrarlo con `encrypt-file.mjs decrypt`;
3. validarlo con `pg_restore --list`;
4. applicare prima le migration del repository al progetto vuoto;
5. eseguire un ripristino controllato, verificando conflitti con gli schemi gestiti `auth` e `storage`;
6. confrontare i conteggi delle tabelle con la produzione o con il manifesto dell'incidente.

Non eseguire `pg_restore --clean` sul progetto di produzione senza una procedura d'incidente approvata.

## Ripristino Storage

Impostare le variabili R2, la chiave di cifratura e:

```bash
ALLOW_STORAGE_RESTORE=RESTORE_TO_ISOLATED_PROJECT
RESTORE_TARGET_SUPABASE_URL=https://progetto-test.supabase.co
RESTORE_TARGET_SUPABASE_SERVICE_ROLE_KEY=...
npm run backup:restore-storage
```

Lo script verifica il checksum di ogni file prima dell'upload.

## Retention consigliata

- manifesti e dump giornalieri: 14 giorni;
- copie settimanali: 8 settimane;
- copie mensili: 12 mesi;
- blob Storage non piu referenziati: almeno 90 giorni.

La prima versione non cancella automaticamente alcun backup. Le lifecycle rules R2 saranno abilitate solo dopo che il ripristino e stato testato, per evitare cancellazioni premature.

## Verifica trimestrale

Ogni tre mesi creare un progetto Supabase temporaneo e verificare almeno:

- utenti Auth e profili PM;
- lead e relativi stati;
- wallet, ricariche, acquisti e coupon;
- abbonamenti Marketing;
- ruoli Team e permessi;
- CRM, documenti, immagini e branding;
- impostazioni commerciali e template.

