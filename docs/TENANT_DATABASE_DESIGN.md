# Tenant Database Design

## Status och scope

Detta dokument är Steg C:s kodfria Security Pass för Tenant Management. Resultatet är
**godkänt med operativa blockerare**. Designen är tillräckligt exakt för att skriva
den första lokala migrationen och dess pgTAP-tester, men inget verksamhetsschema,
ingen RLS, ingen audit och ingen tenantkod är implementerad genom dokumentet.

Steg D1 har därefter implementerat och lokalverifierat
`public.control_center_owner`: tabellstruktur, constraints, FK, FORCE RLS och
frånvaron av normala tabellgrants är verifierade med pgTAP. Tabellen lämnas tom;
bootstrap, environment-equality, appintegration, tenanttabell, tenantaudit och
mutationsfunktioner är fortfarande inte implementerade.

Steg D2 har implementerat och lokalverifierat
`public.get_owner_integrity_status()`. Funktionen returnerar endast `ok`,
`unauthenticated`, `missing_database_owner`, `invalid_database_owner_state`
eller `authenticated_user_mismatch`. Den är `STABLE`, `PARALLEL UNSAFE` och
`SECURITY DEFINER`, ägs av `postgres` och har fast `search_path = pg_catalog`.
Endast `authenticated` har EXECUTE; `PUBLIC`, `anon` och `service_role` saknar
EXECUTE. Funktionen tar inga argument, returnerar text, läcker aldrig owner-UUID
och sväljer inte tekniska databasfel.

Steg D3 har implementerat serverintegrationen i `lib/server/auth/`:
`owner-integrity.contract.ts`, `get-owner-integrity.ts`,
`owner-integrity.errors.ts` och `require-owner-integrity.ts`. Den högre guarden
validerar environment, återanvänder `requireFullAccessOwner()` för verifierad
owner och AAL2, anropar RPC:n med användarens SSR-session och kräver allowlistad
`ok`. Missing, invalid, mismatch, null, okänd form och RPC-fel failar stängt.
Ingen route använder guarden ännu; bootstrap och tenanttabell saknas fortfarande.

Scope omfattar owner-singleton, ownerintegritet, tenantdata, constraints, index,
RLS, mutationer, audit, tester, migrationsordning, framtida DAL, felmodell och
recovery. Låsta domän- och säkerhetsbeslut i `PROJECT_DECISIONS.md` gäller.

## Repositoryanalys

### Återanvändbara applikationsskydd

- `lib/supabase/server.ts` skapar den cookie-baserade Supabase SSR-klienten och är
  markerad `server-only`.
- `lib/supabase/client.ts` är en browserklient. Den får inte användas för
  tenant-CRUD.
- `lib/server/auth/get-verified-claims.ts` hämtar verifierade claims och exponerar
  subject och AAL.
- `lib/server/auth/get-owner-authorization.ts` validerar
  `CONTROL_CENTER_OWNER_USER_ID`, verifierar både claims och Auth-user samt nekar
  vid mismatch.
- `lib/server/auth/require-authorized-owner.ts` skickar unauthenticated till login
  och fel owner till unauthorized.
- `lib/server/auth/get-owner-mfa-state.ts` hämtar TOTP-faktorer och aktuell AAL.
- `lib/server/auth/require-full-access-owner.ts` är den befintliga servergränsen
  för owner plus AAL2 och skickar säkra fel till login, MFA eller security-error.
- `app/auth/security-error/page.tsx` visar ett generellt, icke-läckande fel.
- `app/auth/logout/actions.ts` utför global sign-out och rensar cookies.
- `lib/server/audit/mfa-audit.ts` ger best-effort konsolaudit för MFA. Den är inte
  beständig tenant-audit och får inte återanvändas som sådan.
- Auth använder Server Actions; ingen generell resultat-/felklass eller tenant
  route handler finns.
- `lib/server/` är den naturliga server-only-gränsen för en framtida DAL.
- `lib/supabase/database.types.ts` beskriver ett tomt verksamhetsschema.
- `supabase/config.toml`, `supabase/migrations/.gitkeep` och
  `supabase/tests/database/infrastructure_smoke_test.sql` är den verifierade lokala
  grunden. Ingen verksamhetsmigration finns.

Applikationslagret kan verifiera environment, Auth-user och AAL2. Det kan inte
ersätta RLS, databaskontrollerad optimistic concurrency, actorbinding eller
atomisk audit. Databasen kan verifiera `auth.uid()` och singletonen men ska inte
ensam bära AAL2- eller routeansvaret.

### Observerade dokumentationskonflikter

