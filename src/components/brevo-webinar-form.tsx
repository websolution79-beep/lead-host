"use client";

import Script from "next/script";
import { Check, LoaderCircle } from "lucide-react";

const BREVO_FORM_ACTION =
  "https://c73716ac.sibforms.com/serve/MUIFAAacvbkELP8jDhNtfsTfDZID6Hfuj-z4Kil_QrZZjcNqqS28zywv1zINJBuGsElKeXYcOQcdHtuZ_X4EWG2qDDDRzPj_oz7O8aUOO-LtB5joawM7430D5AbLBvJwo2-f1w7cVKfgdXBSSmnSP-TbLioKpHj5vCHaOZJ6dZ2BDqQFBNNrXGSNvj-FSB3oEPiw_3bWmaLjhPZYHg==";

export function BrevoWebinarForm() {
  return (
    <>
      <div className="webinar-brevo-form" id="sib-form-container">
        <div
          className="sib-form-message-panel rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
          id="error-message"
          role="alert"
        >
          <div className="sib-form-message-panel__text sib-form-message-panel__text--center">
            <span className="sib-form-message-panel__inner-text">
              Non siamo riusciti a completare l&apos;iscrizione. Controlla i dati e riprova.
            </span>
          </div>
        </div>

        <div
          className="sib-form-message-panel rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"
          id="success-message"
          role="status"
        >
          <div className="sib-form-message-panel__text sib-form-message-panel__text--center flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
              <Check size={17} strokeWidth={3} />
            </span>
            <span className="sib-form-message-panel__inner-text text-left text-sm font-semibold leading-6">
              Iscrizione completata. Controlla la tua email: riceverai tutte le indicazioni e il link per partecipare su Zoom.
            </span>
          </div>
        </div>

        <div className="sib-container--large sib-container--vertical" id="sib-container">
          <form
            action={BREVO_FORM_ACTION}
            className="grid gap-5"
            data-type="subscription"
            id="sib-form"
            method="POST"
          >
            <BrevoField
              autoComplete="name"
              id="NOME_E_COGNOME"
              label="Nome e cognome"
              name="NOME_E_COGNOME"
              placeholder="Mario Rossi"
              type="text"
            />

            <BrevoField
              autoComplete="email"
              id="EMAIL"
              label="Email"
              name="EMAIL"
              placeholder="nome@email.it"
              type="email"
            />

            <div className="sib-input sib-form-block">
              <div className="form__entry entry_block">
                <div className="form__label-row">
                  <label className="entry__label mb-2 block text-sm font-bold text-slate-900" data-required="*" htmlFor="WHATSAPP">
                    Numero WhatsApp <span className="text-red-600">*</span>
                  </label>
                  <div className="entry__field flex overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
                    <span className="grid h-12 shrink-0 place-items-center border-r border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800">
                      +39
                    </span>
                    <div className="min-w-0 flex-1">
                      <input
                        autoComplete="tel-national"
                        className="input h-12 w-full border-0 bg-white px-4 text-base text-slate-950 outline-none placeholder:text-slate-400"
                        data-required="true"
                        id="WHATSAPP"
                        inputMode="tel"
                        name="WHATSAPP"
                        pattern="[0-9 .-]{6,20}"
                        placeholder="333 123 4567"
                        required
                        type="tel"
                      />
                    </div>
                    <input name="WHATSAPP__COUNTRY_CODE" type="hidden" value="+39" />
                  </div>
                </div>
                <label className="entry__error entry__error--primary mt-2 block text-sm text-red-700" />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <input
                className="mt-1 size-4 shrink-0 accent-emerald-700"
                required
                type="checkbox"
              />
              <span>
                Ho letto la {" "}
                <a
                  className="font-semibold text-emerald-800 underline underline-offset-2"
                  href="https://www.iubenda.com/privacy-policy/12644511"
                  rel="noreferrer"
                  target="_blank"
                >
                  Privacy Policy
                </a>{" "}
                e autorizzo il trattamento dei dati per l&apos;iscrizione al webinar.
              </span>
            </label>

            <div className="sib-form-block">
              <button
                className="sib-form-block__button sib-form-block__button-with-loader inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-base font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
                form="sib-form"
                type="submit"
              >
                <LoaderCircle className="progress-indicator__icon sib-hide-loader-icon animate-spin" size={18} />
                Iscriviti gratuitamente
              </button>
            </div>

            <input className="input--hidden hidden" name="email_address_check" tabIndex={-1} type="text" />
            <input name="locale" type="hidden" value="it" />
          </form>
        </div>
      </div>

      <Script id="brevo-webinar-configuration" strategy="afterInteractive">
        {`
          window.REQUIRED_CODE_ERROR_MESSAGE = 'Scegli un prefisso paese';
          window.LOCALE = 'it';
          window.EMAIL_INVALID_MESSAGE = window.SMS_INVALID_MESSAGE = 'Controlla che il dato inserito sia nel formato corretto.';
          window.REQUIRED_ERROR_MESSAGE = 'Questo campo è obbligatorio.';
          window.GENERIC_INVALID_MESSAGE = 'Controlla che il dato inserito sia nel formato corretto.';
          window.INVALID_NUMBER = 'Inserisci un numero valido.';
          window.INVALID_DATE = 'Inserisci una data valida.';
          window.REQUIRED_MULTISELECT_MESSAGE = 'Seleziona almeno un’opzione.';
          window.translation = { common: { selectedList: '{quantity} lista selezionata', selectedLists: '{quantity} liste selezionate', selectedOption: '{quantity} selezionato', selectedOptions: '{quantity} selezionati' } };
          window.AUTOHIDE = false;
        `}
      </Script>
      <Script
        id="brevo-webinar-script"
        src="https://sibforms.com/forms/end-form/build/main.js"
        strategy="afterInteractive"
      />

      <style jsx global>{`
        .webinar-brevo-form .sib-form-message-panel {
          display: none;
          margin-bottom: 1.25rem;
        }
        .webinar-brevo-form .sib-form-message-panel--active {
          display: block;
        }
        .webinar-brevo-form .entry__error:empty {
          display: none;
        }
        .webinar-brevo-form .sib-hide-loader-icon {
          display: none;
        }
        .webinar-brevo-form .sib-form-block__button-disabled .sib-hide-loader-icon {
          display: inline-block;
        }
      `}</style>
    </>
  );
}

function BrevoField({
  autoComplete,
  id,
  label,
  name,
  placeholder,
  type,
}: {
  autoComplete: string;
  id: string;
  label: string;
  name: string;
  placeholder: string;
  type: "email" | "text";
}) {
  return (
    <div className="sib-input sib-form-block">
      <div className="form__entry entry_block">
        <div className="form__label-row">
          <label className="entry__label mb-2 block text-sm font-bold text-slate-900" data-required="*" htmlFor={id}>
            {label} <span className="text-red-600">*</span>
          </label>
          <div className="entry__field">
            <input
              autoComplete={autoComplete}
              className="input h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              data-required="true"
              id={id}
              maxLength={200}
              name={name}
              placeholder={placeholder}
              required
              type={type}
            />
          </div>
        </div>
        <label className="entry__error entry__error--primary mt-2 block text-sm text-red-700" />
      </div>
    </div>
  );
}
