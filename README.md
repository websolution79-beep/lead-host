# Lead Host

Marketplace verticale per mettere in contatto proprietari di immobili e Property Manager.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase/PostgreSQL
- Stripe
- Resend
- Vercel

## Avvio Locale

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

Se il progetto e in una cartella sincronizzata con Google Drive e `npm install` produce errori su `node_modules`, usa una copia locale temporanea fuori da Google Drive per installare le dipendenze e fare build/test.

## Configurazione

Copia `.env.example` in `.env.local` e compila i valori quando colleghi Supabase, Stripe, Meta e Resend.

## Documentazione

- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `IMPLEMENTATION_PLAN.md`
- `ROUTES.md`

## Fase Attuale

Fase 1: fondamenta, schema database, route skeleton, design system e configurazione.
