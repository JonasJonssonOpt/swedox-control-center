# Provisioning Domain Design

## Change-step: första administratör, 2026-10-06

**Beslut:** ägaren beslutade efter en genomgång av SweDox huvudsystem
(`C:\Users\Jonas\affarssystem`, endast läst) att ett eget Supabase-projekt per
kund behålls. Stegkatalog v1 får ett femte steg på position 4, före
verifieringen: `initial_administrator`, "Skapa första administratör och skicka
inbjudan".

**Underlag från SweDox:**

- SweDox har ett låst beslut om en Supabase-instans per kund (AD-001/AD-003).
  Schemat saknar kund- och företagskolumner.
- Appen binds till sitt projekt via miljövariabler, alltså en installation per kund.
- Ett inbjudningsflöde finns, men onboarding av den första administratören
  återstår.
- Row Level Security och privat Storage är inte klara. Det gör en gemensam
  databas olämplig, och den fysiska isoleringen ger den garanti ägaren kräver.

**Integrationsprincip:** SweDox säkerhetsstandard tillåter inte att kundens
service role-nyckel lämnar kundinstallationen. Därför ska Control Center
aldrig hålla kunders nycklar. Steget "första administratör" och den framtida
statuskontrollen anropar i stället ett litet, skyddat server-API i kundens
SweDox. Anropen signeras med Control Centers privata nyckel, och varje
installation verifierar med Control Centers publika nyckel. Det byggs i
SweDox-repot och analyseras i F2E6. Inga inloggningsuppgifter eller
inbjudningslänkar lagras i Control Center.

**Ordning (ägarens beslut):**

1. detta change-step
2. F2E5–F2E10
3. SweDox bootstrap- och status-API när Provisioning-UI:t närmar sig
4. Monitoring och Dashboard (F2F/F2G)

**Före första verkliga kund** ska SweDox egen Security Pass vara klar:
RLS på alla tabeller och privat Storage.

**Implementation:** migration
`20261006220000_add_provisioning_initial_administrator_step.sql`.

- Den låser alla fyra tabeller och vägrar köra om någon Provisioning-historik
  finns. Katalog v1 hade aldrig släppts, så versionen behålls som 1.
- Den byter katalog- och audit-constraints och ersätter integritetskontrollen
  med krav på fem steg.

**Verifiering:**

- 2 445/2 445 pgTAP, inklusive nya tester för katalogordning, position och
  att `run_succeeded` bara gäller verifieringen.
- Migrationens exakta preflight passerar tom historik och ger 55000 med en
  befintlig körning (transaktion som rullades tillbaka).
- Med F2E3:s gamla kontroll för fyra steg återinförd fallerar 42 tester.
- DB-lint utan fynd och ingen typdrift. 197 Node, typecheck, ESLint,
  Prettier och build passerar.

## Aktuell status: F2E4, 2026-10-06

Läsytorna är implementerade och lokalt verifierade:

- intern behörighetsfunktion `is_provisioning_owner_aal2()`
- fyra owner+AAL2-RPC:er: lista, detail med härlett inaktuellt steg, försök
  och audit
- tabellerna har fortfarande inga grants

Se [F2E4-verifieringen](PROVISIONING_READ_VERIFICATION.md): 2 442 pgTAP. Nästa steg är F2E5.

## Aktuell status: F2E3, 2026-10-06

Databasgrunden är implementerad och lokalt verifierad:

- fyra stängda tabeller med skyddstriggers
- avslut av försök exakt en gång
- deferred integritetskontroll

Se [F2E3-verifieringen](PROVISIONING_FOUNDATION_VERIFICATION.md): 2 271 pgTAP och 197 Node. Nästa steg är F2E4. Provisioning är inte
komplett.

## F2E2: beslutslås och implementationsplan, 2026-10-06

F2E2 låser den exakta 1.0-modellen utifrån F2E1:s beslut nedan. Steget är
dokumentation; inga migrationer eller kod. Standardvärden som F2E1 lämnade
öppna är markerade **(standardvärde)** och kan ändras av ägaren före F2E3.

### Huvudval

- **Tabeller:** fyra tabeller i `public` – `provisioning_runs`,
  `provisioning_run_steps`, `provisioning_step_attempts` och
  `provisioning_audit_events`. Resultatreferenserna är kolumner på körningen,
  inte en egen tabell.