`MODULE_STATUS.md` beskriver fortfarande Authentication och Authorization som
”Ej påbörjad”, trots att ovanstående auth- och ownerguards finns. Denna historiska
status ändras inte av Steg C; Tenant Management markeras endast som designad.

## Threat model

| Hot/attackyta                                                         | Konsekvens                             | Applikationsskydd                                                        | Databasskydd och bevis                                                            | Kvarvarande risk                                                    |
| --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Annan authenticated user, spoofad session eller manipulerad cookie    | Tenantdata exponeras eller ändras      | SSR, verifierade claims/user och ownerguard                              | RLS/funktion jämför `auth.uid()` med singleton; pgTAP med annan user              | Stulen aktiv owner-session kräver även sessions- och MFA-skydd      |
| Owner på AAL1                                                         | Känslig operation utan step-up         | `requireFullAccessOwner()` kräver AAL2                                   | DB-funktion kräver owneridentitet; app-test bevisar AAL1-nekande                  | DB kan inte ersätta korrekt routeguard                              |
| Gammal session efter ownerbyte eller borttagen owner                  | Tidigare owner behåller åtkomst        | environment-, claims- och userkontroll per request; sessioner återkallas | Singleton/FK och `auth.uid()` nekar gammalt ID; recoverytest                      | Token kan leva till återkallning, men RLS nekar efter singletonbyte |
| Fel Auth-user kopplas till deployment                                 | Fel person blir owner                  | kontrollerad gemensam bootstrapinput och equalitykontroll                | FK samt integritetsfunktion; negativa equalitytester                              | Operatörsfel i själva godkännandeprocessen                          |
| Browserklient anropar Supabase direkt                                 | Appgränser kringgås                    | tenantkod importerar aldrig browserklienten                              | SELECT-RLS; tabellmutationer saknar grants/policies; funktioner omprövar owner    | Owner kan läsa de fält SELECT-modellen medger                       |
| Saknat/ogiltigt env-värde                                             | Odefinierad app-owner                  | syntaktisk validering, fail closed                                       | ingen fallback; apptest                                                           | Login/recovery måste förbli åtkomliga                               |
| Saknad/fel/flera singletonrader eller env/DB-mismatch                 | Databasens ownerbeslut divergerar      | integrity gate före tenantåtkomst                                        | konstant PK/check, FK och integritetsfunktion; pgTAP                              | Noll rader kan inte förbjudas deklarativt och hanteras fail-closed  |
| Restore återför gammal singleton eller fel projekt                    | Gammal owner/schema får åtkomst        | tenantmodulen hålls stängd efter restore; verifiera target               | equality, migrationshistorik och negativa RLS-test före öppning                   | Manuell targetidentifiering måste vara korrekt                      |
| Bootstrap körs två gånger eller vanlig user försöker skriva singleton | Owner byts eller fler rader skapas     | ingen publik route/action                                                | idempotent, administrativ bootstrap; inga authenticated grants                    | Privilegierad driftroll kan fortfarande orsaka fel                  |
| Obehörig SELECT/INSERT/UPDATE/DELETE                                  | Dataförlust eller läckage              | server-only DAL                                                          | strikt SELECT-RLS, funktions-only mutation, DELETE saknar grant/policy            | Privilegierad adminroll ligger utanför normal RLS                   |
| Actor/revision/status/archive manipuleras                             | Falsk audit eller korrupt livscykel    | payload allowlist och validering                                         | funktion binder actor till `auth.uid()`, låser rad, jämför revision och styr fält | Bug i security-definer-funktion kräver granskning/test              |
| Stale, dubbel eller parallell mutation                                | Lost update eller dubbla event         | klient skickar `expected_revision`                                       | atomisk låsning/jämförelse; en vinner, övriga conflict; concurrencytest           | Klienten måste hämta om state                                       |
| Arkiverad tenant redigeras eller restore kringgår regler              | Fel livscykel                          | separata use cases                                                       | edit/status nekar arkiverad; restore kräver revision och sätter active            | Nya operationer måste följa samma modell                            |
| Ogiltig kategori/status/land/orgnr eller dubblett                     | Dålig eller sammanblandad data         | normalisering och inputvalidering                                        | checks, valideringsfunktion och partial unique index; pgTAP                       | Luhn bevisar struktur, inte faktisk juridisk identitet              |
| Mutation och audit får olika utfall                                   | Ospårbar eller falsk historik          | inget separat klient-auditanrop                                          | samma transaktion; auditfel rollbackar allt; felinjektionstest                    | Databasbackup kan påverka både data och audit                       |
| Klienten skickar actor/audit/fritext                                  | Spoofing eller PII-läckage             | fälten saknas i inputkontrakt                                            | funktion skapar dataminimerat event; tabellen saknar klientgrants                 | Metadata kan fortfarande vara personuppgift                         |
| Audit ändras, raderas eller läses obehörigt                           | Historik förstörs/läcker               | endast särskilt server-use case                                          | inga UPDATE/DELETE/INSERT-grants, ägar-RPC för läsning; pgTAP                     | DB-admin kan ändra data och kräver operativ audit                   |
| Migration/rollback körs i fel miljö eller remote link används         | Produktionsskada                       | explicit lokal workflow och targetkontroll                               | migrationshistorik, forward-fix, schema/RLS-test                                  | Privilegierade mänskliga fel kan inte elimineras helt               |
| CI får prod-secrets                                                   | Extern åtkomst från CI                 | lokal, olänkad CI utan secrets                                           | inga remoteoperationer                                                            | CI-konfiguration måste fortsätta granskas                           |
| Stale typer eller endast positiva RLS-test                            | Felaktig app eller oupptäckt deny-bugg | type drift-kontroll                                                      | typgenerering efter hela schemat; positiv och negativ pgTAP                       | Typfil bevisar inte semantik                                        |
| RLS saknas eller stängs av                                            | Direkt dataåtkomst                     | releasegate                                                              | test av RLS-enabled, grants och samtliga roller                                   | Privilegierad migration kan avsiktligt kringgå skydd                |

