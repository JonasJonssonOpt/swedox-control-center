# Launch 1.0

## Syfte

Detta dokument samlar verifierbara releasegates för SweDox Control Center version 1. En punkt får markeras som uppfylld först när motsvarande implementation och testresultat finns.

## Databas och Tenant Management

Följande krävs före release av Tenant Management:

- [x] Självregistrering är manuellt verifierad som avstängd i rätt Supabase-projekt.
- [x] Anonymous sign-in är manuellt verifierad som avstängd.
- [x] Den tomma migrationskedjan kan reproduceras från en tom lokal databas.
- [x] RLS-tester visar att owner tillåts och att anonymous samt annan authenticated user nekas.
- [ ] Equality-kontrollen verifierar samma owneridentitet i environment och DB-singleton.
- [ ] Mismatch och unavailable kontroll stoppar Tenant Management fail-closed.
- [x] Beständig append-only audit och atomisk användning i tenantmutationer är lokalverifierade.
- [ ] Backup- och restore-runbook är verifierad.
- [x] Tomma genererade databastyper är uppdaterade och har CI-kontroll mot lokal databas.
- [ ] Ingen normal tenant-CRUD använder browserklient eller Service Role.
- [x] Kodfri Security Pass och tenantdatabasdesign är godkända med dokumenterade operativa blockerare.
- [x] Owner-singletonens schema, constraints, FK, RLS och grants är lokalt verifierade.
- [x] Den kategoriska owner-integritetsfunktionen är lokalt verifierad utan UUID-läckage.
- [x] Server-side ownerintegritetsguard och environment-equality är verifierade.
- [ ] Owner-bootstrap är implementerad och verifierad.
- [x] Owner-bootstrapmekanismen nekar saknad Auth-user/mismatch, är idempotent och saknar HTTP- eller API-rollsyta.
- [ ] Bootstrappad miljö är end-to-end-verifierad med ownerlogin, AAL2 och `/tenants`.
- [x] MFA-enrollment renderar Supabase QR/secret, verifierar challenge och kräver AAL2 före `/tenants`.
- [ ] Microsoft Authenticator-enrollment är manuellt verifierad med en riktig mobil TOTP-kod.
- [x] Tenanttabell, constraints, organisationsnummervalidering och grundindex är lokalt verifierade.
- [x] Tenant-RLS, owner-only SELECT, auditgrund och auditintegrerade atomiska mutationer är lokalverifierade.
- [x] Paginerad ownerkontrollerad tenant-auditläsning är lokalverifierad utan direkt audit-tabellåtkomst.
- [x] Server-only tenant-DAL/service med SSR, ownerguard, typade fel och runtimevaliderad output är lokalverifierat.
- [x] Tenant read routes för lista, detail och audit använder tenantservicen och dess ownerguard utan direkt Supabase-åtkomst.
- [x] Tenant mutation Server Actions använder tenantservicen och dess ownerguard med strikt FormData-gräns och stabila actionresultat.
- [x] Tenant list/detail-UI använder tenantservicen server-side med textbaserad status, no-store och maskerade fel.
- [x] Tenant create/edit-formulär använder verifierade actions med field errors, conflict, selektiv revalidation och serverredirect.
- [x] Tenant pause/activate/archive/restore-UI använder state-specifika kontroller, confirmations och optimistic concurrency.
- [x] Tenant audit history UI använder det verifierade paginerade readkontraktet.
- [x] F2A:s permanenta applikationsram visar sidomeny, toppheader och ett
      konsekvent huvudområde för Tenant Management.
- [x] Endast Tenants är klickbar och textmarkerad med `aria-current`; framtida
      moduler saknar routes och visas som `Kommer senare`.
- [x] Root `/` redirectar server-side till `/tenants`.
- [x] F2C1:s installationstabell med exakt 17 kolumner, tenant-FK, canonical
      metadata, revision, archivemetadata, grundindex och fail-closed grants är
      lokalverifierad.
- [x] Installation owner-only RLS/read access är verifierad för aktiva,
      arkiverade och historiskt tenantkopplade installationer.
- [x] F2C3:s separata metadata-only installationsaudit med revisionskedja,
      canonical changed fields, append-only-skydd, FORCE RLS och noll direkta
      grants är lokalverifierad.
- [x] F2C4:s sju ownerkontrollerade installationsmutationer med tenant
      availability, expected revision, låsta transitions och atomisk audit är
      lokalverifierade.
- [ ] Installationsaudit, mutationer, DAL/service, routes/actions och UI är
      verifierade.

## Relaterade dokument

- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Owner-bootstrap](OWNER_BOOTSTRAP.md)
- [Databas-recovery](DATABASE_RECOVERY.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
- [Installation Database Design](INSTALLATION_DATABASE_DESIGN.md)