- **Läsning:** endast via RPC. Inga direkta tabellgrants, inte ens SELECT.
  Det är en smalare yta än Licensing, där owner fick SELECT via policy.
- **Klienten väljer aldrig steg.** Nästa steg härleds alltid i DB.
- **Ett blockerat steg är ett lyckat anrop.** Det registrerar försöket och
  orsaken i stället för att kasta fel; annars skulle historiken rullas tillbaka.
- **Tenant dupliceras inte.** Den härleds via installationens immutable relation.

### provisioning_runs

| Fält                        | Typ         | Null/default           | Ansvar                                                      |
| --------------------------- | ----------- | ---------------------- | ----------------------------------------------------------- |
| id                          | uuid        | NOT NULL, DB-genererad | PK; immutable                                               |
| installation_id             | uuid        | NOT NULL               | FK installations(id), RESTRICT; immutable                   |
| catalog_version             | integer     | NOT NULL, 1            | Stegkatalogens version; endast 1 i 1.0                      |
| status                      | text        | NOT NULL, pending      | pending, in_progress, blocked, failed, succeeded, cancelled |
| blocked_reason              | text        | NULL                   | Satt exakt när status är blocked                            |
| result_supabase_project_ref | text        | NULL                   | Sätts en gång när steg 1 lyckas                             |
| result_hosting_region       | text        | NULL                   | Sätts en gång när steg 1 lyckas                             |
| result_application_url      | text        | NULL                   | Sätts en gång när steg 3 lyckas                             |
| revision                    | bigint      | NOT NULL, 1            | Positiv concurrencyrevision                                 |
| created_at                  | timestamptz | NOT NULL, DB-tid       | Immutable                                                   |
| created_by                  | uuid        | NOT NULL               | auth.uid(), ingen Auth-FK                                   |
| updated_at                  | timestamptz | NOT NULL, DB-tid       | Senaste mutation                                            |
| updated_by                  | uuid        | NOT NULL               | auth.uid(), ingen Auth-FK                                   |
| finished_at                 | timestamptz | NULL                   | Satt exakt när status är succeeded eller cancelled          |

**Constraints:**

- statusallowlisten och `revision > 0`
- finita tidsfält och `updated_at >= created_at`
- `blocked_reason` är satt om och endast om status är `blocked`
- `finished_at` är satt om och endast om status är terminal
- `succeeded` kräver att alla tre resultatfält är satta
- resultatfälten följer exakt samma format som Installation:
  - project ref: `^[a-z0-9]{1,64}$`
  - region: lowercase segment med bindestreck, högst 64 tecken
  - URL: absolut HTTPS, 9–2048 tecken, utan credentials, fragment eller blanksteg

**`blocked_reason`:**

- `installation_not_available`
- `tenant_not_available`
- `license_missing`
- `license_draft`
- `license_suspended`
- `license_terminated`
- `license_not_started`
- `license_expired`

**Index:**

- PK
- unikt `installation_id` där status inte är `succeeded` eller `cancelled`
  (högst en icke-avslutad körning per installation)
- `(installation_id, created_at DESC, id DESC)`
- `(created_at DESC, id DESC)` för listan

### provisioning_run_steps

| Fält          | Typ         | Null/default | Ansvar                                  |
| ------------- | ----------- | ------------ | --------------------------------------- |
| run_id        | uuid        | NOT NULL     | FK provisioning_runs(id), RESTRICT      |
| step_key      | text        | NOT NULL     | Stegnyckel enligt katalog v1            |
| position      | smallint    | NOT NULL     | 1–5, låst mot step_key                  |
| status        | text        | NOT NULL     | pending, in_progress, succeeded, failed |
| attempt_count | integer     | NOT NULL, 0  | Antal startade eller blockerade försök  |
| completed_at  | timestamptz | NULL         | Satt exakt när status är succeeded      |

Katalog v1, låst par för `step_key` och `position`:

| Position | step_key                    | Svensk etikett                                 | Resultat som krävs vid lyckat steg |
| -------- | --------------------------- | ---------------------------------------------- | ---------------------------------- |
| 1        | `supabase_project`          | Skapa Supabase-projekt                         | project ref och region             |
| 2        | `database_schema`           | Kör SweDox-migrationer                         | inga                               |
| 3        | `application_deployment`    | Deploya SweDox-app                             | application URL                    |
| 4        | `initial_administrator`     | Skapa första administratör och skicka inbjudan | inga                               |
| 5        | `installation_verification` | Verifiera installation                         | inga                               |