## Owner-singleton

Tabellen heter exakt `control_center_owner`. Den är endast databasens
verkställande kopia av det enda ownerbeslutet, inte ett användarregister, en
rolltabell eller tenantdata.

| Kolumn          | Logisk PostgreSQL-typ | Null/default              | Constraint och ansvar                                                          |
| --------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `singleton_key` | `smallint`            | not null, default `1`     | Primärnyckel och check exakt `1`; tillåter högst en logisk rad                 |
| `owner_user_id` | `uuid`                | not null, ingen default   | unique och FK till `auth.users(id)` med `ON DELETE RESTRICT`; owneridentiteten |
| `created_at`    | `timestamptz`         | not null, transaktionstid | Sätts vid bootstrap och ändras inte                                            |
| `updated_at`    | `timestamptz`         | not null, transaktionstid | Sätts av kontrollerat ownerbyte/recovery                                       |

Ingen revision eller integritetsmarkör läggs till; de skulle inte ge ett nytt
säkerhetsbevis. Konstant primärnyckel plus check förhindrar flera rader. SQL kan
inte med en vanlig constraint kräva minst en rad, så saknad rad är ett giltigt
bootstrapläge men blockerar all tenantåtkomst. Integritetskontrollen rapporterar
även ett defensivt `invalid_database_owner_state` om strukturen inte kan tolkas.

FK till `auth.users` är låst: den förhindrar en dangling owner och gör felaktig
bootstrap synlig. `RESTRICT` innebär att ownerbyte först måste etablera ny
Auth-user och därefter atomiskt byta singletonen innan gammal user tas bort. Vid
restore måste Auth och singleton verifieras tillsammans. Testmiljön skapar
syntetiska Auth-users före singletonen.

RLS ska aktiveras. `anon`, `authenticated` och normal `service_role`-användning får
inga direkta SELECT/INSERT/UPDATE/DELETE-grants. Owner får alltså **inte** SELECT
direkt. En smal security-definer-integritetsfunktion returnerar endast kategoriskt
resultat, och en separat boolesk helper används av RLS. Publik execute återkallas;
endast `authenticated` får anropa de avsedda funktionerna. Funktionerna ska ha
låst `search_path`, schema-kvalificerade objekt, säkert ägarskap och validerad
`auth.uid()`. Den normala appen använder aldrig Service Role.

Bootstrap, ownerbyte, recovery, restore och rollback sker endast via en separat,
granskad administrativ process med privilegierad driftroll. Bootstrap är
idempotent endast när befintligt värde redan motsvarar godkänd input; mismatch
stoppar. Ingen publik route, Server Action eller normal CRUD får ändra tabellen.

## Equality- och integritetsmekanism

DB-delen av mekanismen är nu implementerad i
`public.get_owner_integrity_status()`. Den läser endast `auth.uid()` och den
skyddade singletonen. Unauthenticated returneras innan singletonen läses.
Environmentvalidering, AAL2-guardens integration, RPC-felmappning och
request-lokal deduplicering återstår i applikationslagret.

Serverdelen är nu också implementerad. `CONTROL_CENTER_OWNER_USER_ID` måste finnas
utan omgivande whitespace och följa repositoryts bindestrecksseparerade
UUID-format; värdet normaliseras till lowercase först efter godkänd validering.
Environment/Auth jämförs explicit och Auth/DB bevisas av den kategoriska RPC:n.
Okända/null/strukturellt oväntade RPC-resultat samt tekniska fel blir
`integrity_check_unavailable`.

