# Provisioning Read Verification

## F2E4: Security / Owner Read, lokalt verifierad 2026-10-06

Baseline är HEAD `bd7b7f3` (F2E3 committad). Inget har stageats, committats
eller pushats. Migration: `20261006210000_create_provisioning_read_api.sql`.

### Innehåll

**`is_provisioning_owner_aal2()`** är Provisionings egen kopia av Licensings
predikat: befintlig singleton-owner och top-level JWT-claim `aal` exakt `aal2`.
Felformaterad JSON eller felaktigt subject nekas. Den är security invoker och
saknar EXECUTE för alla API-roller, eftersom den bara anropas inifrån RPC:erna.

**Fyra STABLE, SECURITY DEFINER-RPC:er**, ägda av postgres, med
`search_path=pg_catalog`, EXECUTE endast för `authenticated`, och auktorisering
före validering och uppslag:

- **`list_provisioning_runs`:**
  - filter för installation, tenant och status
  - `includeClosed`, false som standard, döljer `succeeded` och `cancelled`;
    en stängd status utan `includeClosed` ger `validation_error`
  - visar installationens namn och kod, tenantens namn, blockeringsorsak och
    härlett nästa steg
  - keyset `created_at DESC, id DESC`, 50/max 100
  - cursorn binds till exakt tid och id samt till installations- och
    tenantfiltret
- **`get_provisioning_run`:**
  - exakt fyra rader, en per katalogsteg, med körningens fält upprepade
  - resultatfält, stegstatus, antal försök och pågående försök
  - härlett `is_stale` för ett pågående försök äldre än 24 timmar, med
    `statement_timestamp()` som utvärderingstid. Ingenting lagras.
- **`list_provisioning_step_attempts`:** körningsbunden, `started_at DESC,
id DESC`, 25/max 100. Kategori, blockeringsorsak och anteckning ingår.
- **`list_provisioning_audit_events`:** körningsbunden, `occurred_at DESC,
id DESC`, 25/max 100. Bara metadata.

Tabellerna har fortfarande inga grants eller policies. Även owner med AAL2
nekas direkt läsning och skrivning (42501).

### Testevidens

- Clean reset och DB-lint utan fynd. Full pgTAP **2 442/2 442** i 37 filer.
  Två nya filer:
  - `provisioning_read_model_test.sql` (**53**):
    - sju körningar i alla tillstånd, inklusive en ny körning för en
      installation vars tidigare körning är klar
    - lista, filter, keyset och 13 valideringsfall
    - detail med steg, resultat och inaktualitet (25 timmar respektive färsk)
    - försök med anteckning och blockeringsorsak, audit-kedja och
      cursorbindning till rätt körning
    - inga skrivningar
  - `provisioning_read_security_test.sql` (**118**):
    - exakt signatur, returtyp, härdning, standardvärden, ACL och argumentnamn
    - att behörighetsfunktionen är intern
    - 11 nekade claimformer per RPC, även för okända id:n, och att
      auktorisering går före validering
    - saknad singleton, anon och service_role
    - att direkt tabelläsning och skrivning nekas
- Uppdaterade kontroller:
  - F2E3-testet skiljer nu strukturfunktionerna från de nya RPC:erna.
  - Tenant-testets allowlist över auditfunktioner har fått
    `list_provisioning_audit_events`.
- Mutationsprob: sex försvagningar fångades:
  - stängda körningar visas som standard
  - `<=` i keyset
  - tröskel 0 för inaktuellt steg
  - cursor för försök utan koppling till körningen
  - owner AAL1 tillåts
  - behörighetsfunktionen får API-grant

  Proben för cursorbindningen överlevde först, eftersom testet återanvände en
  inställning som hade skrivits över av audit-cursorn. Testet fick egna
  inställningar och fångar nu proben.

- Typer: två genereringar är byteidentiska.
  SHA256 `9262B3A418452AABC669632E1FE30BD30188751EABBC62329DCEA1B4F71AC1BE`.
- Licensing-runners från ren DB: 8/8, 5/5, 8/8, 7/7, 7/7 och 11/11.
- Node **197/197**, typecheck, ESLint, Prettier, build och `git diff --check`.
  En halvskriven `.next/dev/types/routes.d.ts`, kvar från dev-servern som
  avslutades med tvång i F2D9, fick typecheck att fallera. Den git-ignorerade
  artefakten togs bort; Next återskapar den vid nästa dev-körning.

Nästa steg: F2E5 – Provisioning Mutations / State Machine.
