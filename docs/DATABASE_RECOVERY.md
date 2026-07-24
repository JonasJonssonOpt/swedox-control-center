# Databas-recovery

## Syfte

Detta dokument definierar säkerhetskrav och ordning för recovery av Control Centers databas- och ownerkonfiguration. Exakta verktyg och kommandon fastställs först efter att lokal databas, Supabase CLI, deployment och backupmetod har verifierats.

## Omfattade situationer

Runbooken gäller när:

- Auth-owner måste återskapas
- owner-UUID ändras
- environment och DB-singleton divergerar
- fel Supabase-projekt har konfigurerats
- en deployment återställs
- databasen återställs från backup
- migrationsdeployment misslyckas
- lokal och extern migrationshistorik avviker
- RLS- eller equality-kontrollen misslyckas

## Grundregel

Tenant Management ska vara stängt fail-closed under recovery. Ingen tenantläsning eller mutation får ske innan identitet, schema, RLS och migrationsstatus har verifierats.

Login, MFA, logout och en säker felsida får fortsätta fungera när det inte öppnar tenantåtkomst.

## Recoveryflöde

1. Stoppa Tenant Management.
2. Verifiera Supabase-projekt och environment.
3. Fastställ den godkända owneridentiteten genom den kontrollerade recoveryprocessen.
4. Återkalla gamla sessioner när det är relevant.
5. Verifiera Auth-user och obligatorisk MFA.
6. Uppdatera environment och DB-konfiguration tillsammans från samma godkända input.
7. Verifiera migrationshistoriken.
8. Verifiera schemas, grants, RLS och policies.
9. Kör equality- och integritetskontroll.
10. Kör positivt test med avsedd owner.
11. Kör negativt test med anonymous och annan syntetisk authenticated user.
12. Dokumentera kontroller och resultat.
13. Återöppna Tenant Management efter uttryckligt godkännande.

Normal tenant-CRUD får inte tillfälligt ges Service Role eller kringgå RLS under recovery.

Den låsta designen använder FK från `control_center_owner.owner_user_id` till
`auth.users(id)` med delete restrict. Vid ownerbyte ska därför ny Auth-user
etableras och MFA-säkras innan singletonen byts; environment och singleton ska
uppdateras från samma godkända input medan Tenant Management är stängt. Equality,
positiva och negativa RLS-test ska vara godkända innan gamla sessioner betraktas
som hanterade och den gamla Auth-usern kan tas bort.

FK:n och delete restrict är implementerade och lokalverifierade i Steg D1. En
refererad Auth-owner kan inte tas bort. Ownerbyte och recovery kräver fortfarande
en separat godkänd driftprocess; ingen konkret remoteprocedur eller
bootstrapfunktion har införts.

Den lokalverifierade DB-kontrollen kan returnera `ok`, `unauthenticated`,
`missing_database_owner`, `invalid_database_owner_state` och
`authenticated_user_mismatch`. Tekniskt RPC- eller databasfel är inte en
domänstatus och ska behandlas som `integrity_check_unavailable` av den framtida
appen. Recovery måste verifiera både singletonens struktur och
`get_owner_integrity_status()`. Operativa fel får aldrig exponera owner-UUID.

Efter restore eller ownerbyte ska även serverns `requireOwnerIntegrity()` provas
om. Tekniska RPC-fel mappas till `integrity_check_unavailable`; raw fel eller UUID
får inte visas. Integritetsresultat cachas inte mellan requests. Gamla sessioner
ska återkallas vid ownerbyte innan Tenant Management återöppnas.

## Backup och restore

En restore kan återinföra:

- gammalt schema
- gammal DB-singleton
- gammal migrationshistorik
- tidigare grants, funktioner, triggers eller RLS-policies

Tenantåtkomst ska därför inte öppnas automatiskt efter restore. Equality, Auth-owner, migrationshistorik, schema och RLS måste verifieras först.

Restoreverifieringen ska också kontrollera att tenantrevisioner och senaste
beständiga auditevent är konsistenta. Audit eller revision får inte repareras
genom direkt tabelländring. Genererade typer ska jämföras mot det återställda och
fullständigt migrerade lokala schemat före applikationsdeployment.

Remote rollback dokumenteras och godkänns per incident. Destruktiva kommandon ska inte anges som normalprocedur innan verktyg, targetskydd, backup och återställningsmetod har verifierats.

## Misslyckad migration

Vid ett migrationsfel:

- stoppa efterföljande schema- och applikationsdeployment
- fastställ exakt vilka migrationer som har registrerats och applicerats
- gör inga manuella schemaändringar för att dölja drift
- välj en granskad forward-fix eller verifierad restore
- kör hela migrationskedjan i isolerad testmiljö
- verifiera schema, RLS och typer innan återöppning

Migrationshistorik får inte repareras utan ett separat granskat beslut baserat på faktiskt schema och faktisk historik.

## Verifierad lokal återställning

`npm run supabase:reset` är verifierat mot den lokala, olänkade databasen och använder explicit `--local`. Kommandot är destruktivt för lokal testdata och bygger därefter databasen från repositoryts migrationer.

Detta lokala kommando är inte en remote recoverymetod. Inget motsvarande länk- eller produktionskommando är godkänt eller dokumenterat.

## Recoveryaudit

Innan beständig tenant-audit finns ska recovery registreras i en separat skyddad operativ logg.

Loggen får innehålla:

- environment
- tidpunkt
- operatör eller ansvarig funktion
- typ av åtgärd
- resultat
- verifieringsstatus
- incident- eller ändringsreferens

Loggen får inte innehålla:

- fullständigt owner-UUID
- tokens
- lösenord
- nycklar
- connection strings
- råa Auth- eller databasfel
- tenanters person- eller verksamhetsdata

## Relaterade dokument

- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Owner-bootstrap](OWNER_BOOTSTRAP.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