Ingen memoization eller cache används. Verifierat context kan senare
vidarebefordras explicit inom samma request, men inget resultat får leva mellan
requests. Fel loggas endast med eventnamn, allowlistad kategori, tidsstämpel och
servergenererat correlation-id; UUID, session, token, claims, raw environment och
raw Supabase-fel är förbjudna.

Defense in depth-flödet är:

1. Servern validerar att `CONTROL_CENTER_OWNER_USER_ID` finns och är ett UUID.
2. `requireFullAccessOwner()` verifierar claims, aktuell Auth-user, environment
   owner och AAL2.
3. Servern anropar den smala integritetsfunktionen med environment-owner som
   förväntat värde. Funktionen jämför argumentet, singletonen och `auth.uid()`.
4. Varje mutation omprövar DB-owner i samma transaktion. SELECT-RLS använder den
   booleska helpern och returnerar inga rader vid fel.
5. Bootstrap/recovery etablerar environment och singleton från samma godkända
   input och kör equalitytest innan modulen öppnas.

Intern resultatmodell: `ok`, `missing_environment_owner`,
`invalid_environment_owner`, `missing_database_owner`,
`invalid_database_owner_state`, `owner_mismatch`,
`authenticated_user_mismatch`, `insufficient_assurance_level` och
`integrity_check_unavailable`. Environment- och AAL-resultat skapas i appen;
DB-funktionen returnerar endast DB/Auth-relevanta kategorier. Alla fel mappas för
klienten till generell security-error och avslöjar aldrig UUID eller radinnehåll.

Tenantlistor, tenantdetaljer, auditläsning och samtliga mutationer blockeras vid
annat än `ok`. Login, MFA enroll/challenge, logout, unauthorized och
security-error förblir tillgängliga när deras befintliga guards medger det.

Resultatet får inte lagras i process-, distribuerad eller beständig cache.
Request-lokal deduplicering är tillåten, men mutationens DB-kontroll får aldrig
hoppas över. Läsning ska vara dynamisk och inte använda Next.js output-cache.

Loggning får innehålla felkategori, logisk environmentetikett,
request/correlation-id och tidsstämpel. Fullständigt owner-UUID, token, cookie,
sessionpayload, administrativ notering, connection string och råa databasfel är
förbjudna.

## Tenanttabell

Tabellen heter exakt `tenants`. Endast normaliserat organisationsnummer lagras;
råformat ger dubbla sanningar utan verksamhetsvärde. Presentationsformat med
bindestreck genereras endast vid visning och lagras aldrig.

| Kolumn                | Typ           | Null/default                | Constraint                                 | Mutability/audit                     | Klient och känslighet                  |
| --------------------- | ------------- | --------------------------- | ------------------------------------------ | ------------------------------------ | -------------------------------------- |
| `id`                  | `uuid`        | not null, DB-genererad UUID | PK                                         | immutable; create-event              | Ja; intern identifierare               |
| `category`            | `text`        | not null                    | `customer`, `pilot`, `internal`            | immutable efter create; create-event | Ja                                     |
| `organization_number` | `text`        | nullable                    | 10 siffror, Luhn, kategori, partial unique | edit; endast fältnamn i audit        | Endast behörig detalj; skyddsvärt      |
| `legal_name`          | `text`        | not null                    | trim, 1–200 tecken                         | edit; fältnamn                       | Ja                                     |
| `contact_name`        | `text`        | nullable                    | trim, 1–120 när satt                       | edit; endast fältnamn                | Behörig detalj; personuppgift          |
| `contact_email`       | `text`        | nullable                    | trim/lowercase, 3–254, enkel struktur      | edit; endast fältnamn                | Behörig detalj; personuppgift          |
| `contact_phone`       | `text`        | nullable                    | trim, 1–32 när satt                        | edit; endast fältnamn                | Behörig detalj; personuppgift          |
| `country_code`        | `text`        | not null, default `SE`      | exakt `SE`                                 | immutable; create-event              | Ja                                     |
| `operational_status`  | `text`        | not null, default `active`  | `active`, `paused`                         | endast statusfunktion; eventtyp      | Ja                                     |
| `archived_at`         | `timestamptz` | nullable                    | konsistent med `archived_by`               | endast archive/restore; eventtyp     | Ja                                     |
| `archived_by`         | `uuid`        | nullable                    | konsistent med `archived_at`               | DB-bunden actor; ej payload          | Behörig detalj; actor-id               |
| `revision`            | `bigint`      | not null, default `1`       | positiv                                    | DB-styrd +1; before/after i audit    | Endast concurrency-token, inte UI-data |
| `created_at`          | `timestamptz` | not null, transaktionstid   | DB-styrd                                   | immutable                            | Ja                                     |
| `created_by`          | `uuid`        | not null                    | DB-bunden `auth.uid()`                     | immutable                            | Behörig detalj; actor-id               |
| `updated_at`          | `timestamptz` | not null, transaktionstid   | DB-styrd                                   | varje mutation                       | Ja                                     |
| `updated_by`          | `uuid`        | not null                    | DB-bunden `auth.uid()`                     | varje mutation                       | Behörig detalj; actor-id               |
| `administrative_note` | `text`        | nullable                    | trim, 1–1000 när satt                      | edit; endast fältnamn                | Behörig detalj; känslig fritext        |