PK `(run_id, step_key)`; unikt `(run_id, position)`. Alla fem rader skapas
atomiskt med körningen. Stegrader är muterbara endast via RPC:erna, och
körningens revision täcker varje stegändring.

### provisioning_step_attempts

| Fält              | Typ         | Null/default           | Ansvar                                              |
| ----------------- | ----------- | ---------------------- | --------------------------------------------------- |
| id                | uuid        | NOT NULL, DB-genererad | PK                                                  |
| run_id            | uuid        | NOT NULL               | FK (run_id, step_key) → provisioning_run_steps      |
| step_key          | text        | NOT NULL               | Stegets nyckel                                      |
| attempt_number    | integer     | NOT NULL               | 1, 2, 3 … per steg, utan luckor                     |
| started_at        | timestamptz | NOT NULL, DB-tid       | Beslutstid för start eller blockering               |
| started_revision  | bigint      | NOT NULL               | Körningens revision som skapade försöket            |
| outcome           | text        | NULL                   | NULL = pågår; succeeded, failed, blocked, cancelled |
| finished_at       | timestamptz | NULL                   | Satt exakt när outcome är satt                      |
| finished_revision | bigint      | NULL                   | Satt exakt när outcome är satt                      |
| failure_category  | text        | NULL                   | Satt exakt när outcome är failed                    |
| blocked_reason    | text        | NULL                   | Satt exakt när outcome är blocked; samma allowlist  |
| note              | text        | NULL                   | Valfri operatörsnotering vid succeeded eller failed |

`failure_category`:

- `provider_error`
- `configuration_error`
- `permission_error`
- `quota_or_billing`
- `timeout`
- `verification_failed`
- `other`

**Notering:** 1–500 kodpunkter, trimmad, utan andra kontrolltecken än
radbrytning **(standardvärde)**. UI:t varnar att den inte får innehålla
hemligheter. Den visas bara i försökshistoriken, aldrig i listor, loggar eller
audit.

**Regler:**

- unikt `(run_id, step_key, attempt_number)`
- högst ett pågående försök per körning (partiellt unikt på `run_id` där
  outcome är NULL)
- ett blockerat försök skapas direkt med outcome, med samma `started_at` och
  `finished_at` och samma start- och slutrevision
- försöket är append-only med ett enda tillåtet avslut: NULL-fälten
  (outcome, slut, kategori och notering) får sättas exakt en gång. Allt annat
  är immutable, vilket en skyddstrigger verkställer. DELETE och TRUNCATE är
  blockerade.

### provisioning_audit_events

| Fält            | Typ         | Null/default            | Ansvar                                     |
| --------------- | ----------- | ----------------------- | ------------------------------------------ |
| id              | uuid        | NOT NULL, DB-genererad  | PK                                         |
| run_id          | uuid        | NOT NULL                | FK provisioning_runs(id), RESTRICT         |
| event_type      | text        | NOT NULL                | Fasta event nedan                          |
| step_key        | text        | NULL                    | Satt för stegevent, NULL för körningsevent |
| attempt_number  | integer     | NULL                    | Satt för stegevent                         |
| actor_user_id   | uuid        | NOT NULL                | auth.uid(), ingen Auth-FK                  |
| occurred_at     | timestamptz | NOT NULL, DB-tid        | Finit beslutstid                           |
| revision_before | bigint      | NULL endast vid request | Föregående revision                        |
| revision_after  | bigint      | NOT NULL                | Ny revision                                |
| correlation_id  | uuid        | NULL                    | Servergenererad korrelation                |

**Event:**

- `run_requested` – revision 1
- `step_started`
- `step_blocked`
- `step_succeeded`
- `step_failed`
- `run_succeeded` – sista steget lyckades
- `run_cancelled`

**Regler:**

- unikt `(run_id, revision_after)` och index `(run_id, occurred_at DESC, id DESC)`
- metadata-only: inga resultatvärden, noteringar, felkategorier eller payloads.
  Kategorin finns i försöket.
- append-only, RLS och FORCE RLS, noll policies och noll grants

