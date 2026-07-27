# Owner-bootstrap

## Syfte

Detta dokument definierar den kodfria säkerhets- och driftstandarden för att
etablera Control Centers enda `owner`. Tabellen
`public.control_center_owner` finns genom den lokalverifierade migrationen
`20260724184023_create_control_center_owner.sql`, men migrationen skapar ingen
ownerrad. Exakt bootstrapverktyg och utförandemetod återstår.

## Grundprincip

Supabase Auth-användarens UUID är identitetsobjektet. Ett kontrollerat, miljöspecifikt deploy- eller recoveryinput anger att just denna användare är Control Centers owner.

Samma input ska etablera:

- `CONTROL_CENTER_OWNER_USER_ID` i applikationens servermiljö
- owner-ID i en framtida skyddad DB-singleton

Environment och databas är två verkställande kopior av samma ownerbeslut. De får aldrig administreras oberoende. Saknad eller avvikande konfiguration stoppar Tenant Management fail-closed.

## Första bootstrap

Bootstrap ska ske i följande ordning:

1. Verifiera rätt Supabase-projekt.
2. Verifiera rätt environment.
3. Verifiera avsedd Auth-user.
4. Verifiera att endast avsedda Auth-users finns.
5. Verifiera att signup är avstängd.
6. Verifiera att anonymous sign-in är avstängd.
7. Verifiera obligatorisk MFA.
8. Registrera owner-UUID i godkänd secret- eller deploymentmiljö.
9. Konfigurera applikationens servermiljö från samma input.
10. Fyll den framtida DB-singletonen genom en separat administrativ driftoperation.
11. Kör equality- och integritetskontroll.
12. Kör positivt test med avsedd owner.
13. Kör negativt test med annan syntetisk authenticated user.
14. Aktivera Tenant Management först efter godkänt resultat.

Bootstrap får endast utföras av en uttryckligen behörig drift- eller databasadministrativ identitet. Operationen ska vara avgränsad, engångsbetonad och auditerad.

Auth-usern måste finnas före ownerraden eftersom `owner_user_id` refererar
`auth.users(id)` med delete restrict. Bootstrap får inte läggas i en generell
migration, seed eller normal authenticated operation.

## Förbud

- Inget verkligt owner-UUID får finnas i Git.
- Ingen owneridentitet får finnas i en generell migration.
- Vanlig seed får inte etablera owner i en delad miljö.
- Ingen bootstraproute eller Server Action får skapas.
- Ingen browserfunktion får utföra bootstrap.
- Ingen allmän administrationssida får ändra owner.
- Normal tenant-CRUD får inte använda Service Role.
- Bootstrap får inte skapa ett users-, roles- eller permissionssystem.

## Miljöseparation

- Lokal utveckling och automatiserade tester använder syntetiska identiteter.
- Staging och produktion har separata Auth-users.
- Miljöerna använder separata Supabase-projekt där det är relevant.
- Varje miljö har separata secrets och deploymentinputs.
- Produktionsownern återanvänds inte i lokal, test eller staging.

En operatör ska verifiera både projektreferens och environment innan någon miljöspecifik ownerkonfiguration etableras. Projektreferenser och owner-ID:n ska inte skrivas i vanlig dokumentation eller logg.

## Equality och fail-closed

`public.get_owner_integrity_status()` kan rapportera
`missing_database_owner` men skapar, uppdaterar eller tar aldrig bort owner.
Bootstrap är fortsatt en separat privilegierad process. Efter bootstrap ska
funktionen ge `ok` endast när aktuell `auth.uid()` motsvarar singletonens owner;
andra authenticated users får endast `authenticated_user_mismatch`.

Serverguarden failar därför stängt med missing owner tills bootstrap har skett.
Bootstrap får inte kringgå environment/Auth/DB-kedjan. Efter bootstrap kan
`requireOwnerIntegrity()` endast lyckas för rätt environment-owner med verifierad
Auth-identitet, AAL2 och DB-status `ok`.

Tenanttabellens E2-policy har samma fail-closed utgångsläge:
`public.is_control_center_owner()` returnerar `false` och RLS visar inga
tenantrader innan singletonen har bootstrappats. E2 skapar ingen ownerrad, seed,
bootstrapfunktion eller operativ bootstrapväg.

E4:s tenantmutationer använder samma DB-ownerkontroll och returnerar endast
`unauthorized` före bootstrap eller vid mismatch/null auth. De skapar då varken
tenant- eller auditdata. E4 skapar ingen ownerrad eller bootstrapväg.

E5:s audit-read-funktion använder samma fail-closed kontroll och returnerar
`unauthorized` innan tenant- eller cursoruppslag när singletonen saknas eller
auth inte matchar. Därmed exponeras inte tenantexistens eller historik före
bootstrap.

Tenant Management ska stoppas vid:

- saknat environmentvärde
- ogiltigt UUID-format
- saknad DB-singleton
- fler än en singletonpost
- mismatch mellan environment och databas
- verifierad användare som inte matchar owner
- unavailable eller felande integritetskontroll

Ingen fallback får välja environment eller databas som mer trovärdig. Login, MFA, logout och säkerhetsfelsida får fortsätta fungera när det kan ske utan att öppna tenantåtkomst.

## Verifieringsresultat

Bootstrapresultatet ska dokumentera:

- environment
- tidpunkt
- ansvarig operatör eller funktion
- verifierade kontrollsteg
- positivt och negativt testresultat
- slutligt godkännande

Dokumentationen får inte innehålla fullständigt owner-UUID, credentials, tokens, nycklar eller råa Auth- och databasfel.