Actorfält i `tenants` får inte FK till `auth.users`; historiken måste bestå när en
owner återställs eller tas bort. De accepteras aldrig från klienten.

Följande finns uttryckligen inte: `customer_number`, `tenant_number`, `slug`,
`deleted_at`, `deleted_by`, `terminated_at`, draftstatus, CRM-fält, multipla
contacts, installations-, licens- eller supportfält.

## Constraints

- PK på `id`; `id` är immutable.
- Check för tillåtna kategorier och separat check för status.
- `country_code = 'SE'`.
- `revision > 0`.
- `customer` och `pilot` kräver organisationsnummer.
- `internal` får ha null eller ett giltigt svenskt organisationsnummer.
- Organisationsnummer är exakt tio ASCII-siffror och passerar Luhn.
- En immutable, schema-kvalificerad DB-valideringsfunktion används av checken.
  Mutationerna normaliserar/validerar också och appen ger tidig feedback.
- Partial unique index på icke-null organisationsnummer.
- `archived_at` och `archived_by` är antingen båda null eller båda non-null.
- `created_by` och `updated_by` är obligatoriska; funktionerna binder dem till
  `auth.uid()`.
- `legal_name` är trimmat, non-empty och högst 200 tecken.
- Nullable kontakt-/noteringsfält måste vara trimmade och non-empty när satta;
  maxlängder är 120, 254, 32 respektive 1000.
- E-post normaliseras till lowercase och måste minst ha en enkel lokal/domändel
  utan whitespace; full RFC-validering görs inte i databasen.
- `updated_at` får inte vara före `created_at`.
- Kategori, country, id och created-fält ändras inte av någon normal funktion.

Luhn och format bevisar inte att organisationen existerar; juridisk verifiering
är en separat verksamhetskontroll.

## Index

Första versionen innehåller endast:

- PK-index på `tenants.id`.
- Partial unique index på `organization_number` där värdet inte är null, för
  dubblettskydd och exakt uppslag.
- Partial B-tree på `(legal_name, id)` där `archived_at` är null, för den primära
  aktiva listan med stabil sortering.

Separata status-, kategori-, `created_at`-, `updated_at`-, arkiv-, kombinations-
och fuzzy/searchindex skjuts upp tills faktiska queryplaner och datamängder
motiverar dem. Arkivlistans lilla första datamängd får använda PK/table scan.

## RLS och grants

**Modell B låses:** SELECT genom strikt RLS, alla mutationer genom
security-definer-funktioner. Modell A ger större attackyta och gör actorbinding,
revision, livscykel och atomisk audit svårare att bevisa.

| Roll/operation              | SELECT                               | INSERT/UPDATE/DELETE         | Funktionsanrop                  |
| --------------------------- | ------------------------------------ | ---------------------------- | ------------------------------- |
| `anon`                      | Nekas                                | Nekas                        | Nekas                           |
| Korrekt authenticated owner | Tillåts av RLS, inklusive arkiverade | Direkt nekas                 | Endast allowlistade operationer |
| Annan authenticated user    | Nekas fail-closed                    | Nekas                        | Nekas efter DB-ownerkontroll    |
| Privilegierad driftroll     | Endast kontrollerad drift            | Migration/bootstrap/recovery | Kontrollerad drift              |
| `service_role`              | Inte i normal app                    | Inte i normal app            | Inte i normal app               |

RLS är enabled och varje SELECT-policy kräver att `auth.uid()` matchar den enda
singletonen. Saknad/ogiltig singleton ger false. Arkiverade rader döljs inte av
RLS för owner; service/DAL väljer rätt vy. Tabellerna ger inga direkta
INSERT/UPDATE/DELETE-grants till `authenticated`, och inga mutationspolicies
skapas. Permanent DELETE saknar både normal grant och funktion.