F2E2 ersätter F2E1:s `changed_fields`-formulering. Provisioning-event
beskriver steg och försök, inte fältändringar, så `step_key` och
`attempt_number` ger mer information utan värden.

### Mutations-RPC:er

Alla är SECURITY DEFINER, ägda av postgres, med `search_path=pg_catalog`,
VOLATILE och EXECUTE endast för `authenticated`. Varje RPC gör följande, i ordning:

1. Prövar owner+AAL2 på nytt.
2. Binder actor till `auth.uid()`.
3. Låser enligt låsmodellen nedan.
4. Tar ett `clock_timestamp()` efter låsen.
5. Jämför expected revision före state.
6. Skriver exakt en auditpost.

Klienten anger aldrig actor, status, steg, revision efter, försöksnummer eller tider.

| RPC                                                          | Tillstånd                                                        | Resultat                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `request_provisioning_run(installation_id, corr)`            | Förutsättningar uppfyllda och ingen icke-avslutad körning finns  | pending, revision 1, fem pending-steg, `run_requested`                                                                   |
| `start_provisioning_step(run_id, rev, corr)`                 | pending, blocked, failed, eller in_progress utan pågående försök | Nästa ej lyckade steg startas, eller ett blockerat försök registreras; `step_started` eller `step_blocked`               |
| `complete_provisioning_step(run_id, rev, refs…, note, corr)` | Pågående försök finns                                            | Försök och steg lyckade; sista steget ger körning succeeded och `run_succeeded`, annars in_progress och `step_succeeded` |
| `fail_provisioning_step(run_id, rev, category, note, corr)`  | Pågående försök finns                                            | Försök och steg failed, körning failed, `step_failed`                                                                    |
| `cancel_provisioning_run(run_id, rev, corr)`                 | Inte terminal                                                    | Pågående försök får outcome cancelled; körning cancelled; `run_cancelled`                                                |

**Förutsättningar** gäller vid request och vid varje stegstart, inklusive
retry: installationen ska vara `planned` eller `active` och inte arkiverad,
tenanten tillgänglig och `get_license_provisioning_eligibility` ge `eligible`
i samma transaktion.

**Vid request** ger ett brott fel och ingen körning skapas. Felkoderna är
`installation_not_available`, `tenant_not_available` eller
`license_not_eligible`.

**Vid stegstart** blir det i stället ett blockerat försök. Körningen blir
`blocked`, revisionen ökar och anropet lyckas.

**Avslut och avbrott** – complete, fail och cancel – kräver inga
förutsättningar, eftersom de registrerar något som redan hänt. De får göras
även om licens eller tenant ändrats under steget.

**Resultat vid complete:**

- Steg 1 kräver giltig project ref och region.
- Steg 3 kräver giltig URL.
- Övriga steg får inte ta emot resultat (`validation_error`).

En retry som återanvänder en befintlig resurs registrerar samma värden.

### Läs-RPC:er

STABLE, owner+AAL2 före validering och uppslag. `statement_timestamp()` som
utvärderingstid, som i Licensing F2D6.

- **`list_provisioning_runs`:**
  - filter för installation, tenant och status, plus `includeClosed`
    (false som standard döljer `succeeded` och `cancelled`)
  - sortering `created_at DESC, id DESC`, keyset, 50/max 100
  - visar installationens visningsnamn, tenantens juridiska namn och nästa steg
- **`get_provisioning_run`:**
  - körningen med alla fem steg och resultatfält, samt installationens och
    tenantens namn
  - `evaluated_at` och härlett `is_stale` för pågående försök äldre än
    **24 timmar (standardvärde)**
- **`list_provisioning_step_attempts`:** körningsbunden, `started_at DESC,
id DESC`, 25/max 100. Noteringen ingår.
- **`list_provisioning_audit_events`:** körningsbunden, `occurred_at DESC,
id DESC`, 25/max 100.

Provisionings läsytor returnerar inte installationens administrativa
URL/ref/region. Sida-vid-sida-visningen hämtar dem via den befintliga
installationsservicen.

### Felmodell

P0001 med stabila meddelanden:

- `unauthorized`
- `not_found`
- `conflict`
- `invalid_state_transition`
- `installation_not_available`
- `tenant_not_available`
- `license_not_eligible`
- `duplicate_run`
- `audit_failure`

Övriga:

- 22023 `validation_error`
- 23514 för integritetsbrott, som maskeras som `unexpected_error` i serverlagret

`blocked` är ett resultat, inte ett fel.

### Låsmodell

Varje mutation låser i ordningen Installation → Tenant → körning:

1. Installation `FOR KEY SHARE`, slås upp via körningen utan lås för befintliga
   körningar.
2. Tenant `FOR KEY SHARE`.
3. Körning `FOR NO KEY UPDATE`.

Detta är samma ordning som Installation-mutationerna, som låser installationen
`FOR UPDATE` och sedan tenanten `FOR KEY SHARE`. Därför uppstår ingen
deadlockcykel.

- **Mot Installation-mutationer:** `FOR KEY SHARE` på installationen
  serialiserar mot dem, så en samtidig arkivering eller avveckling ses
  korrekt vid stegstart.
- **Mot Tenant-mutationer:** de låser tenanten `FOR UPDATE`, vilket
  serialiseras på samma sätt.
- **Licensen låses inte:** eligibility är ingen reservation.
- **Dubbla körningar:** en request-kollision ger `duplicate_run` via det
  partiella unika indexet.

### Integritet (F2E3)

En deferred constraint-trigger kontrollerar vid commit, som F2D4 i Licensing:

- `revision` är lika med antalet auditposter, i en sammanhängande kedja 1…n
- exakt fem steg finns enligt katalogen
- försöksnumren är sammanhängande och `attempt_count` stämmer
- högst ett pågående försök finns, och dess steg är `in_progress`
- stegordningen respekteras: inget steg lyckat före ett tidigare
- körningens status stämmer med stegen och det senaste försöket
- resultatfälten är satta exakt när motsvarande steg lyckats

Brott ger 23514.

### Säkerhet och grants

- RLS och FORCE RLS på alla fyra tabeller.
- Inga grants till PUBLIC, anon, authenticated eller service_role, och inga
  policies.
- En ny hjälpfunktion, `is_provisioning_owner_aal2()`, med samma predikat som
  Licensings, så att domänerna förblir oberoende.
- Elva nekade claimformer, saknad singleton, anon och service_role testas per
  RPC. Signerade tokens mot Data API ingår i F2E10.

### Testplan per steg

| Steg  | Bevis                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2E3  | Katalog, constraints, index, append-only, slutvillkor för försök, deferred integritet med mutationsprober, stängda grants                                                       |
| F2E4  | Läs-RPC:er, keyset, filter, `is_stale`, säkerhetsmatris                                                                                                                         |
| F2E5  | Alla övergångar och nekade övergångar, blockerade försök för varje orsak, licensomprövning, idempotens, riktiga parallella transaktioner mot Installation, Tenant och Licensing |
| F2E6  | Provider-abstraktion och `manual`-adapter, server-only, inga nätverksanrop                                                                                                      |
| F2E7  | Inaktuella steg, halvgjorda steg (retry med samma referens), avbrott under pågående försök                                                                                      |
| F2E8  | Service, mapper och actions enligt Licensing F2D7, inklusive fältfel per steg                                                                                                   |
| F2E9  | UI: lista, detail, stegvisning, start, registrera utfall, retry, avbryt, historik, sida-vid-sida med Installation                                                               |
| F2E10 | Security Pass, signerade tokens, manuell webbläsarkontroll, slutregression                                                                                                      |

### Inte i 1.0

- provider-API-anrop och bakgrundskörning
- deprovisioning och synk till Installation
- att hoppa över steg
- byte av katalogversion
- retention och export

F2E2 classification: READY FOR DATABASE FOUNDATION (F2E3)

## F2E1: domänanalys och låsta beslut, 2026-10-06

Vid konflikt gäller F2E2 ovan. F2E1 är ett analys- och beslutssteg. Inga migrationer, ingen kod, inga routes
och ingen UI ingår. Tabeller, statuskoder, felmodell och idempotensnycklar låses
i detalj i F2E2. Användaren fattade fyra produktbeslut 2026-10-06:

| Fråga                     | Beslut                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Omfattning i 1.0          | Spårad runbook: fasta steg som owner utför och registrerar, med licenskontroll vid start     |
| Resultat mot Installation | Provisioning lagrar egna resultatreferenser. Installation återöppnas inte.                   |
| Körning                   | Owner-drivna steg. Ingen bakgrundsprocess, kö, cron eller polling i 1.0.                     |
| Provider-hemligheter      | Endast som server-only miljövariabler i Control Centers hosting, aldrig i DB/Git/logg/klient |

