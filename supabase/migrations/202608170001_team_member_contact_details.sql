alter table team_members
  add column if not exists whatsapp_number text,
  add column if not exists telegram_contact text,
  add column if not exists contact_email text,
  add column if not exists paypal_email text;

comment on column team_members.whatsapp_number is
  'Numero WhatsApp di contatto del membro Team, distinto dal numero del profilo di accesso.';
comment on column team_members.telegram_contact is
  'Username, link o recapito Telegram del membro Team.';
comment on column team_members.contact_email is
  'Email operativa di contatto del membro Team, distinta dall email di accesso.';
comment on column team_members.paypal_email is
  'Email PayPal comunicata dal membro Team per eventuali pagamenti.';