## Atomiska mutationer

Alla funktioner har låst search path, minsta grants, ownerkontroll och en
transaktion som både ändrar tenant och skapar audit. Servern kräver först
`requireFullAccessOwner()` och equality. DB binder actor till `auth.uid()`.

| Operation | Tillåtna input/preconditions                                                         | Atomiskt resultat                                                                              |
| --------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Create    | category, normaliserbara verksamhetsfält och correlation-id; ingen expected revision | DB skapar UUID, SE, active, revision 1, actor/tider, inga arkivfält och `tenant_created`       |
| Edit      | id, expected revision, legal name, orgnr, kontaktfält, note; unarchived              | Endast dessa fält ändras; revision +1, updated actor/tid, `tenant_edited` med ändrade fältnamn |
| Pause     | id, expected revision; unarchived och active                                         | paused, revision +1 och `tenant_paused`                                                        |
| Activate  | id, expected revision; unarchived och paused                                         | active, revision +1 och `tenant_activated`                                                     |
| Archive   | id, expected revision; unarchived active eller paused                                | archive actor/tid, revision +1 och `tenant_archived`                                           |
| Restore   | id, expected revision; archived                                                      | arkivfält null, status active, revision +1 och `tenant_restored`                               |

Kategori är immutable efter create. Det undviker att ett etablerat
kund-/pilot-/internal-beslut och dess orgnummerkrav ändras genom vanlig edit; en
framtida omklassificering kräver nytt uttryckligt beslut och operation.

Varje operation låser/motsvarande serialiserar raden och kontrollerar revision
innan state. Saknad rad ger `not_found`; mismatch ger `conflict`; fel övergång ger
`invalid_state_transition`; constraint/input ger `validation_error`; ownerfel
ger `unauthorized`; auditfel rollbackar och ger `audit_failure`.

Upprepade pause/activate/archive/restore är inte tysta no-op. Stale revision ger
alltid conflict; med aktuell revision men fel state ges invalid state transition.
Ingen revision eller dubbelt audit-event skapas vid misslyckat anrop.

## Beständig audit

Tabellen heter `tenant_audit_events` och är en append-only verksamhetsaudit.

| Fält                      | Ansvar                                           |
| ------------------------- | ------------------------------------------------ |
| `id uuid`                 | DB-genererat audit-id                            |
| `tenant_id uuid`          | FK till `tenants.id` med delete restrict         |
| `event_type text`         | Endast de sex allowlistade eventtyperna          |
| `actor_user_id uuid`      | `auth.uid()`, ingen FK för historisk kontinuitet |
| `occurred_at timestamptz` | DB:s transaktionstid                             |
| `revision_before bigint`  | null endast för create                           |
| `revision_after bigint`   | positiv; exakt mutationens nya revision          |
| `changed_fields text[]`   | Sorterad allowlist av ändrade fältnamn           |
| `correlation_id uuid`     | Valfritt syntetiskt request-id, inte persondata  |

Environment lagras inte i varje rad: databasen/projektet är miljögränsen och ett
klientvärde vore spoofbart. Audit lagrar endast eventmetadata och ändrade
fältnamn, aldrig gamla/nya/hassade värden. Note, kontaktpayload, orgnummer, token,
session, cookie, rå request och stack trace är förbjudna.

Endast mutationsfunktionerna får INSERT. Ingen klientroll får direkt
INSERT/UPDATE/DELETE, och inga ändringsfunktioner finns. Audit och mutation delar
transaktion; failure på endera sidan rollbackar båda. Owner läser audit endast
via en särskild serveranropad, ownerkontrollerad read-funktion med pagination;
ingen browser- eller direkt tabellåtkomst.

## Testdesign

