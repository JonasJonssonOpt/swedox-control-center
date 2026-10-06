# Licensing Mutation Verification

## F2D5C: Terms och renewal, lokalt verifierad 2026-10-06

Baseline är HEAD `2ece7ae` plus ocommittad F2D5B och granskningsfynd. Inget
har stageats, committats eller pushats. Med F2D5C är samtliga sex mutationer
från F2D1B implementerade: **F2D5 är komplett på databasnivå.** Licensing som
helhet är inte komplett; F2D6–F2D9 återstår.

Migration: `20261006140000_create_license_terms_mutations.sql`.

```sql
public.change_license_terms(p_license_id uuid, p_expected_revision bigint, p_plan_key text,
  p_valid_from timestamptz default null, p_valid_until timestamptz default null,
  p_correlation_id uuid default null) returns public.licenses
public.renew_license(p_license_id uuid, p_expected_revision bigint, p_valid_until timestamptz,
  p_correlation_id uuid default null) returns public.licenses
```

### Kontrakt

Båda kräver owner+AAL2, låser Tenant → License, fångar ett `clock_timestamp()`
efter låsen, jämför expected revision före state och kräver tillgänglig Tenant
(även vid nedgradering). Lyckat anrop ger revision +1, terms version +1, exakt
en ny terms-rad vid samma revision och exakt en auditpost. Status ändras aldrig.

`change_license_terms` (draft, active, suspended → `license_terms_changed`):

- **Draft** ersätter hela målbilden med create-reglerna: NULL start = beslutstid,
  explicit start måste vara minst beslutstiden, NULL slut = Tills vidare,
  satt slut strikt efter start.
- **Active/suspended** byter endast plan. Start och slut bevaras; att skicka
  datum ger `validation_error` eftersom datumändring sker via renewal.
- Planen härleds alltid från katalogen (`mini/standard/stor`, version 1).
  Oförändrad målbild ger `validation_error` utan revision/audit.

`renew_license` (active, suspended → `license_renewed`, samma plansnapshot):

- `p_valid_until` NULL betyder Tills vidare och måste anges uttryckligen.
- **Ej utgånget** intervall (beslutstid < slut): start bevaras, nytt slut måste
  vara senare än nuvarande eller NULL. Lika eller kortare ger `validation_error`.
- **Utgånget** intervall: ny period börjar vid beslutstiden; nytt slut måste
  vara senare än den eller NULL. Tidigare version bevarar avbrottet.
- Tills vidare-licens kan inte förnyas: `invalid_state_transition`.
- Draft (använd terms change) och terminated nekas med `invalid_state_transition`.

`changed_fields` innehåller endast faktiskt ändrade fält i kanonisk ordning,
till exempel `{revision,current_terms_version,plan_key,plan_display_label,max_active_users,updated_at,updated_by}`
för planbyte på aktiv licens och `{revision,current_terms_version,valid_until,updated_at,updated_by}`
för tidig förnyelse.

### Testevidens

- Clean reset av hela migrationskedjan; databaslint utan schemafel.
- Full pgTAP: **1 800/1 800**, 30 filer. Nya filer:
  `license_terms_mutation_test.sql` (**68**) och
  `license_terms_security_test.sql` (**58**). Två Licensing-katalogförväntningar
  uppdaterade från 8 till 10 funktioner.
- Mutationsprob: fyra avsiktligt försvagade regler (datum vid aktiv planbyte,
  förkortande renewal, renewal av Tills vidare, felaktiga `changed_fields`)
  applicerades tillfälligt lokalt och fångades av 16 tester; därefter reset.
- Node **166/166**, typecheck, ESLint, Prettier och production build passerar.
- Två typgenereringar är byteidentiska. Typdiff mot F2D5B:
  `change_license_terms` och `renew_license`.
  SHA256: `3ECAB16EE2F0C9353CF47B4FF6208F6BA0563C608247F76581CB58E3F9B94E91`.

Den genererade typen anger `renew_license.p_valid_until: string`, trots att
NULL är ett giltigt värde (Tills vidare). Den kommande F2D7-repositoryn måste
skicka explicit `null`, på samma sätt som befintliga repositories hanterar
nullable RPC-argument. Ingen typöverskrivning införs i F2D5C.

### Riktig lokal concurrency

`node scripts/runtime-tests/verify-licensing-terms-concurrency.mjs --local`
passerar **7/7**:

1. Parallell terms change med samma revision: andra väntar och får `conflict`;
   ingen extra terms-version skapas.
2. Efter första rollback lyckas den väntande ändringen som version 2.
3. Parallell suspend/renew serialiseras; stale renewal ger `conflict`.
4. Förnyelse av utgånget intervall startar vid beslutstiden efter faktisk låsväntan.
5. Ogiltig input avvisas utan att vänta på lås; terms change väntar på pågående
   Tenant-pause och får `tenant_not_available`.