### Varför eget Supabase-projekt per kundinstallation

Bindande beslut i [Projektbeslut](PROJECT_DECISIONS.md) ("Systemgräns"),
bekräftat i F2E1. Det ger fysisk isolering av kunddata, auth och backup;
region, restore, export och avveckling per kund; begränsad skada vid fel; och
ingen kunddata eller generell databasåtkomst i Control Center. Kostnaden är
compute per projekt och flera projekt att migrera och övervaka. En gemensam
multi-tenant-databas vore ett beslut om SweDox huvudsystem och ändrar inte
denna analys.

## Repository truth

- Tenant och Installation är stängda. Licensing är stängd och publicerar
  `get_license_provisioning_eligibility`, som uttryckligen inte är en
  reservation; Provisioning ska ompröva den vid faktisk start.
- Installationens `supabase_project_ref`, `application_url` och
  `hosting_region` är nullable administrativ metadata (F2C9A). Aktiv
  installation betyder inte provisionerad eller frisk.
- Appen är Next.js utan bakgrundsprocess. Alla skyddade operationer kör
  owner + MFA/AAL2 + equality på servern och använder RPC:er med DB-AAL2.
- Ingen providerintegration, inga provider-hemligheter och ingen
  Provisioning-tabell finns.

## Ansvar och ownership

Provisioning **äger**:

- provisioneringskörningar per installation, deras steg och försök
- egna resultatreferenser: Supabase project ref, region och application URL
  som provisioneringen tog fram
- operatörsregistrerade utfall och stängda felkategorier
- sin egen append-only metadata-audit

Provisioning **äger inte**:

- installationens administrativa fält eller status, tenant eller licens
- installerad SweDox-version och deploystatus över tid (framtida
  deployment-domän)
- hälsa, tillgänglighet, incidenter och larm (Monitoring)
- kunddata, kunddatabaser eller kunders credentials

## Konsumerade kontrakt

- **Installation** (läses i DB, aldrig skrivs): `id`, `tenant_id`,
  `environment`, `administrative_status` och `archived_at`. Provisioning får
  starta och driva steg endast för en installation som är `planned` eller
  `active` och inte arkiverad. Paused, decommissioned och arkiverad blockerar.
  Varje utökning av listan kräver ett change-step.
- **Tenant**: endast tillgänglighet (`operational_status = active` och inte
  arkiverad), härledd via installationens immutable tenantrelation.
- **Licensing**: `get_license_provisioning_eligibility(tenant_id,
installation_id)`. `eligible` krävs. Alla andra orsaker, och
  `technical_read_error` i serverlagret, blockerar. Eligibility dupliceras
  aldrig och lagras inte som sanning; endast orsakskoden vid ett blockerat
  försök sparas som historik.

Provisioning skriver aldrig Tenant, Installation eller Licensing.

## Modell: körning, steg och försök

En **körning** (run) är ett provisioneringsjobb för exakt en installation.
Relationen är immutable. En installation kan ha många körningar över tid men
högst en icke-avslutad samtidigt.

Körningen har en fast, versionerad **stegkatalog** (v1), som utförs i ordning:

| #   | Steg                   | Resultatreferens som får registreras |
| --- | ---------------------- | ------------------------------------ |
| 1   | Skapa Supabase-projekt | project ref, hosting region          |
| 2   | Kör SweDox-migrationer | ingen                                |
| 3   | Deploya SweDox-app     | application URL                      |
| 4   | Verifiera installation | ingen                                |

Steg 4 är operatörens intygande att appen svarar och att inloggningen fungerar
vid provisioneringstillfället. Det är inte hälsa och ersätter inte Monitoring.

Varje start av ett steg skapar ett **försök** (attempt) med löpnummer, start,
slut, utfall och, vid fel, en stängd felkategori. Försök är append-only.
Fritext begränsas i F2E2 till en kort, valfri operatörsnotering som uttryckligen
inte får innehålla hemligheter; UI:t varnar.

## State machine

Körning:

