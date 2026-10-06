# Provisioning Foundation Verification

## F2E3: Database Foundation, lokalt verifierad 2026-10-06

Baseline är HEAD `73edf57` (F2E2 committad). Inget har stageats, committats
eller pushats. Migration: `20261006200000_create_provisioning_foundation.sql`.
Kontraktet följer F2E2 i [Provisioning Domain Design](PROVISIONING_DOMAIN_DESIGN.md).

### Innehåll

- **Tabeller:** `provisioning_runs` (med resultatfält),
  `provisioning_run_steps`, `provisioning_step_attempts` och
  `provisioning_audit_events`, med exakt de kolumner, constraints och index som
  F2E2 låste.
- **Formatkrav:** resultatfälten har samma format som Installations project
  ref, region och URL.
- **Skyddstriggers (55000), även mot privilegierad DML:**
  - körningar: ingen DELETE eller TRUNCATE; identitet, skapare och redan satta
    resultat är oföränderliga, och en avslutad körning ändras aldrig
  - steg: ingen DELETE eller TRUNCATE; identitet och lyckade steg är
    oföränderliga, och antalet försök kan inte minska
  - försök: append-only; ett pågående försök avslutas exakt en gång
  - audit: append-only
- **Deferred integritetskontroll (23514) vid commit, under radlås på körningen:**
  - revisionskedja lika med auditkedjan
  - exakt fyra katalogsteg
  - sammanhängande försöksnummer
  - stegstatus som speglar det senaste försöket
  - strikt stegordning
  - körningsstatus som följer steg och senaste försök, inklusive
    blockeringsorsak och avbrott
  - resultat exakt när rätt steg lyckats
  - tvåvägskoppling mellan försök och auditevent
  - `run_succeeded` endast för sista steget och `run_cancelled` endast som sista händelse
- **Åtkomst:** RLS och FORCE RLS på alla fyra tabeller, noll policies, inga
  privilegier för PUBLIC, anon, authenticated eller service_role. Alla fem
  funktioner ägs av postgres, har `search_path=pg_catalog` och saknar EXECUTE
  för API-roller.
- **Utanför F2E3:** RPC:er, behörighetsfunktion, serverlager och UI ingår inte
  (F2E4–F2E9).

### Testevidens

- Clean reset av hela migrationskedjan. DB-lint utan fynd.
- Full pgTAP **2 271/2 271** i 35 filer. Två nya filer:
  - `provisioning_foundation_test.sql` (**125**): kolumner, RLS/FORCE, ACL,
    policies, privilegiematris, funktionshärdning, triggers, index och FK.
  - `provisioning_integrity_test.sql` (**75**):
    - giltiga grafer i alla tillstånd: pending, pågående, blockerad,
      misslyckad följd av lyckad retry, klar, avbruten under försök och
      avbruten från pending; en avbruten körning frigör installationen
    - 16 deferred korruptioner
    - 26 omedelbara constraintfall
    - 19 oföränderlighetsfall
    - en anteckning på exakt 500 kodpunkter och en med radbrytning accepteras
- Uppdaterad tvärgående kontroll: Tenant-testets allowlist över
  auditfunktioner innehåller nu `prevent_provisioning_audit_event_modification`,
  på samma sätt som i F2D4 och F2D6. Inget Tenant-beteende ändras.
- Mutationsprob: åtta försvagningar applicerades tillfälligt lokalt, och varje
  prob följdes av reset:
  - revisionskontroll
  - stegordning
  - resultatkoppling
  - eventkoppling
  - blockeringsorsak
  - oföränderliga resultat
  - dubbelavslut av försök
  - kontrolltecken i anteckning

  Alla fångades.

- Typer: två genereringar är byteidentiska och lägger till de fyra tabellerna.
  SHA256: `6F5D5E16FC2C16369EA63ADC9471E409B9B5077DB43E0EB64F63B4F900E3080F`.
- Node **197/197**, typecheck, ESLint, Prettier, build och `git diff --check`.
- Licensing-runners från ren DB: 8/8, 8/8, 7/7, 7/7 och 11/11.
  F2D5A create-concurrency föll en gång utan felmeddelande, med endast
  Nodes versionsrad som sista utdata, och passerade sedan sex körningar i
  rad (5/5). Orsaken kunde inte fastställas. Mönstret liknar Windows/libuv-
  avbrottet vid processavslut som sågs i F2D9. Licensing berörs inte av F2E3.
  Det ska bevakas i F2H2.

### Implementationsnoter

- **CASE i IF:** plpgsql avslutar ett IF-villkor vid första `then` utanför
  parenteser. Därför är CASE-uttrycket för körningens status parentesomslutet.
- **Collation i testerna:** `information_schema`- och katalognamn har collation
  "C". Testerna sätter `collate "default"` före jämförelse med förväntade värden.

Nästa steg: F2E4 – Provisioning Security / Owner Read.
