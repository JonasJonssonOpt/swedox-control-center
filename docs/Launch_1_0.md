# Launch 1.0

## Syfte

Detta dokument samlar verifierbara releasegates för SweDox Control Center version 1. En punkt får markeras som uppfylld först när motsvarande implementation och testresultat finns.

## Databas och Tenant Management

Följande krävs före release av Tenant Management:

- [x] Självregistrering är manuellt verifierad som avstängd i rätt Supabase-projekt.
- [x] Anonymous sign-in är manuellt verifierad som avstängd.
- [x] Den tomma migrationskedjan kan reproduceras från en tom lokal databas.
- [ ] RLS-tester visar att owner tillåts och att anonymous samt annan authenticated user nekas.
- [ ] Equality-kontrollen verifierar samma owneridentitet i environment och DB-singleton.
- [ ] Mismatch och unavailable kontroll stoppar Tenant Management fail-closed.
- [ ] Beständig och atomisk audit finns före användning av verkliga pilotdata.
- [ ] Backup- och restore-runbook är verifierad.
- [x] Tomma genererade databastyper är uppdaterade och har CI-kontroll mot lokal databas.
- [ ] Ingen normal tenant-CRUD använder browserklient eller Service Role.
- [x] Kodfri Security Pass och tenantdatabasdesign är godkända med dokumenterade operativa blockerare.
- [x] Owner-singletonens schema, constraints, FK, RLS och grants är lokalt verifierade.
- [x] Den kategoriska owner-integritetsfunktionen är lokalt verifierad utan UUID-läckage.
- [x] Server-side ownerintegritetsguard och environment-equality är verifierade.
- [ ] Owner-bootstrap är implementerad och verifierad.
- [x] Tenanttabell, constraints, organisationsnummervalidering och grundindex är lokalt verifierade.
- [ ] Tenant-RLS, policies, audit och atomiska mutationer är implementerade och verifierade.

## Relaterade dokument

- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Owner-bootstrap](OWNER_BOOTSTRAP.md)
- [Databas-recovery](DATABASE_RECOVERY.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