| Status        | Betydelse                                                         | Nästa                                         |
| ------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| `pending`     | Begärd, inget steg startat                                        | `in_progress`, `cancelled`                    |
| `in_progress` | Ett steg pågår eller nästa steg kan startas                       | `succeeded`, `failed`, `blocked`, `cancelled` |
| `blocked`     | Förutsättning saknas vid stegstart (licens, tenant, installation) | `in_progress`, `cancelled`                    |
| `failed`      | Senaste försöket misslyckades; manuell retry möjlig               | `in_progress`, `cancelled`                    |
| `succeeded`   | Alla steg klara. Terminal.                                        | inga                                          |
| `cancelled`   | Avbruten av owner. Terminal.                                      | inga                                          |

Steg: `pending` → `in_progress` → `succeeded` eller `failed`. Ett misslyckat
steg kan startas igen, vilket ger ett nytt försök. Steg n+1 kan bara startas när
steg n har lyckats. Inga steg hoppas över i v1.

Avbrott river aldrig resurser. Deprovisioning ingår inte i 1.0; registrerade
referenser bevaras som historik.

## Licens- och förutsättningskontroll

Före varje stegstart, inklusive retry, och när en körning begärs:

1. installationen är `planned` eller `active` och inte arkiverad
2. tenanten är tillgänglig
3. licensen är `eligible` vid DB-tid i samma transaktion

Om något inte är uppfyllt startas inget steg. Körningen blir `blocked` med
orsakskod och ett blockerat försök registreras, så att historiken visar varför.
Efter åtgärd i rätt domän kan owner försöka igen. Ett redan påbörjat steg
avbryts inte retroaktivt om licensen ändras under steget, eftersom
eligibility inte är en reservation. Nästa steg prövas på nytt.

## Retry, avstämning och inaktuella jobb

- **Ingen automatisk retry.** Retry är alltid en uttrycklig owner-åtgärd med
  expected revision.
- **Avstämning (reconciliation)** i 1.0 betyder att owner registrerar faktiskt
  utfall för ett pågående steg utifrån vad som syns hos providern. Exempel:
  projektet skapades trots att webbläsaren tappade svaret, så steget markeras
  lyckat med referens. Ingen polling sker.
- **Inaktuellt steg:** ett steg som varit `in_progress` längre än en tröskel
  (låses i F2E2) visas som inaktuellt i UI:t. Det är härlett och lagras inte.
  Owner avgör utfallet.
- **Halvgjorda steg:** om en resurs finns men steget registrerades som
  misslyckat ska retry återanvända den befintliga resursen och registrera dess
  referens. Ett nytt projekt skapas inte. Runbooken säger detta uttryckligen.

## Provider boundary och framtida automation

- **Server-only abstraktion:** en provider-abstraktion införs i F2E6 med ett
  enda adapter i 1.0, `manual`. Den utför inga nätverksanrop. Den översätter
  bara operatörens registrering till domänhändelser.
- **Senare automation:** en adapter som till exempel Supabase Management API
  kräver ett eget analyserat change-step. Då gäller följande:
  - hemligheten ligger endast i hostingens server-only miljövariabler
  - varje försök har en deterministisk idempotensnyckel som skickas till providern
  - körningen är fortsatt owner-driven, eller får en separat analyserad
    maskinidentitet om bakgrundskörning införs
- **UI:** UI:t och klienten anropar aldrig en provider direkt.

## Secret boundary

Följande lagras aldrig i Control Center:

- kundprojektens databaslösenord, service role keys, JWT-hemligheter och
  anslutningssträngar
- provider-tokens och deploy-tokens

Provisioning lagrar endast identifierare: project ref, region, URL och ett
eventuellt referensnamn för en framtida hemlighet, aldrig värdet. Owner
förvarar kundprojektens credentials utanför Control Center, i sin egen
lösenordshanterare. Loggar får endast innehålla kategori, tid och correlation.

## Relationer

- **Installation:** Provisioning visar sina resultatreferenser bredvid
  installationens administrativa fält och markerar skillnader, men skriver dem
  aldrig. Owner uppdaterar installationen via dess befintliga edit-flöde om så
  önskas.
- **Licensing:** endast via eligibility-kontraktet, som omprövas vid varje
  stegstart.
- **Monitoring:** får läsa publicerade Provisioning-reads (körningens status
  och resultatreferenser). `succeeded` betyder bara att provisioneringen
  genomförts, inte att systemet är friskt. Provisioning skapar inga larm.
