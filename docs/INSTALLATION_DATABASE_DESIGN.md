# Installation Database Design

## Status och source of truth

Detta dokument låser F2C1:s databasgrund, F2C2:s owner-only read access, F2C3:s
separata auditgrund, F2C4:s atomiska mutationer och F2C5:s paginerade audit-read
för Installation Management. Stegen är lokalverifierade genom migrationer,
pgTAP, typgenerering och full regression. Dokumentet får inte utökas med
integrationsstatus utan ett separat analyserat steg.

## Definition och relation

En installation är en självständigt identifierbar och administrerbar teknisk
SweDox-miljö. Den tillhör exakt en tenant och kan senare vara mål för
provisioning, deployment och monitoring.

Relationen är `Tenant 1 -> 0..n Installation`. `tenant_id` är obligatoriskt och
ska vara immutable efter create. En installation får inte flyttas mellan
tenants. FK använder `ON DELETE RESTRICT`. Flera installationer med samma
environment, inklusive flera production-installationer, är tillåtna per tenant.
F2C1 verkställer endast relationens struktur. Arkiverad eller pausad tenant och
annan availability ska senare kontrolleras atomiskt i mutationsfunktionerna.

## Låst datakontrakt

`public.installations` har exakt följande 17 kolumner i ordning:

| Kolumn                  | Typ           | Null/default                    | Kontrakt                        |
| ----------------------- | ------------- | ------------------------------- | ------------------------------- |
| `id`                    | `uuid`        | `NOT NULL`, `gen_random_uuid()` | Primärnyckel, systemstyrd       |
| `tenant_id`             | `uuid`        | `NOT NULL`                      | FK till tenant, immutable       |
| `installation_code`     | `text`        | `NOT NULL`                      | Globalt unik, immutable         |
| `display_name`          | `text`        | `NOT NULL`                      | Canonical visningsnamn          |
| `environment`           | `text`        | `NOT NULL`                      | Immutable environment           |
| `administrative_status` | `text`        | `NOT NULL`, `planned`           | Administrativ status            |
| `application_url`       | `text`        | Null                            | Skyddsvärd HTTPS-metadata       |
| `supabase_project_ref`  | `text`        | Null                            | Skyddsvärd projektidentifierare |
| `hosting_region`        | `text`        | Null                            | Canonical providerregion        |
| `administrative_note`   | `text`        | Null                            | Konfidentiell metadata          |
| `revision`              | `bigint`      | `NOT NULL`, `1`                 | Positiv concurrencyrevision     |
| `created_at`            | `timestamptz` | `NOT NULL`, `current_timestamp` | Systemtid                       |
| `created_by`            | `uuid`        | `NOT NULL`                      | Beständig actor, ingen Auth-FK  |
| `updated_at`            | `timestamptz` | `NOT NULL`, `current_timestamp` | Systemtid                       |
| `updated_by`            | `uuid`        | `NOT NULL`                      | Beständig actor, ingen Auth-FK  |
| `archived_at`           | `timestamptz` | Null                            | Arkiveringstid                  |
| `archived_by`           | `uuid`        | Null                            | Arkiverande actor               |

## Canonical formats

- `installation_code`: 1–64 tecken, lowercase ASCII, siffror och enkla
  bindestreck mellan segment; `^[a-z0-9]+(-[a-z0-9]+)*$`.
- `display_name`: 1–120 tecken, trimmat och utan upprepade whitespace-tecken.
- `environment`: exakt `production`, `staging`, `test` eller `development`.
  `pilot` är tenantkategori, inte environment.
- `application_url`: 9–2048 tecken, trimmad absolut `https://`-URL. Whitespace,
  credentials och fragment är förbjudna. Constrainten validerar ett säkert
  canonical delkontrakt och försöker inte ersätta en full URL-parser. URL:en får
  inte hämtas eller användas som monitoringtarget i F2C1.
- `supabase_project_ref`: 1–64 lowercase alfanumeriska tecken utan whitespace.
  Inget påhittat exakt längdkrav används. Värdet är unikt när det finns.
- `hosting_region`: 1–64 lowercase alfanumeriska segment med bindestreck.
- `administrative_note`: 1–1000 trimmade tecken när värdet finns; tom sträng
  lagras inte canonicalt.
