# Presenze e assenze - calendario condiviso del team

## Ambito

- Pagina `/admin/presenze`, voce di menu per Super Admin e membri attivi, desktop e mobile.
- Lettura condivisa degli eventi; membri autorizzati a creare, modificare ed eliminare solo i propri.
- Super Admin autorizzati a gestire tutti gli eventi. Verifiche su pagina server, componente e API.
- Nessuna modifica ai permessi dei ruoli e nessun accesso diretto Supabase per utenti autenticati.
- Nessun collegamento a pipeline, compensi, notifiche o timbrature.

## Attivazione

1. Applicare `supabase/migrations/202610190001_team_calendar.sql` nel progetto corretto.
   La migration abilita RLS e revoca l'accesso a anon/authenticated esplicitamente.
   Non aggiungere policy automatiche o concedere l'accesso diretto ai membri del team.
2. Pubblicare e verificare `/admin/presenze` con un account Super Admin.
3. Verificare menu e pagina con un membro attivo; i PM senza ruolo team non hanno accesso.
4. Inserire, modificare ed eliminare un proprio evento; aprire un evento altrui in sola lettura.
5. Verificare anche via API che non sia possibile modificare il proprietario o cancellare eventi altrui.

La migration originale e gia applicata. L'apertura al team non richiede nuove migration:
RLS e grant restano invariati; l'accesso avviene esclusivamente tramite le API autenticate.

Se la migration non e ancora presente, solo la nuova pagina mostra un avviso e disabilita l'inserimento.
Le sezioni esistenti non interrogano la nuova tabella.

## Comportamento

- Colore del membro letto da `team_members.badge_color`, stato con icona e testo.
- Presenze simultanee di membri diversi sempre ammesse.
- Sovrapposizioni dello stesso membro richiedono una conferma esplicita.
- Un'assenza prevale nel riepilogo "adesso". Nel calendario restano visibili entrambi gli eventi.
- Nessun evento non equivale ad assenza: il riepilogo mostra "Non indicato adesso".
- Riepilogo riferito a tutti i membri attivi, non ai filtri o al periodo del calendario.
- Intervalli di assenza tutto il giorno includono il giorno finale.
- In Giorno/Settimana gli eventi tutto il giorno appaiono come bande 09:00-20:00 per ciascuna data,
  senza riga separata. Il clic riapre l'evento originale; i dati salvati e il riepilogo non cambiano.
- Mese e agenda mantengono gli intervalli originali, con dicitura "Intera giornata" nell'agenda.
- Eventi con orario e piu giorni sono un intervallo continuo fra inizio e fine.
- Ricorrenza settimanale nello stesso giorno, con scadenza obbligatoria entro un anno.
- Modifica/eliminazione di una ricorrenza riguarda tutta la serie, segnalato prima dell'operazione.
- Fuso Europe/Rome; ricorrenze mantengono l'orario locale al cambio dell'ora legale.
- Aggiornamento degli eventi tramite pulsante; riepilogo temporale ricalcolato ogni minuto.
- Modifica/eliminazione protette da confronto `updated_at` per evitare sovrascritture concorrenti.
- I membri hanno solo il proprio nome attivo nel modulo evento; il filtro di lettura mostra tutti gli attivi.
- L'API controlla sia il membro richiesto sia il proprietario attuale prima di una modifica.
  Update e delete includono il filtro `member_id` nella scrittura, oltre alla revisione, per proteggere
  anche da riassegnazioni simultanee. La modifica dei campi nel browser non amplia i permessi.
- Prima versione limitata a 5000 serie; errore esplicito, non troncamento silenzioso.
- Nessun dato dimostrativo viene inserito in produzione.

## Verifica

`npx tsx --test src/lib/team-calendar.test.ts src/lib/team-calendar-access.test.ts`

Test UI con API simulate: desktop 1440, mobile 390 e 320 pixel; inserimento assenza lunga,
filtri, assenza di overflow, nessun errore JavaScript, API senza sessione 401 e pagina senza sessione 307.
Questi test non sostituiscono la prova di persistenza dopo l'applicazione della migration.
Verificati inoltre gli handler API reali con dipendenze simulate: lettura condivisa, CRUD propri,
403 su eventi altrui e riassegnazioni tentate, 409 su revisioni obsolete e riassegnazioni concorrenti.
UI membro verificata a 1440/390/320 pixel: menu presente, selezione limitata a se stessi,
eventi altrui in sola lettura e calendario non mostrato a un profilo solo PM.

## Rollback

Ripristinare il deployment precedente senza cancellare la tabella: non ha trigger o effetti
sulle tabelle esistenti e gli eventi restano conservati. Non eliminare dati per un rollback grafico.
Il rollback al precedente deployment riservato ai Super Admin conserva gli eventi gia inseriti.