- **Dashboard:** endast via framtida modulägd summary-read.

## Audit

Egen append-only `provisioning_audit_events`, metadata-only, med samma mönster
som Licensing:

- revisionskedja per körning, actor från `auth.uid()` och valfri
  servergenererad correlation
- `changed_fields` i kanonisk ordning
- RLS och FORCE RLS, noll policies och läsning endast via en körningsbunden
  paginerad RPC

Försök och steg är i sig historik; audit beskriver vem som gjorde vad och när.

## Concurrency och idempotens

- **Låsordning för varje Provisioning-mutation:** Installation → Tenant →
  körning. Installation och Tenant låses `FOR KEY SHARE`, i samma ordning som
  Installation-mutationerna, och körningen `FOR NO KEY UPDATE`. Den slutliga
  lås-modellen och deadlocktester låses i F2E2 och verifieras med riktiga
  parallella transaktioner i F2E5.
- **Expected revision** på körningen för varje owner-åtgärd. En gammal flik får
  `conflict` och ingen automatisk retry.
- **Partiellt unikt index:** högst en icke-avslutad körning per installation,
  så dubbla begäranden ger `duplicate_run`.
- **Försöksnummer** är unika per steg. Samma stegstart två gånger parallellt
  serialiseras, och den andra får `conflict`.
- **Tidsstämplar:** ett `clock_timestamp()` tas efter låsen per mutation, som i
  Licensing.

## Säkerhet

Samma modell som Licensing:

- Owner + MFA/AAL2 + equality i appen, och DB-AAL2 i varje RPC och policy.
- SECURITY DEFINER-RPC:er med `pg_catalog`, EXECUTE endast för `authenticated`.
- Inga direkta writes och audit stängd.
- Signerade tokentester mot Data API i F2E10.

## Risker

| Risk                                           | Kontroll                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Provisionering startas utan giltig licens      | Eligibility i samma transaktion vid varje stegstart                 |
| Dubbla körningar eller dubbla projekt          | Partiellt unikt index, expected revision, retry återanvänder resurs |
| `succeeded` tolkas som frisk installation      | Uttrycklig text; hälsa ägs av Monitoring                            |
| Hemligheter i fritext eller loggar             | Ingen hemlighetslagring, kort notering med varning, loggpolicy      |
| Avvikelse mellan Installation och Provisioning | Sida-vid-sida-visning och markering; ingen tyst synk                |
| Inaktuella pågående steg                       | Härledd markering och avstämning av owner                           |
| Framtida automation öppnar stor attackyta      | Kräver eget change-step; endast serverhemligheter                   |

## 1.0-scope

- **Ingår:** körningar, stegkatalog v1, försök, owner-drivna övergångar,
  retry, avbrott, avstämning, resultatreferenser, licens- och
  förutsättningskontroll, audit, läsytor och UI.
- **Ingår inte:**
  - provider-API-anrop och bakgrundskörning
  - deprovisioning och automatisk synk till Installation
  - versions- och deployhistorik över tid
  - hälsa och larm
  - kundadministration i kundprojekt

## Efterföljande steg

1. **F2E2 Decision Lock / Implementation Plan:**
   - tabeller och kolumner
   - statuskoder och felkategorier
   - felmodell (inklusive `duplicate_run` och `blocked`-orsaker)
   - inaktualitetströskel och noteringsgränser
   - exakt låsmodell
2. **F2E3 Database Foundation:** körningar, steg, försök och audit med stängda
   grants och integritet.
3. **F2E4 Owner Read / Security.**
4. **F2E5 Mutations / State Machine:** begär, starta steg, registrera utfall,
   retry, avbryt och avstäm. Inkluderar licensomprövning och concurrency.
5. **F2E6 Provider Layer:** abstraktion och `manual`-adapter.
6. **F2E7 Reconciliation / Failure Handling:** inaktuella steg, halvgjorda
   steg, terminala fel.
7. **F2E8 DAL/API/Actions** och **F2E9 UI**: status, senaste försök,
   felorsak, start, retry, historik och relation till tenant/installation.
8. **F2E10 Runtime / Security Closure:** inklusive signerade tokens,
   licensomprövning, concurrency och manuell webbläsarkontroll.

F2E1 classification: READY FOR DECISION LOCK (F2E2)