6. Olika Tenants serialiseras inte globalt.
7. Alla committade grafer passerar exakt F2D4-preflight.

Samtliga fyra Licensing-runners passerar från ren databas: F2D4 8/8,
F2D5A 5/5, F2D5B 8/8 och F2D5C 7/7.

### Kvarstår

F2D6 Read Model / Pagination / Provisioning Eligibility, därefter F2D7–F2D9.
Inga readmodeller, eligibility, DAL, routes, actions eller UI ingår i F2D5.
Signerad Data API-runtime och cloud återstår i F2D9/F2H.

## F2D5B: Lifecycle, lokalt verifierad 2026-10-06

Baseline är HEAD `2ece7ae`. Inget har stageats, committats eller pushats.
F2D5B är implementerad; F2D5C (terms/renewal) och hela Licensing återstår.

Migration: `20261006090000_create_license_lifecycle_mutations.sql`.

```sql
public.activate_license(p_license_id uuid, p_expected_revision bigint, p_correlation_id uuid default null) returns public.licenses
public.suspend_license(p_license_id uuid, p_expected_revision bigint, p_correlation_id uuid default null) returns public.licenses
public.terminate_license(p_license_id uuid, p_expected_revision bigint, p_correlation_id uuid default null) returns public.licenses
```

### Kontrakt

| RPC               | Från                     | Till       | Tenant tillgänglig | Giltighet        | Event              |
| ----------------- | ------------------------ | ---------- | ------------------ | ---------------- | ------------------ |
| activate_license  | draft, suspended         | active     | Krävs              | Slut ej passerat | license_activated  |
| suspend_license   | active                   | suspended  | Krävs inte         | Bedöms inte      | license_suspended  |
| terminate_license | draft, active, suspended | terminated | Krävs inte         | Bedöms inte      | license_terminated |

Reaktivering är activate från suspended. Framtida `valid_from` tillåts vid
aktivering (not_started). Ett passerat `valid_until` nekas med
`invalid_state_transition`; licensen måste förnyas (F2D5C) först. Terminated
är terminal och frigör tenantens plats för en ny draft; historiken bevaras.

Ordning i varje RPC: owner+AAL2 och actor → inputvalidering → oläst uppslag av
immutable `tenant_id` → Tenant `FOR NO KEY UPDATE` → License `FOR NO KEY UPDATE`
→ ett `clock_timestamp()` som beslutstid → expected revision (`conflict`) →
state (`invalid_state_transition`) → för activate Tenant availability och
giltighet. Låsordningen Tenant → License är gemensam för alla Licensing-writes,
även suspend/terminate. För dem är Tenant-låset endast ordning: paused eller
archived Tenant blockerar aldrig indragning.

Lyckad mutation: status, revision +1, `updated_at` = `occurred_at` =
beslutstid, `updated_by` = actor, oförändrad `current_terms_version` och exakt
en auditpost med `changed_fields = {status,revision,updated_at,updated_by}`.
Ingen ny terms-version. Auditfel ger `audit_failure` och full rollback; F2D4
validerar slutgrafen deferred. Samma härdning som `create_license`: postgres-ägd
SECURITY DEFINER, `search_path = pg_catalog`, VOLATILE, PARALLEL UNSAFE och
EXECUTE endast för authenticated.

### Testevidens

- Två clean resetar av hela migrationskedjan; databaslint utan schemafel.
- Full pgTAP: **1 674/1 674**, 28 filer. Nya filer:
  `license_lifecycle_mutation_test.sql` (**60**) och
  `license_lifecycle_security_test.sql` (**83**).
- Två katalogförväntningar uppdaterade för de tre nya RPC:erna:
  `licensing_foundation_access_test.sql` och
  `licensing_owner_aal2_read_access_test.sql`.
- Mutationsprob: en avsiktligt försvagad variant (draft kunde suspenderas,
  ingen availability-kontroll, svagare revisionsjämförelse) applicerades
  tillfälligt lokalt och fångades av 7 tester; därefter reset.
- Node **162/162**, typecheck, ESLint, Prettier, production build och
  `git diff --check` passerar. `next-env.d.ts` återställd.
- Två typgenereringar är byteidentiska. Enda typdiff: `activate_license`,
  `suspend_license`, `terminate_license`.
  SHA256: `4BBF94A623C7E1B1B15883E1A53B9EC9C15272E83FE748CF3922C9AB76B67441`.

