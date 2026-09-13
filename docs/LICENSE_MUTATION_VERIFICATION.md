# Licensing Mutation Verification

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