| Område          | DB/pgTAP                                                                                                                                 | Applikationstest                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Singleton       | högst en rad, andra raden blockeras, saknad rad fail-closed, FK, anon kan inte läsa, authenticated kan inte skriva, korrekt owner-helper | missing/invalid env                                            |
| Equality        | ok, DB saknas, DB/Auth mismatch, annan user, unavailable/exception fail-closed                                                           | env/DB/Auth-flöde, AAL1 nekas, AAL2 tillåts, säker felmappning |
| Giltiga tenants | customer, pilot, internal med/utan orgnr enligt regler                                                                                   | inputnormalisering                                             |
| Constraints     | kategori, status, country, revision, orgnr format/Luhn/dubblett, archive consistency, tomt/långt namn, kontaktlängder, lång note         | säkra valideringsmeddelanden                                   |
| SELECT-RLS      | anon, annan authenticated, owner, saknad/fel singleton; aktiva och arkiverade                                                            | serverguard och ingen browserimport                            |
| Mutation grants | direkt INSERT/UPDATE/DELETE nekat för anon/authenticated                                                                                 | repository använder endast RPC                                 |
| Create/edit     | defaults, allowlist, immutable fält, actor, revision och not found                                                                       | payload kan inte innehålla actor/revision                      |
| Livscykel       | pause, activate, archive från active/paused, restore, arkiverad edit nekas                                                               | UI/service state mapping senare                                |
| Concurrency     | stale expected revision och två parallella mutationer ger exakt en vinnare                                                               | conflict mapping/retrypolicy                                   |
| Audit           | ett korrekt event per mutation, before/after, actor, changed fields                                                                      | inga känsliga värden i logg                                    |
| Auditintegritet | direkt insert/update/delete nekat, auditfel rollbackar mutation, verksamhetsfel rollbackar audit                                         | generellt auditfel                                             |
| Schemaförsvar   | RLS enabled, grants och funktions-execute exakt allowlistade                                                                             | generated types matchar efter hela kedjan                      |

Tester använder endast syntetiska UUID:n och data. Negativa RLS-fall är lika
obligatoriska som positiva.

## Migrationsplan

Flera små, ordnade migrationer låses:

1. `20260724184023_create_control_center_owner.sql`: implementerad och lokalt
   verifierad singleton, constraints, FK, FORCE RLS och grants. Test: struktur,
   FK, max en, ägarskap, RLS och direkta grants.
2. `<timestamp>_create_owner_integrity_functions.sql`: boolesk RLS-helper och
   kategorisk equalityfunktion. Test: owner/annan/missing/fel.
3. `<timestamp>_create_tenants.sql`: orgnummervalidering, tabell, constraints och
   första index. Test: samtliga dataconstraints.
4. `<timestamp>_create_tenant_audit.sql`: append-only audit och grants. Test:
   payload/immutability.
5. `<timestamp>_create_tenant_rls_and_grants.sql`: SELECT-policy och explicit
   avsaknad av direktmutation. Test: rollmatris.
6. `<timestamp>_create_tenant_mutation_functions.sql`: sex atomiska funktioner
   och audit-read-funktion. Test: mutation, concurrency och auditrollback.

pgTAP-filer versionshanteras per ansvar men är inte migrationer. Efter att hela
kedjan resetats, lintats och testats genereras `database.types.ts` en gång och
type drift-kontrollen körs. Typgenerering tidigare skulle skapa mellanlägestyper.

Applicerade migrationer ändras aldrig. Fel rättas med ny granskad forward-fix.
Rollback av en ännu ej delad lokal kedja kräver separat godkännande; remote
rollback är inte normalväg. Varje steg måste lämna åtkomst fail-closed även om
senare migrationer saknas.

## Framtida server-side DAL

Rekommenderad struktur, utan implementation:

```text
lib/server/tenants/
  tenant.types.ts
  tenant.validation.ts
  tenant.errors.ts
  tenant.integrity.ts
  tenant.repository.ts
  tenant.service.ts
  tenant.presenter.ts
```

Alla filer under gränsen som använder databas markeras `server-only`.
`tenant.types.ts` skiljer input, DB-resultat och klient-safe DTO.
`validation.ts` normaliserar och validerar. `integrity.ts` anropar equality-RPC.
`repository.ts` använder SSR-klienten och endast godkända SELECT/RPC.
`service.ts` styr use case och felmappning. `presenter.ts` allowlistar klientfält.

Request flow: Server Action/route → `requireFullAccessOwner()` → request-lokal
equalitykontroll → inputvalidering → service → repository/atomisk DB-funktion →
stabil felmappning → explicit cache invalidation. DB-funktionen äger
actorbinding, revision och audit. Ingen tenantrepository importeras av
Client Components eller `lib/supabase/client.ts`. Läsningar är uncached som
standard; eventuell framtida cache kräver separat säkerhetsbeslut.

## Felmodell

