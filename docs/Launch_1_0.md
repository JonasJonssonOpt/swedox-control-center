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
- [x] Tenants och Installations är klickbara och textmarkeras med
      `aria-current`; framtida moduler saknar routes och visas som
      `Kommer senare`.
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
- [x] F2C5:s installationbundna, metadata-only och cursorpaginerade owner audit
      read-RPC är lokalverifierad utan direkt audittabellåtkomst.
- [x] F2C6A:s owner-only installationslista med stabil display name/UUID-cursor,
      filter, bokstavlig sökning och allowlistad metadata är lokalverifierad.
- [x] Installationslistans sökning är begränsad till display name och
      installation code; tenant legal name och application host är uttryckligen
      inte sökbara.
- [x] F2C6B:s server-only installations-DAL/service med ownerguard,
      request-lokal SSR, separata list/detail-DTO:er, runtimevalidering, stabila
      servicefel, audit och sju mutationer är lokalverifierat.
- [x] F2C7A:s tre dynamiska installation read routes för paginerad lista,
      detail och installationbunden audit använder endast servicegränsen med
      säker query parsing, stabil felmapping och private no-store.
- [x] F2C7B:s sju separata installation mutation Server Actions använder
      strikt FormData-gräns, servergenererat correlation-ID, stabila
      actionresultat och service-only dataflöde utan mutation routes.
- [x] F2C8A:s serverrenderade installationslista och detail med aktiv global
      navigation, URL-filter, cursorpagination, skyddad metadata och
      tillgängliga loading/error/not-found-states är lokalverifierade.
- [x] Installation create/edit-formulär är verifierade med tenant availability,
      immutable edit-kontext, expected revision, field errors, conflict,
      pending-låsning och success-only redirect/revalidation.
- [x] Installation lifecycle-kontroller är verifierade med state-specifik
      synlighet, native dialogs, terminal avveckling, archive/restore-semantik,
      expected revision och success-only redirect/revalidation.
- [x] Installation audit history UI är verifierad med initial service-load,
      routebaserad pagination, metadata-minimering, responsevalidering,
      request-lock och stöd för arkiverad detail.
- [x] Installation Management är manuellt runtimeverifierat och formellt
      stängt.
- [x] F2C9D korrigerar lokalt immediate audit rendering efter mutation genom
      revisionsbaserad återställning från serverns nya auditförstasida.
- [x] F2C9D är appdeployad och manuellt verifierad utan F5.
- [x] F2C9A:s lokala korrigering frikopplar administrativ aktivering från
      nullable provisioningmetadata med bevarad ownerkontroll, concurrency och
      atomisk audit.
- [x] F2C9A-migrationen är distribuerad och runtimeverifieringen återupptogs
      från aktiveringssteget.
- [x] F2C9B stödjer lokalt nullable application host och hosting region i
      installationslistan med `Saknas`, blandade rader och fail-closed
      validering.
- [x] F2C9B-appkoden är distribuerad och nullable metadata verifierades i
      verklig runtime; verifieringen identifierade därefter F2C9C:s separata
      collationfel.
- [x] F2C9C låser lokalt installationslistans PostgreSQL- och serverordning
      till samma UTF-8-byteordning med UUID-tiebreak, stabil cursorpagination
      och bibehållen nullable metadata.
- [x] F2C9C-migrationen och appkoden är godkända och distribuerade, och
      runtimeverifieringen har återupptagits från listan.
- [x] Lokal fullregression efter F2C9C är grön med 804/804 pgTAP, 151/151
      Node-test, databaslint, TypeScript, Prettier, ESLint och production build.
- [x] F2C9H:s slutgate är godkänd: verklig list- och auditpagination, fixture
      cleanup med noll kvarvarande rader samt slutregression 804/804 pgTAP och
      158/158 Node. Installation Management är verksamhetsklart och låst.

## Relaterade dokument

- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Owner-bootstrap](OWNER_BOOTSTRAP.md)
- [Databas-recovery](DATABASE_RECOVERY.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
- [Installation Database Design](INSTALLATION_DATABASE_DESIGN.md)
