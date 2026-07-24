import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowUp, BookOpen, CalendarDays, FileText } from "lucide-react";
import { PublicNav } from "@/components/public-nav";

export const metadata: Metadata = {
  title: "Condizioni Generali del Servizio",
  description: "Condizioni Generali del Servizio Lead Host.",
};

const termsDocument = {
  version: "1.0",
  lastUpdated: "24 luglio 2026",
  effectiveFrom: "24 luglio 2026",
} as const;

type TermsSection = {
  number: string;
  title: string;
  slug: string;
  content: ReactNode;
};

const sections: TermsSection[] = [
  {
    number: "1",
    title: "TITOLARE DEL SERVIZIO",
    slug: "titolare-del-servizio",
    content: (
      <>
        <p>Lead Host è un servizio gestito da:</p>
        <p className="whitespace-pre-line font-semibold text-ink">
          {`SOGI
Sede legale: Via Cogliate, Roma
Partita IVA: 17750971008
Email: info@leadhost.it`}
        </p>
        <p>
          di seguito anche <strong>“Lead Host”</strong>, <strong>“Gestore”</strong>{" "}
          o <strong>“Fornitore”</strong>.
        </p>
      </>
    ),
  },
  {
    number: "2",
    title: "DEFINIZIONI",
    slug: "definizioni",
    content: (
      <>
        <p>Ai fini delle presenti Condizioni:</p>
        <Definition title="Lead Host">
          La piattaforma digitale attraverso la quale vengono messe a disposizione
          dei Property Manager richieste relative alla gestione di immobili.
        </Definition>
        <Definition title="Utente">
          Il soggetto registrato sulla piattaforma Lead Host.
        </Definition>
        <Definition title="Property Manager o PM">
          L&apos;Utente che utilizza Lead Host per consultare e acquistare Lead
          relativi a proprietari o soggetti interessati a servizi di gestione
          immobiliare.
        </Definition>
        <Definition title="Proprietario">
          Il soggetto che ha manifestato interesse relativamente a servizi di
          gestione del proprio immobile e i cui dati possono essere associati a un
          Lead.
        </Definition>
        <Definition title="Lead">
          <p>
            L&apos;opportunità pubblicata sulla piattaforma derivante da una
            richiesta raccolta da Lead Host direttamente o attraverso propri canali
            di acquisizione.
          </p>
          <p>
            Il Lead comprende informazioni relative all&apos;immobile e alla
            richiesta del proprietario e, dopo l&apos;acquisto, consente
            l&apos;accesso ai dati di contatto previsti dalla piattaforma.
          </p>
        </Definition>
        <Definition title="Wallet">
          Il saldo virtuale interno associato all&apos;account del Property Manager
          e utilizzabile per acquistare Lead.
        </Definition>
        <Definition title="Ricarica">
          L&apos;operazione mediante la quale il Property Manager aggiunge credito
          al proprio Wallet attraverso i metodi di pagamento messi a disposizione
          da Lead Host.
        </Definition>
        <Definition title="Acquisto condiviso">
          La modalità di acquisto con cui il Lead può essere acquistato da più
          Property Manager entro il limite indicato dalla piattaforma.
        </Definition>
        <Definition title="Acquisto esclusivo">
          La modalità che, quando disponibile, consente a un solo Property Manager
          di ottenere l&apos;accesso al Lead impedendo successivi acquisti da parte
          di altri Property Manager.
        </Definition>
        <Definition title="Riaccredito">
          L&apos;operazione con cui Lead Host, a seguito dell&apos;accoglimento di
          una contestazione, restituisce nel Wallet del Property Manager
          l&apos;intero importo effettivamente corrisposto per il Lead contestato.
        </Definition>
      </>
    ),
  },
  {
    number: "3",
    title: "OGGETTO DEL SERVIZIO",
    slug: "oggetto-del-servizio",
    content: (
      <>
        <p>
          Lead Host mette a disposizione dei Property Manager un marketplace
          attraverso il quale è possibile:
        </p>
        <LegalList
          items={[
            "consultare opportunità relative a immobili;",
            "visualizzare informazioni preliminari sulla richiesta;",
            "conoscere il prezzo richiesto per accedere al Lead;",
            "acquistare Lead utilizzando il saldo disponibile nel Wallet;",
            "accedere, dopo l'acquisto, ai dati di contatto associati al Lead;",
            "consultare lo storico dei Lead acquistati;",
            "utilizzare le ulteriori funzionalità rese disponibili dalla piattaforma.",
          ]}
        />
        <p>
          Lead Host svolge una funzione di intermediazione informativa e
          tecnologica.
        </p>
        <p>
          Lead Host non svolge attività di mediazione immobiliare per conto del
          Property Manager e non è parte dell&apos;eventuale contratto che dovesse
          essere successivamente concluso tra Property Manager e proprietario.
        </p>
      </>
    ),
  },
  {
    number: "4",
    title: "DESTINATARI DEL SERVIZIO",
    slug: "destinatari-del-servizio",
    content: (
      <>
        <p>
          Lead Host è principalmente rivolto a Property Manager, imprese,
          professionisti e soggetti che operano o intendono operare nel settore
          della gestione immobiliare.
        </p>
        <p>
          Qualora un Utente utilizzi il Servizio in qualità di consumatore ai sensi
          della normativa applicabile, restano ferme tutte le disposizioni
          inderogabili poste dalla legge a tutela del consumatore.
        </p>
        <p>
          In caso di contrasto tra le presenti Condizioni e disposizioni
          inderogabili applicabili all&apos;Utente, prevalgono queste ultime.
        </p>
      </>
    ),
  },
  {
    number: "5",
    title: "REGISTRAZIONE E ACCOUNT",
    slug: "registrazione-e-account",
    content: (
      <>
        <p>
          Per accedere al marketplace e alle funzionalità riservate è necessario
          creare un account.
        </p>
        <p>L&apos;Utente è tenuto a fornire informazioni:</p>
        <LegalList
          items={["veritiere;", "aggiornate;", "complete;", "riferite al soggetto che utilizza effettivamente il Servizio."]}
        />
        <p>L&apos;Utente è responsabile della custodia delle proprie credenziali.</p>
        <p>È vietato:</p>
        <LegalList
          items={[
            "condividere abusivamente l'account con soggetti terzi;",
            "utilizzare account appartenenti ad altri soggetti;",
            "tentare di accedere alle funzionalità amministrative;",
            "aggirare i sistemi di sicurezza;",
            "modificare direttamente dati o autorizzazioni che non possono essere modificati attraverso le normali funzioni dell'account.",
          ]}
        />
        <p>
          Lead Host può sospendere un account in presenza di utilizzi abusivi,
          fraudolenti o contrari alle presenti Condizioni.
        </p>
      </>
    ),
  },
  {
    number: "6",
    title: "RECUPERO DELLE CREDENZIALI",
    slug: "recupero-delle-credenziali",
    content: (
      <>
        <p>
          L&apos;Utente può utilizzare le procedure di recupero password messe a
          disposizione da Lead Host.
        </p>
        <p>
          L&apos;Utente è responsabile dell&apos;accesso alla casella email associata
          all&apos;account e deve comunicare tempestivamente eventuali utilizzi non
          autorizzati delle proprie credenziali.
        </p>
      </>
    ),
  },
  {
    number: "7",
    title: "ACCESSO AL MARKETPLACE",
    slug: "accesso-al-marketplace",
    content: (
      <>
        <p>
          La registrazione a Lead Host consente di accedere al marketplace secondo
          le funzionalità disponibili in quel momento.
        </p>
        <p>La registrazione non obbliga l&apos;Utente ad acquistare Lead.</p>
        <p>Lead Host può:</p>
        <LegalList
          items={[
            "pubblicare nuovi Lead;",
            "rimuovere Lead non più disponibili;",
            "modificare la struttura del marketplace;",
            "introdurre nuovi criteri di visualizzazione;",
            "modificare o migliorare le funzionalità della piattaforma.",
          ]}
        />
        <p>
          La presenza di Lead disponibili non è garantita in maniera continuativa.
        </p>
        <p>
          Il numero, la tipologia e la distribuzione geografica dei Lead dipendono
          dalle richieste effettivamente acquisite da Lead Host.
        </p>
      </>
    ),
  },
  {
    number: "8",
    title: "INFORMAZIONI MOSTRATE PRIMA DELL'ACQUISTO",
    slug: "informazioni-prima-dell-acquisto",
    content: (
      <>
        <p>
          Prima dell&apos;acquisto, il Property Manager può visualizzare le
          informazioni rese disponibili nella scheda del Lead.
        </p>
        <p>Possono comprendere, a titolo esemplificativo:</p>
        <LegalList
          items={[
            "località;",
            "indirizzo dell'immobile;",
            "tipologia dell'immobile;",
            "caratteristiche dell'immobile;",
            "servizi richiesti;",
            "situazione attuale;",
            "tempistiche indicate;",
            "descrizione della richiesta;",
            "data in cui la richiesta è stata ricevuta;",
            "disponibilità del Lead;",
            "prezzo;",
            "modalità di acquisto disponibili.",
          ]}
        />
        <p>
          I dati di contatto personali riservati del proprietario vengono invece
          resi accessibili dopo il completamento dell&apos;acquisto.
        </p>
      </>
    ),
  },
  {
    number: "9",
    title: "ORIGINE E QUALITÀ DELLE INFORMAZIONI",
    slug: "origine-e-qualita-delle-informazioni",
    content: (
      <>
        <p>Le informazioni contenute nei Lead derivano principalmente:</p>
        <LegalList
          items={[
            "dalle dichiarazioni fornite dal proprietario;",
            "da moduli di richiesta;",
            "da campagne pubblicitarie;",
            "da sistemi di acquisizione collegati a Lead Host;",
            "da eventuali verifiche o integrazioni effettuate dal Gestore.",
          ]}
        />
        <p>
          Lead Host si impegna a non presentare come dichiarate dal proprietario
          informazioni commercialmente rilevanti che non risultino effettivamente
          acquisite o verificate.
        </p>
        <p>
          Ciò non significa che Lead Host garantisca la correttezza assoluta di ogni
          dichiarazione fornita dal proprietario.
        </p>
        <p>Il proprietario potrebbe infatti:</p>
        <LegalList
          items={[
            "commettere errori;",
            "fornire informazioni incomplete;",
            "correggere successivamente alcune informazioni;",
            "modificare la propria situazione.",
          ]}
        />
        <p>
          Imprecisioni secondarie che non incidano sulla sostanziale autenticità
          della richiesta non rendono automaticamente il Lead non valido.
        </p>
      </>
    ),
  },
  {
    number: "10",
    title: "PREZZO DEI LEAD",
    slug: "prezzo-dei-lead",
    content: (
      <>
        <p>Il prezzo dei Lead non è necessariamente uniforme.</p>
        <p>
          Lead Host può determinare prezzi differenti in funzione, ad esempio, di:
        </p>
        <LegalList
          items={[
            "caratteristiche del Lead;",
            "località;",
            "modalità di acquisto;",
            "disponibilità;",
            "valore attribuito all'opportunità;",
            "altri criteri commerciali.",
          ]}
        />
        <p>
          Il prezzo applicabile è quello mostrato e confermato dal Property Manager
          al momento dell&apos;acquisto.
        </p>
        <p>
          Prima del completamento dell&apos;operazione viene mostrato un riepilogo
          contenente almeno:
        </p>
        <LegalList items={["Lead;", "modalità di acquisto;", "importo da addebitare."]} />
        <p>
          Se il prezzo cambia prima della conferma definitiva, Lead Host deve
          mostrare il nuovo prezzo e richiedere una nuova conferma.
        </p>
        <p>
          Non può essere addebitato un prezzo diverso da quello espressamente
          confermato dal Property Manager.
        </p>
      </>
    ),
  },
  {
    number: "11",
    title: "MODALITÀ DI ACQUISTO",
    slug: "modalita-di-acquisto",
    content: (
      <>
        <p>Un Lead può essere reso disponibile secondo una o più modalità.</p>
        <Subsection title="11.1 Acquisto condiviso">
          <p>
            Quando previsto, lo stesso Lead può essere acquistato da un massimo di{" "}
            <strong>due Property Manager</strong>.
          </p>
          <p>
            Dopo il primo acquisto condiviso, il Lead può restare disponibile per il
            secondo Property Manager.
          </p>
          <p>
            Una volta raggiunto il numero massimo previsto, il Lead non è più
            acquistabile.
          </p>
        </Subsection>
        <Subsection title="11.2 Acquisto esclusivo">
          <p>
            Quando disponibile, il Property Manager può acquistare il Lead in
            modalità esclusiva.
          </p>
          <p>L&apos;acquisto esclusivo:</p>
          <LegalList
            items={[
              "impedisce successivi acquisti da parte di altri Property Manager;",
              "è disponibile esclusivamente finché nessun altro PM ha già acquistato il Lead;",
              "riguarda esclusivamente il numero di PM autorizzati ad accedere al Lead.",
            ]}
          />
          <p>L&apos;esclusività NON garantisce:</p>
          <LegalList
            items={[
              "risposta del proprietario;",
              "appuntamento;",
              "sopralluogo;",
              "trattativa;",
              "affidamento dell'immobile;",
              "conclusione di un contratto.",
            ]}
          />
        </Subsection>
      </>
    ),
  },
  {
    number: "12",
    title: "DISPONIBILITÀ DEI LEAD",
    slug: "disponibilita-dei-lead",
    content: (
      <>
        <p>Ogni Lead può essere acquistabile per un periodo limitato.</p>
        <p>
          La durata ordinaria della disponibilità è pari a{" "}
          <strong>7 giorni dalla pubblicazione</strong>, salvo differente gestione
          indicata dalla piattaforma.
        </p>
        <p>Un Lead può diventare non disponibile prima della scadenza quando:</p>
        <LegalList
          items={[
            "raggiunge il numero massimo di acquirenti;",
            "viene acquistato in esclusiva;",
            "viene ritirato da Lead Host;",
            "sopravvengono ragioni che ne impediscono la vendita.",
          ]}
        />
        <p>
          Una volta non più acquistabile può continuare a essere visualizzato
          temporaneamente con stato:
        </p>
        <Callout>“Non più disponibile”</Callout>
        <p>
          senza che Lead Host sia tenuta a comunicare agli altri utenti la causa
          specifica dell&apos;indisponibilità.
        </p>
      </>
    ),
  },
  {
    number: "13",
    title: "WALLET LEAD HOST",
    slug: "wallet-lead-host",
    content: (
      <>
        <p>Gli acquisti vengono effettuati utilizzando il saldo disponibile nel Wallet.</p>
        <p>
          Il Wallet rappresenta un saldo interno utilizzabile per usufruire dei
          servizi Lead Host.
        </p>
        <p>Il credito:</p>
        <LegalList
          items={[
            "viene espresso in euro;",
            "è utilizzabile per acquistare Lead;",
            "non è trasferibile tra utenti;",
            "non può essere ceduto a terzi;",
            "non può essere prelevato tramite le normali funzionalità della piattaforma.",
          ]}
        />
        <p>
          Il Wallet non prevede attualmente una scadenza automatica del saldo
          durante la normale operatività dell&apos;account.
        </p>
        <p>
          Il trattamento dell&apos;eventuale saldo residuo in occasione della
          chiusura definitiva dell&apos;account viene gestito secondo la normativa
          applicabile e le modalità comunicate da Lead Host.
        </p>
      </>
    ),
  },
  {
    number: "14",
    title: "RICARICA DEL WALLET",
    slug: "ricarica-del-wallet",
    content: (
      <>
        <p>
          Il Wallet può essere ricaricato attraverso i sistemi di pagamento messi a
          disposizione dalla piattaforma.
        </p>
        <p>
          La ricarica viene accreditata solo dopo che Lead Host riceve conferma
          dell&apos;avvenuto pagamento attraverso i sistemi previsti.
        </p>
        <p>In caso di:</p>
        <LegalList
          items={[
            "pagamento fallito;",
            "pagamento non completato;",
            "pagamento annullato;",
            "mancata conferma del provider;",
          ]}
        />
        <p>
          il saldo non viene accreditato fino alla corretta conferma della
          transazione.
        </p>
        <p>Lead Host può stabilire:</p>
        <LegalList
          items={[
            "importo minimo di ricarica;",
            "importo massimo;",
            "importi suggeriti;",
            "ulteriori limiti operativi.",
          ]}
        />
        <p>
          Tali valori possono essere modificati nel tempo e vengono mostrati
          direttamente nella piattaforma.
        </p>
      </>
    ),
  },
  {
    number: "15",
    title: "DATI DI FATTURAZIONE",
    slug: "dati-di-fatturazione",
    content: (
      <>
        <p>
          Prima di effettuare una ricarica, il Property Manager deve aver completato
          i dati di fatturazione obbligatori richiesti nel proprio profilo.
        </p>
        <p>
          Se i dati risultano mancanti o incompleti, Lead Host può impedire
          l&apos;accesso al pagamento fino al completamento delle informazioni.
        </p>
        <p>
          L&apos;Utente è responsabile della correttezza dei dati fiscali e di
          fatturazione forniti.
        </p>
        <p>
          La documentazione fiscale viene emessa secondo il regime fiscale
          applicabile al Gestore e può essere gestita attraverso procedure esterne
          alla piattaforma.
        </p>
        <p>
          La presenza di dati di fatturazione nella piattaforma non implica
          l&apos;emissione automatica di documenti fiscali tramite Stripe o altro
          provider di pagamento.
        </p>
      </>
    ),
  },
  {
    number: "16",
    title: "ACCETTAZIONE DELLE CONDIZIONI PRIMA DELLA RICARICA",
    slug: "accettazione-prima-della-ricarica",
    content: (
      <>
        <p>
          Prima di ogni ricarica del Wallet, l&apos;Utente deve accettare
          espressamente le Condizioni del Servizio vigenti.
        </p>
        <p>La piattaforma può registrare:</p>
        <LegalList
          items={[
            "account dell'Utente;",
            "data e ora dell'accettazione;",
            "versione delle Condizioni accettate;",
            "contesto nel quale è avvenuta l'accettazione.",
          ]}
        />
        <p>
          In assenza dell&apos;accettazione richiesta, la ricarica non può essere
          completata.
        </p>
      </>
    ),
  },
  {
    number: "17",
    title: "PROCEDURA DI ACQUISTO DEL LEAD",
    slug: "procedura-di-acquisto-del-lead",
    content: (
      <>
        <p>
          Prima dell&apos;acquisto definitivo viene mostrato un riepilogo
          dell&apos;operazione.
        </p>
        <p>Il Property Manager deve poter verificare almeno:</p>
        <LegalList
          items={[
            "Lead selezionato;",
            "modalità di acquisto;",
            "prezzo;",
            "importo che verrà scalato dal Wallet.",
          ]}
        />
        <p>L&apos;acquisto richiede una conferma esplicita.</p>
        <p>Prima della conferma viene inoltre ricordato che:</p>
        <Callout>
          l&apos;acquisto consente l&apos;accesso ai dati di contatto associati alla
          richiesta, ma Lead Host non garantisce la risposta del proprietario, un
          appuntamento o la conclusione di un contratto.
        </Callout>
        <p>
          Il Property Manager deve accettare le Condizioni vigenti prima di
          confermare l&apos;acquisto.
        </p>
      </>
    ),
  },
  {
    number: "18",
    title: "SALDO INSUFFICIENTE",
    slug: "saldo-insufficiente",
    content: (
      <>
        <p>Se il saldo Wallet non è sufficiente per l&apos;acquisto:</p>
        <LegalList
          items={[
            "l'operazione non viene completata;",
            "nessun Lead viene sbloccato;",
            "l'Utente può essere invitato a ricaricare il Wallet.",
          ]}
        />
        <p>
          Il Lead non viene riservato automaticamente durante il tempo necessario
          alla ricarica, salvo diversa funzione espressamente prevista dalla
          piattaforma.
        </p>
        <p>Pertanto, un altro Property Manager potrebbe acquistarlo nel frattempo.</p>
      </>
    ),
  },
  {
    number: "19",
    title: "CONCLUSIONE DELL'ACQUISTO",
    slug: "conclusione-dell-acquisto",
    content: (
      <>
        <p>L&apos;acquisto si considera completato quando:</p>
        <LegalList
          items={[
            "il sistema verifica la disponibilità del Lead;",
            "verifica il saldo;",
            "registra l'acquisto;",
            "scala il relativo importo dal Wallet;",
            "abilita l'accesso ai dati riservati.",
          ]}
        />
        <p>
          Se il Lead non è più disponibile nel momento della conferma,
          l&apos;operazione viene rifiutata e l&apos;importo non viene addebitato.
        </p>
      </>
    ),
  },
  {
    number: "20",
    title: "DATI SBLOCCATI DOPO L'ACQUISTO",
    slug: "dati-sbloccati-dopo-l-acquisto",
    content: (
      <>
        <p>
          Dopo l&apos;acquisto, il Property Manager può accedere ai dati di contatto
          messi a disposizione per il Lead.
        </p>
        <p>Possono comprendere:</p>
        <LegalList
          items={[
            "nome;",
            "cognome;",
            "telefono;",
            "email;",
            "ulteriori informazioni eventualmente previste dalla piattaforma.",
          ]}
        />
        <p>
          Il Property Manager è responsabile del corretto utilizzo dei dati
          ottenuti.
        </p>
      </>
    ),
  },
  {
    number: "21",
    title: "UTILIZZO DEI DATI DEI PROPRIETARI",
    slug: "utilizzo-dei-dati-dei-proprietari",
    content: (
      <>
        <p>
          I dati ottenuti attraverso l&apos;acquisto di un Lead possono essere
          utilizzati esclusivamente per finalità compatibili con la richiesta
          effettuata dal proprietario.
        </p>
        <p>È vietato:</p>
        <LegalList
          items={[
            "rivendere i dati;",
            "cedere il Lead a soggetti terzi non autorizzati;",
            "pubblicare i dati;",
            "utilizzare i dati per finalità estranee alla richiesta;",
            "inserire il proprietario in campagne marketing non consentite;",
            "utilizzare i dati in violazione della normativa applicabile.",
          ]}
        />
        <p>
          Il Property Manager diviene responsabile delle attività di trattamento
          effettuate autonomamente sui dati ricevuti secondo il ruolo che gli
          compete ai sensi della normativa applicabile.
        </p>
      </>
    ),
  },
  {
    number: "22",
    title: "COSA ACQUISTA IL PROPERTY MANAGER",
    slug: "cosa-acquista-il-property-manager",
    content: (
      <>
        <p>
          Con l&apos;acquisto di un Lead il Property Manager acquista l&apos;accesso
          ai dati relativi a una richiesta che, secondo le informazioni disponibili
          a Lead Host, deriva da un soggetto che ha manifestato interesse verso
          servizi di gestione immobiliare.
        </p>
        <p>L&apos;acquisto NON costituisce garanzia di:</p>
        <LegalList
          items={[
            "risposta;",
            "appuntamento;",
            "sopralluogo;",
            "trattativa;",
            "accettazione della proposta;",
            "affidamento dell'immobile;",
            "firma di un contratto;",
            "redditività dell'immobile;",
            "risultato economico.",
          ]}
        />
        <Callout>
          Lead Host garantisce l&apos;accesso all&apos;opportunità acquistata, non la
          conclusione della trattativa.
        </Callout>
      </>
    ),
  },
  {
    number: "23",
    title: "PRINCIPIO DI VALIDITÀ DEL LEAD",
    slug: "principio-di-validita-del-lead",
    content: (
      <>
        <p>
          Un Lead è considerato sostanzialmente valido quando, al momento della
          richiesta, esisteva un interesse reale del soggetto a ricevere
          informazioni, proposte o contatti relativi alla gestione del proprio
          immobile.
        </p>
        <p>
          La successiva evoluzione della volontà del proprietario non determina
          automaticamente l&apos;invalidità del Lead.
        </p>
        <p>Un Lead può quindi essere valido anche quando successivamente:</p>
        <LegalList
          items={[
            "il proprietario non risponde;",
            "cambia idea;",
            "rimanda la decisione;",
            "sceglie un altro PM;",
            "decide di gestire autonomamente;",
            "non accetta le condizioni economiche;",
            "non viene concluso alcun contratto.",
          ]}
        />
      </>
    ),
  },
  {
    number: "24",
    title: "SEGNALAZIONE DI PROBLEMI RELATIVI A UN LEAD",
    slug: "segnalazione-problemi-lead",
    content: (
      <>
        <p>
          Il Property Manager che ritenga un Lead oggettivamente non valido può
          contattare Lead Host attraverso la sezione <strong>Assistenza</strong>{" "}
          della piattaforma.
        </p>
        <p>La segnalazione deve:</p>
        <LegalList
          items={[
            "indicare il Lead interessato;",
            "descrivere il problema;",
            "fornire, quando richiesto, gli elementi necessari alla verifica.",
          ]}
        />
        <p>
          Per consentire una verifica tempestiva, eventuali contestazioni relative
          alla validità originaria del Lead devono essere comunicate preferibilmente
          e, ove previsto dalla presente disciplina, entro{" "}
          <strong>72 ore dall&apos;acquisto</strong>.
        </p>
        <p>
          Lead Host può comunque valutare situazioni eccezionali o errori tecnici
          direttamente imputabili alla piattaforma.
        </p>
        <p>L&apos;invio di una richiesta di assistenza:</p>
        <LegalList
          items={[
            "non determina automaticamente un riaccredito;",
            "non implica il riconoscimento dell'invalidità del Lead.",
          ]}
        />
        <p>Ogni caso viene valutato da Lead Host.</p>
      </>
    ),
  },
  {
    number: "25",
    title: "CASI CHE POSSONO DARE DIRITTO AL RIACCREDITO",
    slug: "casi-con-diritto-al-riaccredito",
    content: (
      <>
        <p>
          A seguito delle verifiche, Lead Host può riconoscere il Lead come non
          valido, in particolare quando venga accertato uno dei seguenti casi.
        </p>
        <Subsection title="25.1 Numero telefonico inesistente o non assegnato">
          <p>
            Il numero associato al Lead risulta tecnicamente inesistente, non
            assegnato o manifestamente errato.
          </p>
          <p>Non equivalgono a numero inesistente:</p>
          <LegalList
            items={[
              "mancata risposta;",
              "telefono spento;",
              "segreteria;",
              "temporanea irreperibilità;",
              "chiamata rifiutata;",
              "numero occupato.",
            ]}
          />
        </Subsection>
        <Subsection title="25.2 Contatto riferito a soggetto estraneo">
          <p>
            I dati forniti appartengono a una persona completamente estranea alla
            richiesta.
          </p>
        </Subsection>
        <Subsection title="25.3 Richiesta non effettuata dal soggetto">
          <p>
            Il soggetto contattato dichiara di non aver mai effettuato la richiesta
            e Lead Host, dopo verifica, ritiene fondata la contestazione.
          </p>
        </Subsection>
        <Subsection title="25.4 Lead duplicato">
          <p>
            Il medesimo Property Manager ha acquistato, per errore del sistema, la
            stessa richiesta sostanzialmente identica relativa allo stesso
            proprietario e immobile.
          </p>
          <p>
            Una nuova richiesta autonoma dello stesso proprietario effettuata in un
            momento successivo non costituisce necessariamente duplicato.
          </p>
        </Subsection>
        <Subsection title="25.5 Richiesta già conclusa prima della sua generazione">
          <p>
            Viene accertato che, prima ancora dell&apos;invio della richiesta che ha
            generato il Lead, l&apos;esigenza era già stata definitivamente risolta
            e non esisteva più un reale interesse.
          </p>
        </Subsection>
        <Subsection title="25.6 Errore tecnico Lead Host">
          <p>
            Un malfunzionamento direttamente imputabile alla piattaforma ha
            impedito l&apos;erogazione di quanto acquistato.
          </p>
        </Subsection>
      </>
    ),
  },
  {
    number: "26",
    title: "CASI CHE NON DANNO DIRITTO AL RIACCREDITO",
    slug: "casi-senza-diritto-al-riaccredito",
    content: (
      <>
        <p>Non costituiscono motivo di riaccredito:</p>
        <Definition title="Mancata risposta">
          Il proprietario non risponde a telefono, email o WhatsApp.
        </Definition>
        <Definition title="Cambio di idea">
          Il proprietario era interessato al momento della richiesta ma
          successivamente cambia idea.
        </Definition>
        <Definition title="Scelta di altro Property Manager">
          Il proprietario decide di affidarsi a un altro professionista.
        </Definition>
        <Definition title="Presenza di altro PM">
          Quando il Lead è stato acquistato con modalità condivisa.
        </Definition>
        <Definition title="Mancata conversione">
          Il PM non conclude il contratto.
        </Definition>
        <Definition title="Mancato accordo economico">
          Il proprietario non accetta commissioni, prezzi o condizioni.
        </Definition>
        <Definition title="Valutazione economica negativa">
          Il PM considera l&apos;immobile poco redditizio o inadatto.
        </Definition>
        <Definition title="Distanza">
          Il PM decide successivamente che l&apos;immobile è troppo distante.
        </Definition>
        <Definition title="Servizio non conveniente">
          Il PM decide di non voler offrire il servizio richiesto.
        </Definition>
        <Definition title="Informazioni secondarie inesatte">
          Sono presenti imprecisioni non sostanziali che non rendono falsa la
          richiesta.
        </Definition>
        <Definition title="Modifica successiva delle informazioni">
          Il proprietario corregge o integra alcune informazioni durante il
          contatto.
        </Definition>
        <Definition title="Errore o ripensamento del PM">
          Il PM acquista volontariamente e successivamente cambia idea.
        </Definition>
        <Definition title="Mancato appuntamento o sopralluogo">
          La trattativa non procede come desiderato.
        </Definition>
      </>
    ),
  },
  {
    number: "27",
    title: "VERIFICA DELLA SEGNALAZIONE",
    slug: "verifica-della-segnalazione",
    content: (
      <>
        <p>Lead Host può richiedere:</p>
        <LegalList
          items={[
            "screenshot;",
            "messaggi;",
            "email;",
            "informazioni sui tentativi di contatto;",
            "descrizione della conversazione;",
            "informazioni tecniche;",
            "ulteriore documentazione pertinente.",
          ]}
        />
        <p>Lead Host può inoltre:</p>
        <LegalList
          items={[
            "verificare l'origine del Lead;",
            "controllare i dati disponibili;",
            "verificare timestamp e informazioni tecniche;",
            "contattare direttamente il proprietario.",
          ]}
        />
        <p>
          La dichiarazione del Property Manager non comporta automaticamente il
          riconoscimento del riaccredito.
        </p>
      </>
    ),
  },
  {
    number: "28",
    title: "RIACCREDITO NEL WALLET",
    slug: "riaccredito-nel-wallet",
    content: (
      <>
        <p>
          Quando Lead Host accerta che il Lead è oggettivamente non valido e
          approva la contestazione, viene riconosciuto:
        </p>
        <Callout>
          il 100% dell&apos;importo effettivamente pagato per quello specifico Lead.
        </Callout>
        <p>Non sono previsti riaccrediti parziali.</p>
        <p>L&apos;importo viene:</p>
        <Callout>esclusivamente riaccreditato nel Wallet Lead Host.</Callout>
        <p>Il riaccredito non viene normalmente:</p>
        <LegalList
          items={[
            "restituito sulla carta utilizzata per ricaricare il Wallet;",
            "versato tramite bonifico;",
            "trasferito ad altro account;",
            "convertito in denaro attraverso la piattaforma.",
          ]}
        />
        <p>Il credito torna disponibile per acquistare altri Lead.</p>
        <p>Restano salvi eventuali diritti inderogabili previsti dalla legge.</p>
      </>
    ),
  },
  {
    number: "29",
    title: "LEAD CON PIÙ ACQUIRENTI",
    slug: "lead-con-piu-acquirenti",
    content: (
      <>
        <p>
          La validità di un Lead può essere verificata anche quando lo stesso Lead è
          stato acquistato da più Property Manager.
        </p>
        <p>
          Quando emerge un problema oggettivo riferibile al Lead nel suo complesso,
          Lead Host può effettuare verifiche anche sugli altri acquisti associati.
        </p>
        <p>
          Il riconoscimento di un riaccredito a un Property Manager non implica
          tuttavia automaticamente che ogni altro acquirente abbia diritto allo
          stesso trattamento quando la contestazione riguarda circostanze
          individuali.
        </p>
      </>
    ),
  },
  {
    number: "30",
    title: "PREVENZIONE DEGLI ABUSI",
    slug: "prevenzione-degli-abusi",
    content: (
      <>
        <p>
          Lead Host può monitorare l&apos;utilizzo del sistema di assistenza e le
          contestazioni relative ai Lead.
        </p>
        <p>Possono essere analizzati:</p>
        <LegalList
          items={[
            "numero di Lead acquistati;",
            "segnalazioni;",
            "contestazioni accolte;",
            "contestazioni respinte;",
            "frequenza delle contestazioni;",
            "eventuali comportamenti anomali.",
          ]}
        />
        <p>
          L&apos;utilizzo sistematico o abusivo delle richieste di riaccredito può
          determinare controlli aggiuntivi sull&apos;account.
        </p>
      </>
    ),
  },
  {
    number: "31",
    title: "SEGNALAZIONI FALSE O FRAUDOLENTE",
    slug: "segnalazioni-false-o-fraudolente",
    content: (
      <>
        <p>È vietato presentare intenzionalmente:</p>
        <LegalList
          items={[
            "dichiarazioni false;",
            "prove manipolate;",
            "informazioni non veritiere;",
            "contestazioni artificiose;",
            "richieste di riaccredito dopo aver utilizzato normalmente un Lead valido.",
          ]}
        />
        <p>In presenza di comportamenti abusivi Lead Host può:</p>
        <LegalList
          items={[
            "respingere la richiesta;",
            "richiedere ulteriori verifiche;",
            "limitare temporaneamente alcune funzionalità;",
            "sospendere l'account nei casi gravi o reiterati.",
          ]}
        />
      </>
    ),
  },
  {
    number: "32",
    title: "OBBLIGO DI DILIGENZA DEL PROPERTY MANAGER",
    slug: "obbligo-di-diligenza-del-property-manager",
    content: (
      <>
        <p>
          Il Property Manager è responsabile della gestione commerciale dei Lead
          acquistati.
        </p>
        <p>È consigliabile contattare il proprietario tempestivamente.</p>
        <p>
          Il ritardo del Property Manager nel primo contatto non può essere imputato
          a Lead Host.
        </p>
        <p>
          La perdita di interesse del proprietario intervenuta durante un ritardo
          imputabile al PM non determina l&apos;invalidità originaria del Lead.
        </p>
      </>
    ),
  },
  {
    number: "33",
    title: "NESSUNA GARANZIA DI RISULTATO COMMERCIALE",
    slug: "nessuna-garanzia-di-risultato-commerciale",
    content: (
      <>
        <p>Lead Host non garantisce percentuali minime di:</p>
        <LegalList
          items={[
            "risposta;",
            "appuntamento;",
            "sopralluogo;",
            "proposta;",
            "conversione;",
            "immobili acquisiti;",
            "fatturato;",
            "ritorno sull'investimento.",
          ]}
        />
        <p>
          Il risultato dipende da fattori estranei al controllo di Lead Host, tra
          cui:
        </p>
        <LegalList
          items={[
            "velocità del contatto;",
            "capacità commerciale;",
            "proposta;",
            "reputazione;",
            "servizi;",
            "condizioni economiche;",
            "caratteristiche dell'immobile;",
            "territorio;",
            "concorrenza;",
            "decisioni del proprietario.",
          ]}
        />
        <p>La mancata conversione non costituisce prova dell&apos;invalidità del Lead.</p>
      </>
    ),
  },
  {
    number: "34",
    title: "ASSISTENZA",
    slug: "assistenza",
    content: (
      <>
        <p>
          Lead Host mette a disposizione una sezione di assistenza attraverso la
          quale l&apos;Utente può:
        </p>
        <LegalList
          items={[
            "richiedere supporto sulla piattaforma;",
            "richiedere informazioni;",
            "segnalare problemi relativi a Lead acquistati;",
            "presentare altre richieste relative al proprio account.",
          ]}
        />
        <p>
          Lead Host può richiedere ulteriori informazioni necessarie per gestire il
          caso.
        </p>
      </>
    ),
  },
  {
    number: "35",
    title: "NOTIFICHE",
    slug: "notifiche",
    content: (
      <>
        <p>Lead Host può inviare notifiche:</p>
        <LegalList
          items={[
            "all'interno della piattaforma;",
            "via email;",
            "attraverso altri canali eventualmente introdotti.",
          ]}
        />
        <p>Le comunicazioni possono riguardare:</p>
        <LegalList
          items={[
            "nuovi Lead;",
            "acquisti;",
            "Wallet;",
            "assistenza;",
            "sicurezza;",
            "account;",
            "modifiche rilevanti del Servizio.",
          ]}
        />
        <p>
          Le preferenze relative alle comunicazioni promozionali o informative non
          impediscono l&apos;invio di comunicazioni tecniche o contrattuali
          necessarie alla gestione del Servizio.
        </p>
      </>
    ),
  },
  {
    number: "36",
    title: "SOSPENSIONE DELL'ACCOUNT",
    slug: "sospensione-dell-account",
    content: (
      <>
        <p>
          Lead Host può sospendere temporaneamente l&apos;account quando sussistano
          ragionevoli motivi, tra cui:
        </p>
        <LegalList
          items={[
            "violazione delle presenti Condizioni;",
            "utilizzo illecito dei dati;",
            "tentativi di aggirare i sistemi di sicurezza;",
            "utilizzo fraudolento del Wallet;",
            "contestazioni fraudolente;",
            "cessione abusiva dei Lead;",
            "attività potenzialmente dannose per proprietari, altri utenti o Lead Host.",
          ]}
        />
        <p>
          Durante la sospensione alcune o tutte le funzionalità possono risultare
          inaccessibili.
        </p>
        <p>
          La sospensione non comporta automaticamente la cancellazione dei dati,
          delle transazioni o dello storico dell&apos;account.
        </p>
      </>
    ),
  },
  {
    number: "37",
    title: "RICHIESTA DI CHIUSURA ACCOUNT",
    slug: "richiesta-di-chiusura-account",
    content: (
      <>
        <p>
          L&apos;Utente che desidera chiudere il proprio account può inviare una
          richiesta attraverso la sezione Assistenza.
        </p>
        <p>
          La richiesta di chiusura non comporta una cancellazione automatica e
          immediata.
        </p>
        <p>Lead Host potrà contattare l&apos;Utente per:</p>
        <LegalList
          items={[
            "verificare la richiesta;",
            "gestire eventuali operazioni ancora aperte;",
            "definire gli aspetti relativi al Wallet;",
            "adempiere agli obblighi legali, fiscali o amministrativi applicabili.",
          ]}
        />
      </>
    ),
  },
  {
    number: "38",
    title: "DISPONIBILITÀ DEL SERVIZIO",
    slug: "disponibilita-del-servizio",
    content: (
      <>
        <p>
          Lead Host mira a mantenere la piattaforma disponibile e funzionante ma
          non garantisce un funzionamento ininterrotto.
        </p>
        <p>Possono verificarsi interruzioni dovute a:</p>
        <LegalList
          items={[
            "manutenzione;",
            "aggiornamenti;",
            "problemi tecnici;",
            "provider esterni;",
            "infrastrutture cloud;",
            "sistemi di pagamento;",
            "servizi email;",
            "cause di forza maggiore.",
          ]}
        />
        <p>
          Lead Host adotterà misure ragionevoli per ripristinare il servizio in caso
          di malfunzionamenti.
        </p>
      </>
    ),
  },
  {
    number: "39",
    title: "SERVIZI DI TERZE PARTI",
    slug: "servizi-di-terze-parti",
    content: (
      <>
        <p>
          Lead Host può utilizzare fornitori esterni per erogare alcune
          funzionalità, ad esempio:
        </p>
        <LegalList
          items={[
            "hosting;",
            "database;",
            "autenticazione;",
            "pagamenti;",
            "email;",
            "acquisizione delle richieste;",
            "analytics.",
          ]}
        />
        <p>
          L&apos;utilizzo di tali servizi può essere soggetto anche alle rispettive
          condizioni e policy.
        </p>
        <p>
          Lead Host non è responsabile di malfunzionamenti direttamente imputabili
          a fornitori esterni al di fuori del proprio ragionevole controllo, fermo
          restando quanto inderogabilmente previsto dalla normativa applicabile.
        </p>
      </>
    ),
  },
  {
    number: "40",
    title: "PROPRIETÀ INTELLETTUALE",
    slug: "proprieta-intellettuale",
    content: (
      <>
        <p>
          Il software, il design, il marchio Lead Host, i contenuti proprietari, le
          interfacce e gli elementi originali della piattaforma appartengono ai
          rispettivi titolari e sono protetti dalla normativa applicabile.
        </p>
        <p>
          La registrazione non attribuisce all&apos;Utente alcun diritto di proprietà
          sul software o sulla piattaforma.
        </p>
        <p>È vietato:</p>
        <LegalList
          items={[
            "copiare sistematicamente il database;",
            "effettuare scraping non autorizzato;",
            "replicare il Servizio;",
            "aggirare le limitazioni tecniche;",
            "utilizzare contenuti o dati per creare database concorrenti;",
            "effettuare attività di reverse engineering nei limiti vietati dalla legge.",
          ]}
        />
      </>
    ),
  },
  {
    number: "41",
    title: "RESPONSABILITÀ DEL PROPERTY MANAGER",
    slug: "responsabilita-del-property-manager",
    content: (
      <>
        <p>Il Property Manager è esclusivamente responsabile:</p>
        <LegalList
          items={[
            "delle comunicazioni inviate al proprietario;",
            "delle proprie offerte;",
            "delle condizioni contrattuali proposte;",
            "dei servizi forniti;",
            "della propria attività professionale;",
            "degli adempimenti amministrativi, fiscali o autorizzativi eventualmente richiesti;",
            "del trattamento successivo dei dati del proprietario;",
            "del rapporto commerciale instaurato.",
          ]}
        />
        <p>
          Lead Host non diventa parte del rapporto contrattuale tra PM e
          proprietario.
        </p>
      </>
    ),
  },
  {
    number: "42",
    title: "LIMITI DI RESPONSABILITÀ DI LEAD HOST",
    slug: "limiti-di-responsabilita-di-lead-host",
    content: (
      <>
        <p>Nei limiti consentiti dalla normativa applicabile, Lead Host non risponde di:</p>
        <LegalList
          items={[
            "mancata conclusione di contratti;",
            "mancati guadagni derivanti da Lead non convertiti;",
            "decisioni del proprietario;",
            "informazioni inesatte fornite direttamente dal proprietario, salvo casi di responsabilità direttamente imputabile a Lead Host;",
            "condotte del PM;",
            "rapporti contrattuali instaurati successivamente;",
            "indisponibilità temporanee dovute a cause esterne ragionevolmente non controllabili.",
          ]}
        />
        <p>
          Nessuna disposizione delle presenti Condizioni limita responsabilità che
          non possono essere escluse o limitate per legge.
        </p>
      </>
    ),
  },
  {
    number: "43",
    title: "PRIVACY",
    slug: "privacy",
    content: (
      <>
        <p>
          Il trattamento dei dati personali effettuato direttamente da Lead Host è
          disciplinato dalla Privacy Policy disponibile sulla piattaforma.
        </p>
        <p>
          L&apos;Utente è invitato a consultarla separatamente dalle presenti
          Condizioni.
        </p>
        <p>
          L&apos;acquisto di un Lead comporta l&apos;accesso a dati personali che
          devono essere trattati dal PM esclusivamente per finalità compatibili con
          la richiesta ricevuta e nel rispetto della normativa applicabile.
        </p>
      </>
    ),
  },
  {
    number: "44",
    title: "MODIFICHE DEL SERVIZIO",
    slug: "modifiche-del-servizio",
    content: (
      <>
        <p>Lead Host può modificare o aggiornare nel tempo:</p>
        <LegalList
          items={[
            "funzionalità;",
            "interfaccia;",
            "modalità operative;",
            "sistemi di pagamento;",
            "Wallet;",
            "categorie;",
            "criteri di pubblicazione;",
            "modalità commerciali;",
            "prezzi dei nuovi Lead.",
          ]}
        />
        <p>
          Le modifiche non alterano retroattivamente il prezzo di un acquisto già
          completato.
        </p>
      </>
    ),
  },
  {
    number: "45",
    title: "MODIFICHE DELLE CONDIZIONI",
    slug: "modifiche-delle-condizioni",
    content: (
      <>
        <p>Lead Host può aggiornare le presenti Condizioni per:</p>
        <LegalList
          items={[
            "evoluzione del Servizio;",
            "esigenze operative;",
            "introduzione di nuove funzionalità;",
            "ragioni di sicurezza;",
            "modifiche normative;",
            "prevenzione di abusi.",
          ]}
        />
        <p>Ogni versione deve essere identificabile tramite:</p>
        <LegalList
          items={[
            "numero di versione;",
            "data di aggiornamento;",
            "data di entrata in vigore.",
          ]}
        />
        <p>
          Quando richiesto dalla natura delle modifiche, Lead Host potrà chiedere
          all&apos;Utente una nuova accettazione.
        </p>
        <p>
          Le nuove condizioni si applicano alle operazioni effettuate dopo la loro
          entrata in vigore, salvo differente previsione obbligatoria di legge.
        </p>
      </>
    ),
  },
  {
    number: "46",
    title: "PROVA DELL'ACCETTAZIONE",
    slug: "prova-dell-accettazione",
    content: (
      <>
        <p>
          Lead Host può conservare evidenza dell&apos;accettazione delle Condizioni,
          comprendente:
        </p>
        <LegalList
          items={[
            "Utente;",
            "versione;",
            "data e ora;",
            "operazione alla quale l'accettazione si riferisce.",
          ]}
        />
        <p>L&apos;accettazione può essere richiesta, in particolare:</p>
        <LegalList
          items={[
            "prima della ricarica Wallet;",
            "prima dell'acquisto di un Lead.",
          ]}
        />
        <p>
          L&apos;impossibilità o il rifiuto di accettare le Condizioni impedisce il
          completamento dell&apos;operazione interessata.
        </p>
      </>
    ),
  },
  {
    number: "47",
    title: "NULLITÀ O INEFFICACIA PARZIALE",
    slug: "nullita-o-inefficacia-parziale",
    content: (
      <p>
        Qualora una disposizione delle presenti Condizioni risulti nulla, invalida
        o inefficace, le restanti disposizioni rimangono valide nei limiti
        consentiti dalla legge.
      </p>
    ),
  },
  {
    number: "48",
    title: "LEGGE APPLICABILE",
    slug: "legge-applicabile",
    content: (
      <>
        <p>Le presenti Condizioni sono regolate dalla legge italiana.</p>
        <p>
          Restano impregiudicate le norme inderogabili eventualmente applicabili
          all&apos;Utente in ragione della propria qualifica.
        </p>
      </>
    ),
  },
  {
    number: "49",
    title: "FORO COMPETENTE",
    slug: "foro-competente",
    content: (
      <>
        <p>
          Per le controversie relative alle presenti Condizioni è competente il
          foro individuato secondo la normativa applicabile.
        </p>
        <p>
          Qualora l&apos;Utente agisca in qualità professionale e la normativa
          consenta una scelta convenzionale del foro, le parti individuano come
          foro esclusivo:
        </p>
        <Callout>ROMA</Callout>
        <p>
          Restano ferme le competenze inderogabili eventualmente previste per gli
          utenti qualificabili come consumatori.
        </p>
      </>
    ),
  },
  {
    number: "50",
    title: "CONTATTI",
    slug: "contatti",
    content: (
      <>
        <p>Per comunicazioni relative al Servizio:</p>
        <p className="whitespace-pre-line font-semibold text-ink">
          {`Email: info@leadhost.it`}
        </p>
        <p>
          Per richieste relative all&apos;account è possibile utilizzare anche la
          sezione <strong>Assistenza</strong>{" "}
          disponibile all&apos;interno della piattaforma.
        </p>
      </>
    ),
  },
  {
    number: "51",
    title: "ACCETTAZIONE",
    slug: "accettazione",
    content: (
      <>
        <p>
          Prima di completare una ricarica Wallet o l&apos;acquisto di un Lead,
          l&apos;Utente è tenuto a prendere visione e accettare la versione vigente
          delle presenti Condizioni.
        </p>
        <p>
          L&apos;Utente dichiara di aver avuto la possibilità di consultare le
          Condizioni prima di completare l&apos;operazione.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <main id="inizio-condizioni" className="min-h-screen bg-paper">
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
      </div>

      <header className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
          <p className="section-kicker">Lead Host</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Condizioni Generali del Servizio
          </h1>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <DocumentMeta
              icon={<FileText size={18} />}
              label="Versione"
              value={termsDocument.version}
            />
            <DocumentMeta
              icon={<CalendarDays size={18} />}
              label="Ultimo aggiornamento"
              value={termsDocument.lastUpdated}
            />
            <DocumentMeta
              icon={<CalendarDays size={18} />}
              label="In vigore dal"
              value={termsDocument.effectiveFrom}
            />
          </div>
          <div className="mt-8 max-w-3xl space-y-4 text-base leading-8 text-slate-700 sm:text-lg">
            <p>
              Le presenti Condizioni Generali del Servizio disciplinano
              l&apos;accesso e l&apos;utilizzo della piattaforma{" "}
              <strong>Lead Host</strong>, nonché l&apos;acquisto dei Lead e
              l&apos;utilizzo del Wallet Lead Host.
            </p>
            <p>
              L&apos;utilizzo delle funzionalità a pagamento della piattaforma
              comporta l&apos;accettazione delle presenti Condizioni secondo le
              modalità previste all&apos;interno del Servizio.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <nav
          id="indice"
          aria-label="Indice delle Condizioni Generali del Servizio"
          className="card overflow-hidden"
        >
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-mint text-green">
              <BookOpen size={20} />
            </span>
            <div>
              <p className="section-kicker">Navigazione</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Indice</h2>
            </div>
          </div>
          <ol className="grid max-h-[32rem] gap-x-8 gap-y-1 overflow-y-auto p-4 sm:p-5 md:grid-cols-2">
            {sections.map((section) => (
              <li key={section.number}>
                <a
                  className="flex min-h-11 items-start gap-3 rounded-lg px-3 py-2 text-sm font-semibold leading-6 text-slate-700 transition hover:bg-mint hover:text-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
                  href={`#${section.slug}`}
                >
                  <span className="min-w-7 text-green">{section.number}.</span>
                  <span>{toTitleCase(section.title)}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="mt-12 sm:mt-16">
          {sections.map((section) => (
            <section
              key={section.number}
              id={section.slug}
              className="scroll-mt-6 border-t border-slate-200 py-10 first:border-t-0 first:pt-0 sm:py-14"
            >
              <p className="section-kicker">Sezione {section.number}</p>
              <h2 className="mt-3 text-2xl font-semibold leading-tight text-ink sm:text-3xl">
                {toTitleCase(section.title)}
              </h2>
              <div className="mt-6 space-y-5 text-base leading-8 text-slate-700">
                {section.content}
              </div>
              <a
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-green hover:underline"
                href="#indice"
              >
                <ArrowUp size={15} />
                Torna all&apos;indice
              </a>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

function DocumentMeta({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-paper p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase text-muted">
        <span className="text-green">{icon}</span>
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="grid list-disc gap-2 pl-6 marker:text-green">
      {items.map((item) => (
        <li key={item} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Definition({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l-2 border-green/30 pl-4">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="pt-3">
      <h3 className="text-xl font-semibold leading-snug text-ink">{title}</h3>
      <div className="mt-4 space-y-5">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-green/20 bg-mint px-4 py-3 font-semibold leading-7 text-ink sm:px-5">
      {children}
    </p>
  );
}

function toTitleCase(value: string) {
  return value
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s/])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it-IT"));
}
