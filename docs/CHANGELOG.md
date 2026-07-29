# Changelog

## 2026-07-28

- Implementerade F2C7A:s tre dynamiska `GET`-routes för paginerad
  installationslista, installationdetail och installationbunden audit. Routes
  anropar endast F2C6B-servicen och returnerar dess DTO:er utan extra metadata.
- Lade till en server-only routeadapter med explicit query parsing, kompletta
  cursorpar, strikt boolean, nekade dubbletter/okända parametrar, stabil
  servicefel-till-HTTP-mapping och bevarad Next.js control flow.
- Samtliga svar använder `private, no-store, max-age=0`. Lade till
  routekontraktstest för inventering, arkitektur, querytransport, list/detail/
  audit, samtliga servicefel och frånvaro av mutation endpoints, direkt
  Supabaseåtkomst och cross-request cache. Inga actions eller UI infördes.

- Implementerade F2C6B:s strikt server-only installations-DAL/service med tio
  publika operationer, ownerguard före repository, request-lokal Supabase SSR,
  central runtimevalidering/mapping och stabil maskerad felmodell.
- Separerade paginerad list-DTO från detail: listan innehåller tenant legal name
  och host-only application host men aldrig full URL, project ref eller
  administrativ notering. Detail inkluderar skyddsvärd metadata men inga
  actor-UUID:n; cross-installation auditoutput nekas fail-closed.
- Kapslade list/detail/audit och samtliga sju mutationer utan direkta writes,
  retry, Service Role, browserklient, routes, actions eller UI. Lade till
  kontraktstest för arkitektur, mapping, validering, pagination,
  repositoryanrop, guard/SSR-gräns, mutationer och stabila fel.

- Implementerade F2C6A:s ownerkontrollerade `list_installations` med
  standardsida 50, max 100 och stabil cursor på display name/UUID i stigande
  ordning.
- Låste tenant-, environment-, status- och archivefilter samt case-insensitive
  bokstavlig sökning enbart i display name och installation code. Tenant legal
  name och application host är medvetet inte sökbara. Cursor valideras mot
  samma filterkontext och sidor är dubblettfria.
- Begränsade output till listmetadata, tenantens legal name och härledd
  application host. Full URL, project ref och intern notering exponeras inte;
  inga direkta tabellgrants, nya index, DAL, routes eller UI infördes.

- Implementerade F2C5:s ownerkontrollerade
  `list_installation_audit_events` med obligatoriskt installation-ID,
  standardsida 25 och stabil timestamp/UUID-cursor i newest-first-ordning.
- RPC:n returnerar endast nio auditmetadatafält och pagineringsstatus. Verifierade
  owner/non-owner/null auth, installationbunden cursor, sidstorlek, sortering och
  dubblettfria sidor.
- Audittabellens FORCE RLS, noll policies och noll direkta grants är oförändrade.
  Ingen DAL, route, UI, sökning, export, retention eller backup infördes.

- Implementerade F2C4:s sju separata installations-RPC:er för create, update,
  activate, pause, decommission, archive och restore. Varje funktion omprövar
  ownern, binder actor, låser raden och använder expected revision.
- Låste tenant availability till active och icke arkiverad tenant, planned
  activation till komplett URL/project ref/region, decommission som terminalt,
  archive efter decommission och restore som enbart återställd synlighet.
- Integrerade exakt en metadata-only auditpost per lyckad mutation i samma
  transaktion. Auditkollision verifierar `audit_failure` och full rollback.
  Direkta writes, writepolicies, Service Role och audit-read förblir utanför
  steget.

- Implementerade F2C3:s separata `installation_audit_events` med exakt nio
  metadatafält, sju installationsägda event, strikt revisionskedja och unik
  auditpost per installationsrevision.
- Låste `changed_fields` till installationens 17 kolumnnamn i canonical ordning
  utan värden, snapshots, JSON eller payloads. Tenantrelation härleds via
  installation-FK med delete restrict och actor saknar Auth-FK.
- Införde append-only-trigger, RLS, FORCE RLS, noll policies och noll direkta
  API-rollgrants. Lade till pgTAP för struktur, events, revisioner, arrays,
  relationer, actorlivscykel, append-only, grants och index; ingen audit
  read/write-API skapades.

- Implementerade F2C2:s owner-only installationsläsning med RLS, FORCE RLS,
  endast SELECT för `authenticated` och exakt en policy som återanvänder
  `public.is_control_center_owner()`. Inga writepolicies eller verksamhetsreads
  infördes.
- Verifierade fail-closed vid non-owner, null auth, saknad singleton och
  mismatch. Owner kan läsa alla statusar, arkiverade installationer och
  installationer hos arkiverade tenants; policyn gör ingen tenantjoin.