| Intern kod                 | Framtida HTTP | Säker text                                 | Logg/retry/exponering                                   |
| -------------------------- | ------------- | ------------------------------------------ | ------------------------------------------------------- |
| `unauthorized`             | 401/403       | Åtkomst nekad.                             | info/warn; ingen automatisk retry; inga detaljer        |
| `mfa_required`             | 403           | Ytterligare verifiering krävs.             | info; retry efter MFA; säker redirect                   |
| `owner_integrity_failure`  | 503           | Säkerhetskontrollen kunde inte slutföras.  | error med kategori; retry först efter åtgärd; inga UUID |
| `not_found`                | 404           | Objektet kunde inte hittas.                | info; ingen retry                                       |
| `conflict`                 | 409           | Uppgifterna har ändrats. Läs in dem igen.  | info; hämta om och låt user välja                       |
| `validation_error`         | 422           | Kontrollera angivna uppgifter.             | info; endast fältsäkra detaljer                         |
| `invalid_state_transition` | 409           | Åtgärden är inte tillåten i aktuellt läge. | info; hämta om                                          |
| `audit_failure`            | 503           | Ändringen kunde inte sparas säkert.        | error; kontrollerad retry; ingen DB-detalj              |
| `database_unavailable`     | 503           | Tjänsten är tillfälligt otillgänglig.      | error; retry med backoff                                |
| `unexpected_error`         | 500           | Ett oväntat fel inträffade.                | error med correlation-id; ingen detalj                  |

Klienten får aldrig veta förväntat/hittat UUID, singletoninnehåll eller om en
specifik annan user finns.

## Recoverypåverkan

- Första bootstrap skapar/verifierar Auth-owner före singletonen och etablerar
  environment/singleton från samma godkända input.
- Ownerbyte skapar och MFA-säkrar ny Auth-user, byter environment och singleton
  under stoppad tenantmodul, verifierar equality/RLS och återkallar gamla
  sessioner innan gammal user kan tas bort.
- Borttagen Auth-owner blockeras normalt av FK. Om Auth/data redan divergerat
  förblir Tenant Management stängd tills kontrollerad recovery.
- Restore eller rollback kan återinföra gammal singleton, schema, grants eller
  audit. Inga tenantvägar öppnas innan target, migrationshistorik, equality,
  positiva och negativa RLS-test samt typer verifierats.
- Forward-fix föredras efter applicerad migration. Osäker policy får aldrig
  tillfälligt ersätta ett fel.
- Stale typer stoppar CI efter typgenereringssteget.
- Gamla cookies återkallas vid ownerbyte; singleton-RLS nekar dem även före
  fullständig expiry.
- Tenantrevisioner och audit behandlas som en sammanhängande historik. Restore
  måste verifiera att varje tenantrevision och senaste auditrevision är
  konsistenta; historik får inte ”repareras” med direkt update.

## Låsta beslut

- `control_center_owner`, konstant PK/check `singleton_key = 1`, FK
  `owner_user_id → auth.users(id) ON DELETE RESTRICT`.
- Owner har ingen direkt singleton-SELECT; en smal kategorisk funktion används.
- Equality verifieras i app, DB-funktion, RLS och bootstrap/recovery utan
  processcache.
- `tenants` med exakt kolumnuppsättning i tabellen ovan.
- Endast normaliserat tioställigt organisationsnummer lagras; Luhn via immutable
  DB-funktion + check + mutations- och appvalidering.
- Kategori är immutable efter create.
- Modell B: SELECT-RLS, endast databasfunktioner för mutation.
- Upprepade state-anrop ger conflict vid stale revision, annars state error.
- Audit heter `tenant_audit_events`, lagrar eventmetadata/fältnamn och läses
  endast via serveranropad funktion.
- Sex små schemamigrationer i angiven ordning; typer genereras efter hela kedjan.
- DAL placeras i `lib/server/tenants/`; ingen browser-CRUD.
- Fel-, cache- och recoverymodellerna ovan gäller.
- Databasobjekt använder `snake_case`; verksamhetstabeller är plural medan en
  faktisk singleton får vara singular.
- Funktioner följer `verb_noun`. Constraints följer `pk_<table>`,
  `fk_<table>_<column>`, `uq_<table>_<column_or_purpose>` och
  `ck_<table>_<purpose>`. Index följer `idx_<table>_<column_or_purpose>`,
  policies `<table>_<operation>_<purpose>` och auditobjekt innehåller `audit`.

## Öppna blockerare

Följande blockerar inte första lokala migrationen men måste lösas före angiven
gräns:

- Exakt privilegierad deployment-/bootstrapidentitet och godkännandeprocess måste
  låsas innan singleton skrivs i en delad miljö.
- Auditens retentionstid, export/backup och rättsliga åtkomstprocess måste låsas
  före verkliga pilotdata.
- Rätt remoteprojekt, Postgres-/extensionstöd, backup och restoremetod måste
  verifieras före första remote deployment. Repositoryt får inte gissa detta.

## Security Pass-resultat

Security Pass är **godkänt med ovanstående operativa blockerare**. Inga kända
designblockerare återstår för implementation av den första lokala
owner-singletonmigrationen och tillhörande pgTAP-test. Godkännandet gäller
designen, inte en ännu ej existerande implementation.