- `revision` är positiv och `updated_at >= created_at`.
- `archived_at` och `archived_by` är antingen båda null eller båda satta.

## Status och arkivering

Administrativ status är exakt `planned`, `active`, `paused` eller
`decommissioned`. Den är skild från provisioning-, deployment- och
healthstatus. F2C1 implementerar inga transitions.

Decommission beskriver administrativ livscykel medan archive är separat
synlighetsmetadata. Framtida mutationer ska kräva decommission före archive;
F2C1 ändrar inte status automatiskt.

## Metadata, version och secrets

Control Center lagrar installationsmetadata, aldrig kunddata eller credentials.
Databaslösenord, credential-bärande anslutningssträngar, Service Role keys, JWT-
och SMTP-secrets, tokens, privata nycklar, sessioner och backupinnehåll är
förbjudna. Framtida secrets ska ligga i en godkänd extern secret manager.

Supabase project ref är en identifierare, inte en credential, men ska inte
skrivas i generell loggning. Installerad SweDox-version och senaste deploytid
ingår inte: deployment-/releasedomänen ska senare äga verifierad sanning.

## Index

F2C1 skapar endast:

- primärnyckeln
- global unik installation code
- partiellt unik project ref för non-null-värden
- tenant-FK-index
- stabil `(display_name, id)`-listning för icke arkiverade rader
- stabil `(tenant_id, display_name, id)`-listning per tenant

Environment-, status-, URL-, region-, update- och sökindex väntar på verifierade
querymönster.

## Grants och owner-only RLS

F2C2 aktiverar RLS och FORCE RLS. `authenticated` har endast SELECT medan
`PUBLIC`, `anon` och `service_role` saknar tabellprivilegier; samtliga API-roller
saknar direkta writes. Exakt en policy, `installations_owner_select`, gäller
SELECT för `authenticated` och använder den befintliga fail-closed-helpern
`public.is_control_center_owner()`.

Verifierad owner kan läsa samtliga 17 kolumner och alla installationsrader,
inklusive arkiverade installationer och installationer vars tenant är arkiverad.
Authenticated non-owner, null auth, saknad owner-singleton och mismatch ger noll
rader. Policyn gör ingen tenantjoin och filtrerar inte tenantstatus eller
arkivering; tenant availability hör till framtida mutationer.

Lokal `service_role` har plattformsegenskapen BYPASSRLS men saknar explicit
installationsgrant, omfattas inte av policyn och används inte i appkoden.
Privilegierade databasroller förblir operativa administrationsundantag.

Privilegierade databasroller kan fortfarande administrera tabellen. Direkta
appwrites förblir förbjudna; framtida typade mutations-RPC:er ska verkställa
immutability, tenant availability, revision och audit atomiskt.

## Framtida modulgränser

- Provisioning äger jobb, steg, retries och providerfel.
- Deployment äger verifierad installerad version och deploystatus.
- Monitoring äger observationer, freshness, health, incidents och alerts.
- Dashboard får endast konsumera modulägda summary-reads.

## Installation audit

`public.installation_audit_events` är en separat append-only metadata-only logg
med exakt nio kolumner: `id`, `installation_id`, `event_type`, `actor_user_id`,
`occurred_at`, `revision_before`, `revision_after`, `changed_fields` och
`correlation_id`. Tenant-ID dupliceras inte utan härleds via installationens
immutable relation. Installation-FK använder delete restrict och actor saknar
Auth-FK.

Tillåtna event är `installation_created`, `installation_edited`,
`installation_activated`, `installation_paused`, `installation_decommissioned`,
`installation_archived` och `installation_restored`.

Create har null `revision_before` och `revision_after = 1`. Övriga event kräver
positiv före-revision och exakt nästa revision. `(installation_id,
revision_after)` är unik.

`changed_fields` är en icke-tom endimensionell array utan nuller eller dubbletter.
Den får endast innehålla installationens 17 kolumnnamn i tabellens canonical
kolumnordning. Arrayen innehåller aldrig värden, snapshots, JSON, URL, project
ref, notering, credentials, requestpayload eller providerfel. `correlation_id`
är en valfri servergenererad UUID.

UPDATE och DELETE blockeras av en trigger med SQLSTATE `55000`. Tabellen har RLS
och FORCE RLS, noll policies och noll direkta grants för `PUBLIC`, `anon`,
`authenticated` och `service_role`. F2C3 skapar ingen audit write/read RPC.
Framtida mutationer skriver audit atomiskt; framtida owner-read sker genom en
separat paginerad RPC.