- Lade till pgTAP för policystruktur, exakta grants, historisk owner-read och
  nekade writes. Lokal `service_role` har BYPASSRLS men saknar explicit
  installationsgrant och ingår inte i appflödet.

- Implementerade F2C1:s isolerade installationsdatabasgrund med exakt 17
  kolumner, obligatorisk tenant-FK med delete restrict, fyra låsta environments,
  administrativ status, positiv revision och separat archivemetadata.
- Låste canonical installation code, säker HTTPS-metadata, skyddsvärd och
  partiellt unik Supabase project ref samt endast fem motiverade index inklusive
  primärnyckeln. Installerad appversion, secrets, provisioning-, deployment- och
  healthstatus ingår inte.
- Återkallade alla tabellprivilegier från `PUBLIC`, `anon`, `authenticated` och
  `service_role`. F2C1 lämnar avsiktligt RLS/FORCE RLS av och skapar inga
  policies; F2C2 ansvarar för owner-only read. Lade till heltäckande pgTAP och
  låste designen i `INSTALLATION_DATABASE_DESIGN.md`.

- Implementerade F2A:s permanenta Control Center-shell med vänstermeny,
  toppheader och konsekvent huvudområde. Tenantvyer återanvänder ramen utan
  duplicerad global markup eller ändrad tenantlogik.
- Låste modulordningen till Dashboard, Tenants, Installations, Licenses,
  Provisioning, Monitoring och Settings. Endast Tenants är länkad och aktivt
  textmarkerad; övriga visas icke-interaktivt som `Kommer senare` utan routes.
- Root `/` redirectar nu till `/tenants`. Lade till fem kontraktstest för
  informationsarkitektur, landmarks, fokus/`aria-current`, dead-navigation och
  frånvaro av placeholder-sidor.

- Rättade den tomma MFA-enrollmentvyn. Rotorsaken var att initialt null-state
  endast renderade en ensam startknapp och att `mfa.enroll()` inte kördes förrän
  efter manuell submit. Enrollment initieras nu server-side och sidan har alltid
  loading, ready eller lokalt fel.
- Visar Supabase-returnerad QR-kod och manuell setup secret, återhämtar refresh
  genom kontrollerad cleanup av overifierad factor och skapar inte ny factor när
  en verifierad redan finns.
- Kräver challenge, verify och explicit `currentLevel = aal2` före fast redirect
  till `/tenants`. Lade till sex beteende-/arkitekturtest; manuell Microsoft
  Authenticator-verifiering kvarstår.

- Implementerade F1:s postgres-only owner-bootstrap i ett icke-exponerat
  `private`-schema samt en explicit local-only CLI med targetkontroll,
  UUID-validering och bekräftelse. Ingen ownerdata ligger i migration eller Git.
- Bootstrap verifierar existerande Auth-user, låser singletonen, är idempotent
  för samma owner och nekar mismatch utan takeover. Inga HTTP-, UI-,
  Service Role-, signup- eller owner-switchvägar infördes.
- Lade till 23 pgTAP-kontrakt för bootstrap/integritet och fyra Node-kontrakt
  för CLI/input/säkerhetsarkitektur. Lokal och productionmässig runbook,
  change-record och incidentprocess dokumenterades.

- Implementerade E8D:s metadata-only `Händelsehistorik` direkt på
  `/tenants/[tenantId]`, även för arkiverade tenants. Initiala 25 poster hämtas
  direkt via tenantservicen och nästa sidor endast via E7A:s audit-route.
- Lade till svenska event- och changed-field-labels, svensk datumformatering,
  `Verifierad owner`, begriplig revision, tomläge, pending och lokalt maskerat
  load-more-fel. Actor-UUID, audit-ID, correlation-ID och verksamhetsvärden
  renderas inte.
- Verifierade cursorpayload, tenantisolering, ordning och dubbletter före append.
  Ingen total count, filtrering, export, retention, backup eller
  databasförändring infördes. Lade till åtta E8D-kontraktstest.

## 2026-07-27

- Implementerade E8C:s state-specifika pause-, activate-, archive- och
  restore-kontroller på tenantdetail ovanpå E7B-actions. Varje kontroll bär
  tenant-ID och expected revision men inget klientstyrt target status.
- Lade till proportionerliga native dialogs för samtliga operationer. Archive
  är tydligt separerad och beskriver att tenant lämnar listan utan fysisk
  radering; restore beskriver återgång till active.