pgTAP täcker hela kedjan draft → active → suspended → active → terminated,
terminate från draft/suspended, ny draft efter terminate, upprepad status,
terminal state, stale/framtida revision (conflict före state), input/not_found,
paused/archived Tenant för alla tre, utgånget intervall för draft och suspended,
framtida start, exakt audit/actor/correlation/beslutstid, oförändrade terms,
auditfailure-rollback och deferred F2D4-rollback. Säkerhetsfilen verifierar
signatur, härdning, exakt ACL, elva nekade claimformer per RPC (maskerat
`unauthorized` före uppslag, även för okänt id), saknad singleton, anon och
service_role samt fortsatt stängda direkta writes och audit-read.

### Riktig lokal concurrency

`node scripts/runtime-tests/verify-licensing-lifecycle-concurrency.mjs --local`
passerar **8/8** med separata psql-sessioner och verifierad låsväntan:

1. Parallell suspend med samma revision: andra väntar och får `conflict`.
2. Efter första rollback lyckas den väntande suspend.
3. Beslutstiden fångas efter faktisk låsväntan.
4. Parallell terminate/create på samma Tenant serialiseras; create lyckas efter
   terminate och historiken bevaras.
5. Activate väntar på pågående Tenant-pause och får `tenant_not_available`.
6. Suspend väntar på pågående Tenant-pause och lyckas därefter.
7. Olika Tenants serialiseras inte globalt.
8. Alla committade grafer passerar exakt F2D4-preflight.

Session-harnessen ligger nu i `scripts/runtime-tests/local-db-harness.mjs`.
De befintliga F2D4/F2D5A-runnerna är oförändrade och passerar fortfarande
8/8 respektive 5/5. Efterföljande reset städade alla fixtures.

### Kvarstår

F2D5C: `change_license_terms` och `renew_license`. Därefter F2D6–F2D9.
Inga readmodeller, eligibility, DAL, routes, actions, UI eller andra domäner
införs. Signerad Data API-runtime och cloud återstår i F2D9/F2H.

## F2D5A: Create, lokalt verifierad 2026-09-13

Baseline är HEAD `46ccc12` plus redan staged F2D4-implementation och dokumentation.
De befintliga ändringarna har bevarats och inget har stageats, committats eller
pushats i F2D5A. F2D5A är implementerad; F2D5B/C och hela Licensing återstår.

Migration: `20260913120000_create_license_mutation.sql`.

```sql
public.create_license(
  p_tenant_id uuid,
  p_plan_key text,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
  p_correlation_id uuid default null
) returns public.licenses
```

## Authorization och affärskontrakt

RPC:n kontrollerar explicit `is_licensing_owner_aal2()` före domänuppslag och
hämtar actor från `auth.uid()`. Ingen actor, kapacitet, label, paketversion,
status, revision eller auditpayload tas från klienten.

Funktionen är postgres-ägd PL/pgSQL, VOLATILE, PARALLEL UNSAFE, SECURITY DEFINER
med search_path pg_catalog och statiskt SQL. Endast authenticated får EXECUTE;
PUBLIC, anon och service_role saknar det. F2D3:s SELECT-policies, direkta
writeförbud och stängda audit-read består. F2D4 ändras inte.

Create kräver Tenant med operational_status active och archived_at NULL.
Tenant låses först med FOR NO KEY UPDATE. Därefter kontrolleras icke-terminated
licens. Samma Tenant serialiseras; andra Tenants kan fortsätta parallellt.
Det partiella unika indexet kvarstår. Bara unique-kollision med exakt
idx_licenses_tenant_non_terminated_unique mappas till duplicate_license.

F2D5 följer F2D1B:s availabilityregel: alla terms changes, även nedgradering,
och renewal kräver tillgänglig Tenant. Endast suspend/terminate undantas.
Datumkontraktet bevaras. Dessa senare operationer är inte implementerade här.
Gemensamt Tenant-lås preciserar planen för kommande F2D5B/C utan Tenant-ändring.

## Paket, tid och atomisk graf

DB härleder endast mini/1/Mini/24, standard/1/Standard/49 och stor/1/Stor/100.
Okänd, felcasead eller whitespaceförändrad key nekas. Ingen custom plan eller
manuell kapacitetsoverride finns.

Ett enda clock_timestamp() fångas efter Tenant-lås och availability/duplicate-
kontroll. current_timestamp används inte eftersom det avser transaktionsstart.
NULL start använder beslutstiden. Explicit start måste vara finite och minst
beslutstiden. NULL slut betyder tills vidare; satt slut måste vara finite och
strikt efter effektiv start. Infinity och backdating nekas. Intervallet är
[valid_from, valid_until); ingen derived validity eller grace lagras.

License → audit → terms skrivs atomiskt:

- License: draft, revision 1, current_terms_version 1; båda actorfält från DB.
- Audit: license_created, revision_before NULL, revision_after 1, samma actor.
- Terms: version 1, introduced_at_revision 1 och full canonical snapshot.
- created_at, updated_at, occurred_at och default valid_from delar beslutstiden.

changed_fields har foundationens exakta ordning och samtliga införda icke-NULL-
fält. valid_until utelämnas vid NULL; correlation_id ingår inte i arrayen.
Returen är skapad licenses-rad. F2D4 validerar slutgrafen deferred vid commit.

## Felmodell

| SQLSTATE | Meddelande                          | Orsak                                |
| -------- | ----------------------------------- | ------------------------------------ |
| P0001    | unauthorized                        | Owner/AAL2/actor nekas               |
| 22023    | validation_error                    | Ogiltig input, paket eller giltighet |
| P0001    | not_found                           | Tenant saknas                        |
| P0001    | tenant_not_available                | Paused eller archived Tenant         |
| P0001    | duplicate_license                   | Icke-terminated licens finns         |
| P0001    | audit_failure                       | Auditinsert misslyckas               |
| 23514    | license history integrity violation | F2D4 nekar strukturellt slutläge     |

Övriga unique-/terms-/operativa fel maskeras inte som normal duplicate eller
inputvalidering. Framtida DAL ska sanera oväntade fel enligt repo-konvention;
ingen DAL införs här. Alla fel rullar tillbaka den aktuella operationen.

## Testevidens

- Lokal start/status och två clean resetar passerar hela migrationskedjan.
- Databaslint: inga schemafel.
- Full pgTAP efter båda resetarna: **1 531/1 531**, 26 filer.
- Nya create-testet: **45** tester; nya security-testet: **42** tester.
- Node: **162/162**.
- Typecheck, ESLint och production build passerar. Route inventory är oförändrad.
- Full Prettier-kontroll och git diff --check passerar. next-env.d.ts är återställd.
- Lokal Supabase är stoppad efter verifierad fixturestädning.
- Två typgenereringar är byteidentiska. Enda typdiff: Functions.create_license.
- SHA256: `4337A202A6987490A33931FA3613B6CB984B673C6FCECFA7FE5DBE8D3B8F821B`.

pgTAP verifierar alla tre paket, standard/future start, finite/indefinite slut,
exakt changed_fields, actor/tid/correlation, valideringsfel, Tenantstatus,
duplicate för draft/active/suspended och bevarad terminated historik.
Säkerhetsmatrisen använder authenticated och syntetiska claims, inklusive
malformed JSON/UUID, fel AAL-typ och metadataförfalskning, samt EXECUTE-förbud
för anon/service_role och fortsatt stängda direkta writes/audit-read.

Rollback-prober körs i pgTAP-transaktioner som alltid rullas tillbaka. Tillfälliga
NOT VALID CHECK-constraints nekar nya audit-/termsrader; inga produkt-hooks
eller inaktiverade triggers används. En separat transaktionell probe ändrar
revision efter create och forcerar F2D4, vilket verifierar rollback av hela
försöket. License/audit/terms-antal kontrolleras efter samtliga fel.
Ett syntaxfel i testets results_eq-jämförelse rättades före gröna körningar.

Endast två befintliga katalogförväntningar ändras för den nya RPC:n:
licensing_foundation_access_test.sql och licensing_owner_aal2_read_access_test.sql.
F2D4:s integritets-/immutabilityförväntningar bevaras.

## Riktig lokal concurrency

`node scripts/runtime-tests/verify-licensing-mutation-concurrency.mjs --local`
passerar **5/5** med separata psql-sessioner, verifierad låsväntan och timeouts:

1. Samma Tenant: andra create väntar och får duplicate_license efter första commit.
2. Samma Tenant: andra create lyckas efter första rollback.
3. Beslutstid ligger efter faktisk låsväntan, inte vid transaktionsstart.
4. Olika Tenants kan committa medan första transaktionen fortfarande hålls öppen.
5. Alla committade grafer passerar exakt F2D4-preflight.

Runnern tillåter endast lokalt Docker-socket och repositoryts fasta container,
kräver tom licens-/ownergrund och loggar inga credentials. Efterföljande reset
städade fixtures: licenses/terms/audit/owner/auth.users = 0/0/0/0/0.

## Kvarstår

Nästa steg är F2D5B Lifecycle, därefter F2D5C Terms/Renewal. F2D5 som helhet
är inte klar. Inga placeholders, readmodeller, eligibility, DAL, routes,
actions, UI eller andra domäner införs. Inga cloud-operationer utförs.
Signerad Data API-runtime/cloud återstår i F2D9/F2H. Syntetiska DB-claims
verifierar DB-kontraktet, inte JWT-signaturer eller aktuell MFA-session.