Provisioning-, deployment-, health-, monitoring- och alert-events hör till sina
egna framtida domäner. Installation audit och tenant audit slås inte ihop.

F2C1–F2C3 skapar ingen installationsmutation, repository, service, route,
action, UI, provisioning, monitoring eller Dashboard-read. Installation
Management är inte verksamhetsklart.

## Atomiska mutationer

F2C4 skapar exakt sju `SECURITY DEFINER`-RPC:er: `create_installation`,
`update_installation`, `activate_installation`, `pause_installation`,
`decommission_installation`, `archive_installation` och
`restore_installation`. Samtliga är postgresägda, volatile, parallel unsafe,
har `search_path = pg_catalog`, omprövar `public.is_control_center_owner()` och
binder actor till `auth.uid()`. Endast `authenticated` har EXECUTE.

Create tar tenant, installation code, display name, environment, valfri URL,
project ref, region, notering och correlation UUID. Den sätter planned,
revision 1, actor/tider och tom archivemetadata. Update tar installation-ID,
expected revision och en full målbild för endast display name, URL, project ref,
region och notering. Immutable identitet, status, actor, tider, revision och
archive kan inte klientstyras.

Alla mutationer kräver att tenant är active och icke arkiverad. Paused,
arkiverad eller saknad tenant ger `tenant_not_available`; tenantstatus ändrar
aldrig installationens status automatiskt. Update tillåts för decommissioned
men oarkiverad installation.

Tillåtna transitions är:

- planned eller paused till active; URL, project ref och region krävs
- active till paused
- planned, active eller paused till terminal decommissioned
- endast decommissioned till archived
- restore återställer endast synlighet och bevarar decommissioned

Alla funktioner utom create låser raden, kontrollerar positiv expected revision
före state och ökar revision exakt ett steg. Varje lyckad mutation skriver exakt
en auditpost i samma transaktion. Auditfel ger `audit_failure` och rullar tillbaka
hela installationsändringen. Correlation UUID är nullable i DB men ska senare
alltid genereras server-side.

Stabila DB-fel är `unauthorized`, `not_found`, `conflict`, `validation_error`,
`invalid_state_transition`, `tenant_not_available`, `duplicate_installation`
och `audit_failure`. Både duplicate installation code och duplicate project ref
mappas till `duplicate_installation`.

## Paginerad audit-read

F2C5 exponerar endast
`list_installation_audit_events(uuid, integer, timestamptz, uuid)` till
`authenticated`. Funktionen är ownerkontrollerad, stable, postgresägd
`SECURITY DEFINER` med fast search path. `PUBLIC`, `anon` och `service_role`
saknar EXECUTE.

Installation-ID är obligatoriskt. Standardsidan är 25 och max är 100. Resultatet
sorteras stabilt på `(occurred_at DESC, id DESC)` och cursorn består av exakt
samma timestamp/UUID-par bundet till installationen. Output är auditens nio
metadatafält plus `has_more`, `next_cursor_occurred_at` och `next_cursor_id`.

Audittabellen behåller RLS, FORCE RLS, noll policies och noll direkta grants.
F2C5 skapar ingen generell installationsread, sökning, filtrering, export,
retention, backup, DAL, route eller UI. Installation Management är inte
verksamhetsklart.

## Paginerad installationslista

F2C6A exponerar endast `list_installations(integer, text, uuid, uuid, text,
text, boolean, text)` till `authenticated`. Funktionen är ownerkontrollerad,
stable, postgresägd `SECURITY DEFINER` med fast search path. `PUBLIC`, `anon`
och `service_role` saknar EXECUTE.

Standardsidan är 50 och max är 100. Resultatet sorteras stabilt på
`(display_name ASC, id ASC)` och cursorn består av exakt samma text/UUID-par.
Cursorposten måste finnas och matcha samma tenant-, environment-, status-,
archive- och sökfilter; annars nekas anropet med `validation_error`.

Filtren för tenant, environment och administrativ status appliceras före
keyset-pagination. Arkiverade installationer är exkluderade som standard.
Sökning är case-insensitive men behandlar `%` och `_` bokstavligt och matchar
endast installationens display name och installation code. Tenantens legal
name och härledd application host ingår medvetet inte i sökvillkoret. Inte
heller full URL, project ref, hosting region eller administrativ notering får
påverka träffresultatet.