- Livscykelsuccess revaliderar endast lista/detail och serverredirectar till
  färsk detail. Conflict/invalid state stannar i dialogen. Lade till nio
  lifecycle-kontraktstest; ingen audit history infördes.

- Implementerade E8B:s createform på `/tenants/new` och editform på
  `/tenants/[tenantId]/edit` med en minimal Client Component ovanpå E7B:s
  create/update-actions. List/detail har nu fungerande create/edit-länkar.
- Utökade actionresultatet bakåtkompatibelt med allowlistade field errors,
  server-side fältmappning och särskild conflict-hantering. Formvärden bevaras,
  fel kopplas till fält och submit blockeras under pending.
- Efter lyckad create/update revalideras endast `/tenants` och relevant detail
  innan serverredirect till detail. Arkiverad tenant saknar edit-submit. Inga
  livscykelkontroller eller audit history infördes.

- Implementerade E8A:s owner-skyddade tenantlista på `/tenants` och tenantdetail
  på `/tenants/[tenantId]` som dynamiska Server Components med direkt
  tenantserviceåtkomst och utan intern HTTP eller klienthämtning.
- Lade till kompakt semantisk tabell, sektionerad detail, svensk presentation,
  `StatusText` utan badges, arkiveringstext, neutralt tomläge samt loading-,
  not-found- och maskerad error-vy. Actor-UUID exponeras inte.
- Lade till sju UI-kontraktstest. Inga create/edit-formulär,
  livscykelkontroller, mutation submissions eller audit history infördes.

- Implementerade E7B:s sex separata tenant Server Actions för create, update,
  pause, activate, archive och restore. Actions använder endast E6-servicen och
  ärver ownerintegritet, AAL2, SSR, RLS och atomisk audit genom den.
- Lade till en injicerbar action-core med strikt FormData-normalisering,
  servergenererat correlation-ID och ett stabilt resultatkontrakt. Klientstyrda
  systemfält, actor, event, revision-after och target status vidarebefordras inte.
- Låste Next Server Actions same-origin/origin-skydd som CSRF-gräns. Inga
  mutation route handlers, redirects eller revalidations infördes eftersom
  framtida UI-paths ännu inte är låsta. Lade till åtta actionkontraktstest.

- Implementerade E7A:s tre dynamiska, server-only JSON `GET`-routes för
  tenantlista, tenantdetail och tenant-audit. Routes anropar endast E6-servicen,
  returnerar dess typade modeller och har explicit `private, no-store`.
- Låste audittransporten till valfri `pageSize` och ett valfritt komplett
  `cursorOccurredAt`/`cursorId`-par. Servicefel mappas till stabila HTTP-statusar
  och JSON-koder utan råa DB-, auth- eller implementationsdetaljer.
- Lade till sju routekontraktstest för arkitektur, list/detail/audit,
  felmapping, cursorvalidering och request-lokal exekvering. Inga mutationsvägar
  eller färdigt UI infördes.

- Implementerade E6:s strikt server-only tenant-DAL och servicelager ovanpå
  cookie-baserad Supabase SSR. Alla nio publika operationer anropar
  `requireOwnerIntegrity()` innan repositoryåtkomst; ingen Service Role,
  browserklient, route, server action eller UI infördes.
- Låste camelCase-applikationstyper, input- och outputvalidering, exakt
  DB/RPC-mapping samt typade servicefel. Okända databasfel och felaktiga
  DB-svar stoppas som `unexpected_error` med metadata-only loggning.
- Kapslade owner-only tenantlista, tenantdetail inklusive arkiverad tenant, sex
  atomiska mutations-RPC:er och auditpagination som
  `{ items, hasMore, nextCursor }`. Lade till kontraktstester för servergräns,
  guard, reads, mutationer, mapping, validering, fel och cross-tenant-skydd.

## 2026-07-24

- Implementerade E5:s `list_tenant_audit_events` med ownerkontroll, obligatoriskt
  tenant-scope och stabil cursorpagination på `occurred_at DESC, id DESC`.
- Låste default page size 50, maximum 100, tenantbunden typad cursor och ett
  strikt returkontrakt utan verksamhetsfält, total count eller spekulativa filter.
  Direkt audit-SELECT och auditpolicies förblir blockerade.
- Lade till 42 pgTAP-kontroller för metadata, grants, ownerkontroll,
  cross-tenant-isolering, sortering, flersidig pagination, cursorvalidering och
  fortsatt stängd tabellåtkomst; 383 pgTAP-tester passerar totalt.

- Implementerade E4:s sex ownerkontrollerade `SECURITY DEFINER`-mutationer för
  create, update, pause, activate, archive och restore med actor-binding,
  radlåsning, optimistic concurrency och kategoriska, icke-läckande fel.
