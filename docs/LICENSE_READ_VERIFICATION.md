# Licensing Read Verification

## F2D6: Read Model / Pagination / Provisioning Eligibility, lokalt verifierad 2026-10-06

Baseline är HEAD `2ece7ae` plus ocommittad F2D5B/F2D5C, granskningsfynd och
säkerhetsavstämning. Inget har stageats, committats eller pushats. F2D6 är
komplett på databasnivå. Licensing som helhet är inte komplett; F2D7–F2D9
återstår.

Migrationer:

- `20261006180000_create_license_read_model.sql`
- `20261006190000_create_license_provisioning_eligibility.sql`

```sql
public.list_licenses(p_page_size integer default 50, p_evaluated_at timestamptz default null,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null,
  p_tenant_id uuid default null, p_status text default null, p_validity text default null,
  p_include_terminated boolean default false, p_search text default null)
public.get_license(p_license_id uuid)
public.list_license_terms_versions(p_license_id uuid, p_page_size integer default 25,
  p_cursor_version bigint default null)
public.list_license_audit_events(p_license_id uuid, p_page_size integer default 25,
  p_cursor_occurred_at timestamptz default null, p_cursor_id uuid default null)
public.get_license_provisioning_eligibility(p_tenant_id uuid, p_installation_id uuid default null)
```

### Gemensam säkerhet

Alla fem är `SECURITY DEFINER`, ägda av postgres, `search_path=pg_catalog`,
`STABLE`, `PARALLEL UNSAFE` och plpgsql. EXECUTE har endast authenticated.
PUBLIC, anon och service_role nekas. Första kontrollen är
`is_licensing_owner_aal2()`; auktorisering går före validering och uppslag, så
nekade anrop får `unauthorized` även för okända id:n. Inga tabeller, grants,
policies eller writes ändras. Audit-tabellen förblir helt stängd för direkt läsning.

Utdata är en allowlist av metadata. Lista och detail returnerar inte
`created_by`/`updated_by`. Audit returnerar `actor_user_id` för intern transport;
UI visar fortsatt Verifierad owner.

### Utvärderingstid och snapshot

DB-tiden är `statement_timestamp()`. Den är STABLE-kompatibel och tas vid samma
tidpunkt som läs-snapshoten. En STABLE plpgsql-funktion använder anroparens
snapshot för alla sina satser, så varje anrop läser en konsistent graf.
`validity` härleds enligt designen: `not_started` om t < start, `expired` om
slut finns och t >= slut, annars `valid`. Ingenting lagras.

### Lista och keyset

- Sort `created_at DESC, id DESC` utan strängcollation. Standard 50, max 100,
  limit+1. Ingen offset, total count eller sidnummer. `next_cursor_*` är null på
  sista sidan.
- Första sidan utfärdar `evaluated_at`. Fortsättningssidor måste skicka den
  oförändrad tillsammans med fullständig cursor; giltigheten bedöms då vid
  seriens tid, inte vid ny tid. Framtida eller oändlig tid nekas.
- I DB binds cursorn till oföränderliga värden: exakt `created_at` med
  mikrosekunder, id, tenantfilter och att raden skapades senast vid seriens
  tid. Föränderliga filter (status, giltighet, sökning) kan ändra medlemskap
  mellan sidor enligt designen. Bindningen av hela filterkontexten är
  DAL-cursorns ansvar i F2D7.
- Filter: tenant, status, validity och `includeTerminated` (false som standard).
  `status=terminated` utan `includeTerminated` ger `validation_error`.
- Sökning: endast tenantens `legal_name`, trimmad, skiftlägesokänslig bokstavlig
  delsträng, högst 200 tecken. `%` och `_` är bokstavliga, och tom sökning är
  ingen sökning.
- NULL i page size eller `includeTerminated` ger `validation_error`.

### Detail och historik

- `get_license` returnerar identitet, aktuella villkor, status, härledd giltighet,
  revision och `evaluated_at`. Terminerade licenser är läsbara; okänt id ger `not_found`.
- Terms history sorteras `version DESC` med licensbunden versionscursor, standard
  25 och max 100. `introduced_at` är beslutstiden från auditposten för samma revision.
- Audit sorteras `occurred_at DESC, id DESC` med licensbunden cursor, standard
  25 och max 100. En cursor från en annan licens eller med fel tid ger
  `validation_error`.

### Provisioning eligibility

Resultatet är alltid exakt en rad: `eligible`, `reason`, `evaluated_at` och de
nullbara fälten `license_id`, `revision`, `terms_version` och `valid_until`.
Ordningen är:

1. `tenant_installation_mismatch`, när installationens tenant skiljer sig från
   den efterfrågade tenanten.
2. `tenant_unavailable`, när tenanten är pausad eller arkiverad.
3. Licensval. Tenantens enda icke-terminerade licens väljs. Finns ingen sådan
   väljs den senaste terminerade enligt `created_at DESC, id DESC`. Finns ingen
   licens alls blir svaret `missing_license`.
4. Administrativ status: `draft`, `suspended` eller `terminated` blockerar
   oberoende av datum.
5. Giltighet för `active`: `not_started` eller `expired`. Annars blir svaret `eligible`.

De två första orsakerna och `missing_license` lämnar licensfälten tomma.
NULL-tenant ger `validation_error`. Okänd tenant eller installation ger `not_found`.
Installationens status, arkivering, deploy och hälsa påverkar inte resultatet.
Eligibility är ingen reservation; Provisioning omprövar vid start. Den maskerade
grenen `technical_read_error` hör till DAL:en i F2D7.

### Testevidens

- Clean reset av hela migrationskedjan; databaslint utan fynd. Den första
  versionen använde `clock_timestamp()`, vilket gav lintvarningar om VOLATILE i
  STABLE. Den ersattes av `statement_timestamp()` före verifieringen.
- Full pgTAP: **2 071/2 071**, 33 filer. Nya filer:
  - `license_read_model_test.sql` (**92**)
  - `license_provisioning_eligibility_test.sql` (**33**)
  - `license_read_security_test.sql` (**146**): exakt katalog, hårdning, ACL,
    11 nekade claimformer per yta, saknad singleton, anon och service_role.
- Uppdaterade katalogförväntningar: Licensing-funktioner 10 → 15 i två filer,
  och `list_license_audit_events` i Tenant-testets allowlist över auditfunktioner.
  Den allowlisten utökades på samma sätt i F2D4. Inget Tenant-beteende ändras.
- Mutationsprob: åtta avsiktligt försvagade varianter applicerades tillfälligt
  lokalt: terminated visas som standard, `<=` i keyset, giltighet vid ny tid i
  stället för seriens tid, termscursor utan licensbindning, ingen mismatchkontroll,
  suspended räknas som eligible, fel val av terminerad historik och owner AAL1
  tillåts. Alla fångades, med totalt 72 failande tester, och varje prob följdes
  av reset.
- Node **168/168**, typecheck, ESLint, Prettier, production build och
  `git diff --check` passerar.
- Två typgenereringar är byteidentiska.
  SHA256: `022CC0A3C56308761B4D228F4C504EFD2A149656B104FBF3E193A0703CAC0436`.

### Riktig lokal concurrency

`node scripts/runtime-tests/verify-licensing-read-concurrency.mjs --local`
passerar **7/7**:

1. Under en pågående suspend som håller License-låset svarar alla fem läsytor
   utan att vänta och visar committat tillstånd.
2. Nästa läsning efter commit ser det nya tillståndet.
3. Eligibility väntar inte på en pågående Tenant-pause och visar därefter
   `tenant_unavailable`.
4. En öppen lästransaktion blockerar inte en licensmutation.
5. Keyset-fortsättning efter en samtidigt committad ny licens ger varken
   dubbletter eller överhoppade rader.
6. Läsningar fortsätter medan skrivare köar på samma licens.
7. Alla committade grafer passerar exakt F2D4-preflight.

Alla fem Licensing-runners passerar från ren databas: F2D4 8/8, F2D5A 5/5,
F2D5B 8/8, F2D5C 7/7 och F2D6 7/7.

### Krav på F2D7

Genererade typer visar dessa nullbara utdata som icke-null: `valid_until`,
`next_cursor_*`, eligibility-fälten `license_id`/`revision`/`terms_version`/`valid_until`,
samt auditens `revision_before` och `correlation_id`. Inga typöverskrivningar
införs, i linje med F2D5C. F2D7-repositoryt runtime-validerar all utdata,
inklusive nullability, scope och ordning, före DTO-mapping.

Tidsstämplar för cursor och `evaluated_at` måste transporteras som oförändrad
DB-text med mikrosekunder, aldrig via JS `Date`. DAL-cursorn binder dessutom
hela filterkontexten och avvisar okända eller dubbla parametrar.

### Kvarstår

F2D7 Server DAL/Service, F2D8 UI och F2D9 Security + Runtime. Inga routes,
actions, DAL, UI, Dashboard-summary eller signerade Data API-tester ingår i F2D6.
