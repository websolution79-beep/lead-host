# Recupero sessione durante la lavorazione dei lead

## Problema verificato

Le pagine riservate leggono i cookie HttpOnly, mentre le azioni della pipeline,
le presenze e il salvataggio usavano esclusivamente getSession() dello SDK browser.
Con sessione locale assente e cookie ancora valido la pagina resta aperta, ma
le azioni si fermano prima di interrogare le API. Riprodotto in browser isolato.
Non e stata acquisita la sessione privata del membro che ha segnalato il problema.

## Correzione

Solo l'area Lead usa un recupero condiviso: prima sessione SDK, poi POST same-origin
ad /api/auth/restore. Il server valida il token con le policy esistenti e controlla
identita attesa, profilo attivo e stato del membro. Se necessario rinnova il cookie.
Le API operative continuano a verificare tutti i permessi come prima.

Il refresh token non viene restituito al JavaScript: rimane nel cookie HttpOnly.
Risposte no-store, origine e Sec-Fetch-Site verificati. Nessun recupero anonimo,
cross-origin, su un altro account o per un collaboratore disattivato. Richieste
simultanee condividono un recupero; il token viene tenuto solo in memoria fino alla
scadenza e invalidato su sign-in/sign-out. Nessun retry automatico delle scritture.

Il salvataggio gestisce eccezioni di rete con finally: il pulsante non resta bloccato,
il modulo non si chiude e conserva le note. Se anche la sessione server e scaduta,
offre il login in un'altra scheda e permette di riprovare senza azzerare i campi.
Gli errori sono annunciati e portati in vista, anche nel modulo mobile lungo.

Nessuna migration, modifica ai ruoli, ai compensi o ai dati di lead reali.

## Collaudo

- Test client: token esistente, recupero concorrente, cache, nuovo login, account
  diverso, risposta di identita errata, errori temporanei, refresh SDK fallito,
  invalidazione dopo logout.
- Handler effettivo con autenticazione simulata: origine, cookie, rotazione,
  refresh HttpOnly, profilo/membro disattivato, cambio password obbligatorio,
  errori del provider e nessuna cancellazione cookie per errori transitori.
- Browser desktop 1440 e mobile 390: sessione locale mancante, caricamento fasi,
  spostamento, salvataggio, sessione completamente scaduta, login e retry,
  errore di rete e 403, note conservate, nessun retry implicito delle scritture.
- Test con soli dati fittizi e richieste esterne bloccate; nessuna chiamata o
  modifica di lead reali. Pagina QA rimossa prima della pubblicazione.