Output består endast av `id`, `tenant_id`, `tenant_legal_name`,
`installation_code`, `display_name`, `environment`,
`administrative_status`, `hosting_region`, `application_host`, `revision`,
`updated_at`, `archived_at`, `has_more`, `next_cursor_display_name` och
`next_cursor_id`. Full `application_url`, `supabase_project_ref`,
`internal_note` och andra verksamhetsvärden exponeras inte.

F2C6A använder befintliga listindex och inför inga nya index, direkta
tabellgrants, DAL/service, routes, actions eller UI.

## Server-only DAL och servicelager

F2C6B kapslar installationsdomänens läsningar och sju mutationer under
`lib/server/installations`. Varje publik operation kör
`requireOwnerIntegrity()` före repositoryåtkomst och skapar därefter exakt en
request-lokal, cookie-baserad Supabase SSR-klient. Repositoryt innehåller endast
detail-SELECT och låsta RPC-anrop; ingen ownerguard, redirect eller
felpresentation.

Serviceytan består av list, detail, audit, create, update, activate, pause,
decommission, archive och restore. List-DTO:n innehåller endast list-säker
metadata, tenant legal name och host-only application host. Detail innehåller
full URL, project ref och administrativ notering men inga actor-UUID:n.
Auditresultat från annan installation nekas fail-closed.

Alla inputs och DB/RPC-resultat runtimevalideras före central
snake_case-till-camelCase-mapping. Nullable fält bevaras. Endast låsta stabila
felkoder lämnar servicegränsen; oväntade fel loggas med syntetiskt correlation
ID utan URL, project ref, notering eller payload. Inga routes, Server Actions,
formulär eller UI ingår och Installation Management är inte verksamhetsklart.

## Server-side read routes

F2C7A exponerar exakt tre dynamiska `GET`-routes:
`/api/installations`, `/api/installations/[installationId]` och
`/api/installations/[installationId]/audit`. Routefilerna är tunna och anropar
endast F2C6B:s publika service genom en server-only routeadapter. De gör ingen
direkt Supabase-, repository- eller RPC-åtkomst.

Listan accepterar `pageSize`, `cursorDisplayName`, `cursorId`, `tenantId`,
`environment`, `administrativeStatus`, `includeArchived` och `search`. Audit
accepterar endast `pageSize`, `cursorOccurredAt` och `cursorId`. Cursor kräver
komplett par, boolean är exakt `true` eller `false`, duplicerade eller okända
parametrar nekas och tomma optional parametrar behandlas som frånvarande.

Successvar är exakt servicens detail- eller `{ items, hasMore, nextCursor }`-
modell. Alla svar använder `Cache-Control: private, no-store, max-age=0`;
routes är `force-dynamic` med `revalidate = 0`. Stabil servicefelmapping
returnerar endast allowlistad kod och säker text. F2C7A skapar inga mutation
routes, Server Actions eller UI.

## Mutation Server Actions

F2C7B exponerar exakt sju separata Server Actions under
`app/installations/actions.ts`: create, update, activate, pause, decommission,
archive och restore. Actions använder en injicerbar server-only action core och
anropar endast motsvarande publika F2C6B-servicefunktion.

Create-gränsen accepterar tenant, installationskod, namn, environment och fyra
nullable metadatafält. Update kräver installation-ID, expected revision och en
full målbild för namn och nullable metadata. Lifecycle-actions accepterar
endast installation-ID och expected revision. Strängar trimmas, tom nullable
metadata blir null och boundaryfel returneras med allowlistade field errors.
Actor, eventtyp, status, target status, revision-after, archivemetadata och
andra systemfält läses inte från klienten.

Varje validerat actionförsök skapar exakt ett server-side correlation-ID före
serviceanropet. Klientens correlation-ID ignoreras och exponeras inte i
actionresultatet. Resultatet är en discriminated union med installation-ID och
revision vid success eller stabil kod, säker svensk text och valfria field
errors vid failure.

F2C7B skapar inga JSON-mutationsroutes. Redirect och selektiv revalidation
skjuts till UI-steget och får senare endast köras efter `ok: true`.