- Kopplade varje lyckad mutation atomiskt till exakt ett append-only
  tenant-audit-event. Tenantändring rollbackar vid auditfel och misslyckad
  tenantändring skapar ingen audit.
- Lade till 79 pgTAP-kontroller för funktionskontrakt, grants, ownerkontroll,
  create/update/livscykel, concurrency, atomicitet och fortsatt nekad direkt
  tabellskrivning; 341 pgTAP-tester passerar totalt.

- Implementerade E3:s tenantspecifika append-only auditgrund med nio låsta
  kolumner, sex eventtyper, tenant-FK med delete restrict, revisionsunikhet,
  metadata-only changed-fields, kronologiskt tenantindex och blockerad
  UPDATE/DELETE.
- Aktiverade RLS och FORCE RLS på `tenant_audit_events` utan policies eller
  API-rollgrants. Ingen publik write/read-funktion och inga tenantmutationer
  infördes.
- Lade till 71 pgTAP-kontroller för struktur, eventtyper, revisioner, FK,
  actorhistorik, payloadkontrakt, append-only, grants och RLS; 262 pgTAP-tester
  passerar totalt.

- Implementerade E2:s avgränsade tenantåtkomstlager: RLS och FORCE RLS,
  minimalt SELECT-grant för `authenticated`, en owner-only SELECT-policy och den
  booleska fail-closed-helpern `public.is_control_center_owner()`.
- Lade till separata pgTAP-bevis för policystruktur, grants, helperkontrakt,
  owner/non-owner/unauthenticated, aktiva och arkiverade tenants samt fortsatt
  nekad direkt skrivning. Ingen bootstrap, audit, mutation, DAL, route eller UI
  infördes. Två rena resetkörningar, 191 pgTAP-tester, databaslint och
  deterministisk typgenerering verifierades lokalt.

- Implementerade E1:s tenantdatabasgrund enligt det låsta Steg C-kontraktet:
  `public.tenants`, 17 kolumner, namngivna constraints, canonical
  organisationsnummer, Luhnvalidator och två motiverade index.
- Lade till 70 pgTAP-tester för tenantstruktur, giltiga och ogiltiga värden,
  unikhet efter arkivering, validator, index och fail-closed grants. RLS, audit,
  mutationer och applikationsfunktionalitet infördes inte.
- Implementerade den server-only `requireOwnerIntegrity()` ovanpå befintlig
  owner-/AAL2-guard med environmentvalidering, allowlistad DB-RPC och fail-closed
  felmappning.
- Lade till dependency-fria Node-tester för environment, auth/RPC-ordning,
  resultatallowlist, informationsminimering, säker loggmetadata och frånvaro av
  cross-request cache.
- Implementerade `get_owner_integrity_status()` med kategorisk textretur,
  SECURITY DEFINER, fast search path och minimerade execute-grants.
- Lade till lokala pgTAP-bevis för JWT-kontext, owner/mismatch/missing/
  unauthenticated, informationsminimering och fortsatt nekad tabellåtkomst.
- Implementerade den första migrationen för `public.control_center_owner` med
  konstant singletonnyckel, Auth-FK, FORCE RLS och nekad normal tabellåtkomst.
- Lade till 43 godkända pgTAP-kontroller för struktur, constraints, FK, ägarskap,
  RLS och grants samt genererade deterministiska databastyper.
- Genomförde Steg C:s kodfria Security Pass för Tenant Management.
- Låste design för owner-singleton, equality, tenantdata, RLS, atomiska
  mutationer, beständig audit, tester, migrationsordning, DAL, fel och recovery.
- Inget verksamhetsschema, ingen migration och ingen tenantkod implementerades.

Alla betydande förändringar i projektet kommer att dokumenteras i denna fil.

Formatet baseras på [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) och projektet följer [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Låst autentiseringsmodellen för version 1 till ett internt `owner`-konto med e-post och lösenord via Supabase Auth, obligatorisk TOTP-MFA och serverhanterade PKCE-sessioner.
- Avgränsat användaradministration, invitationer, SSO och ytterligare roller till en möjlig framtida utbyggnad.
- Dokumenterat manuell recovery via Supabase samt förbud mot självregistrering, SMS-MFA och egna recovery codes.
- Etablerat repositorystruktur och dokumentationsstandard för framtida Supabase-migrationer, owner-bootstrap och databas-recovery utan att införa databas- eller tenantschema.
- Infört en versionspinnad lokal Supabase CLI-miljö med local-only scripts, tom migrationsverifiering, databaslint, pgTAP-smoketest, typgenerering och CI-grund.
