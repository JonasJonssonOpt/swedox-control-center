# Projektbeslut

## Syfte

Detta dokument samlar bindande arkitektur- och arbetssättsbeslut för SweDox Control Center. Besluten gäller tills de ersätts av ett uttryckligt, dokumenterat beslut.

## Systemgräns

- Control Center är ett helt separat internt system.
- Varje kundinstallation har ett eget Supabase-projekt.
- Control Center har ett eget Supabase-projekt, separat från samtliga kundinstallationer.
- Kunder får aldrig åtkomst till Control Center.
- Kundernas affärsdata får aldrig lagras centralt i Control Center.
- Control Center får inte ha generell direktåtkomst till kundinstallationernas databaser.
- Kommunikation med kundinstallationer ska ske via verifierade server-API:er med minsta möjliga behörighet.

Besluten beskriver målarkitekturen. De innebär inte att Supabase, databas eller integration finns i den nuvarande tekniska baslinjen.

## Autentisering och behörighet i version 1

- Control Center är ett internt system som i version 1 endast används av ägaren.
- Exakt ett användarkonto ska finnas initialt.
- Den enda rollen är `owner`.
- Ingen användaradministration eller inbjudningsfunktion ska implementeras.
- Självregistrering ska vara avstängd.
- Inloggning ska ske med e-post och lösenord via Supabase Auth.
- TOTP-MFA med Microsoft Authenticator är obligatorisk. SMS-MFA ska inte användas.
- Egna recovery codes ska inte skapas. Recovery ska ske genom en dokumenterad manuell rutin via Supabase.
- En extra registrerad TOTP-enhet kan senare övervägas som reserv.
- Sessioner ska vara cookiebaserade, serverhanterade och använda PKCE.
- Varje skyddad route och serveroperation ska verifiera identitet, MFA-nivå och aktiv `owner`-behörighet på servern.
- Behörighet får aldrig hämtas från klientstyrd metadata.

Authentication och authorization ska hållas separerade även med en enda användare och roll. En giltig session bevisar inte i sig att kontot har aktiv `owner`-behörighet.

SSO, flera användare, invitationer och roller som `admin` och `super_admin` är endast en möjlig framtida målbild. De ingår inte i version 1 och får inte införas utan en ny analys och ett nytt dokumenterat projektbeslut.

## Databas och migrationer

- Versionshanterade migrationer under `supabase/migrations/` ska vara den auktoritativa schemakällan.
- Supabase CLI ska installeras som en exakt versionspinnad lokal npm-devDependency och reproduceras genom lockfilen.
- Lokal migrationskedja och genererade lokala databastyper är verifieringskällan före remote deployment.
- Normalt utvecklings- och CI-flöde får inte länka till eller kontakta ett remote Supabase-projekt.
- Delade databasmiljöer får inte ändras direkt vid sidan av migrationshistoriken.
- Migrationer ska verifieras från en tom lokal testdatabas innan deployment.
- Schema, seed, miljöspecifik bootstrap och recovery ska hållas separerade.
- Verkliga owner-ID:n, credentials och andra miljöspecifika secrets får inte finnas i generella migrationer eller Git.

Supabase CLI `2.109.1` och den lokala migrationsmiljön är verifierade. Den första
verksamhetsmigrationen, `20260724184023_create_control_center_owner.sql`,
implementerar lokalt `public.control_center_owner` med konstant
primärnyckel/check på `singleton_key = 1`, unique owner-UUID, FK till
`auth.users(id)` med delete restrict, tidsconstraints, FORCE RLS och utan direkta
tabellgrants för normala API-roller. Migrationen skapar ingen ownerrad.
Tenanttabell och övrigt verksamhetsschema är inte implementerade. Standarden
beskrivs i [Databas- och migrationsflöde](DATABASE_WORKFLOW.md).

## Tenant Management

Följande beslut gäller för den framtida Tenant Management-modulen:

- UUID är tenantens enda permanenta identitet.
- Inget kundnummer, tenantnummer eller slug ska införas.
- Control Center och Tenant Management är endast avsedda för Sverige.
- Tenantkategorierna i version 1 är `customer`, `pilot` och `internal`.
- Tenantens operativa status är `active` eller `paused`; arkivering hanteras separat.
- Ingen permanent delete ska införas.
- Ett obligatoriskt positivt `revision`-fält ska användas för optimistic concurrency och ökas atomiskt vid varje genomförd mutation.
- Strukturerad konsolaudit får endast användas lokalt och vid intern verifiering med syntetiska data.
- Beständig och atomisk audit är ett hårt krav före första pilot med verkliga kunddata.

Tenant Management är inte implementerad genom dessa beslut.

Steg E1 implementerar tenantens databasgrund enligt det låsta kontraktet:
`public.tenants` är den juridiska organisationen och är separerad från
installationer, licenser, provisionering och support. Organisationsnummer lagras
endast som canonical tio siffror, valideras med Luhn och är globalt unikt även
efter arkivering. Status är det låsta textfältet `operational_status` med endast
`active` och `paused`; arkivering lagras separat. Detta innebär inte att
Tenant Management är verksamhetsklart.

Steg C:s Security Pass och exakta databasdesign är låst i
[Tenant Database Design](TENANT_DATABASE_DESIGN.md). Security Pass är godkänt med
operativa blockerare; detta betyder inte att schema, RLS, mutationer, audit eller
DAL är implementerade.

## Owneridentitet och framtida RLS

- Supabase Auth-owneranvändarens UUID är identitetsobjektet.
- Samma kontrollerade, miljöspecifika input ska etablera både `CONTROL_CENTER_OWNER_USER_ID` och en framtida skyddad DB-singleton.
- Environment och databas är två verkställande kopior av samma ownerbeslut och får inte administreras oberoende.
- Mismatch eller unavailable integritetskontroll ska stoppa Tenant Management fail-closed.
- Befintlig applikationsauktorisering och `requireFullAccessOwner()` ska behållas.
- Framtida RLS ska jämföra `auth.uid()` mot DB-singletonens owner-ID och fungera som defense in depth.
- Singletonen får inte utvecklas till en generell rollmodell.
- Databasens kategoriska kontroll heter
  `public.get_owner_integrity_status()` och returnerar text utan identitetsdata.
  Den läser endast `auth.uid()` och singletonen.
- Environmentvalidering, AAL2 och full equality ligger i serverapplikationen.
  Resultatet får inte cachas mellan requests.
- `requireOwnerIntegrity()` är den högre verksamhetsguarden ovanpå oförändrad
  `requireFullAccessOwner()`. Appen bevisar environment/Auth equality; den
  kategoriska RPC:n bevisar Auth/DB equality. Ingen direkt singleton-SELECT
  används och ingen cache finns mellan requests.

Steg E2 låser tenantläsning till den autentiserade singleton-ownern genom FORCE
RLS, ett minimalt SELECT-grant och exakt en SELECT-policy. Policyn använder en
separat boolesk `public.is_control_center_owner()` i stället för den kategoriska
integritetsfunktionen: RLS behöver endast ett fail-closed beslut och ska inte
kopplas till appens rikare statustaxonomi. Helpern är en avgränsad
security-definer-gräns som kan läsa den helt skyddade singletonen utan
policyrecursion och utan att exponera identitet.

Läspolicyn hålls uttryckligen separat från framtida
create/update/archive/restore-funktioner. Inga direkta skrivgrants eller
skrivpolicies införs. FORCE RLS följer singletonens låsta modell och minskar
risken att tabellägaren oavsiktligt behandlas som normal applikationsväg;
privilegierade databasroller förblir ett operativt administrationsundantag.

## Installation Management

F2C1 låser en installation som en självständigt identifierbar och administrerbar
teknisk SweDox-miljö som tillhör exakt en tenant. En tenant får ha noll, en eller
flera installationer, inklusive flera production-installationer. `tenant_id`,
`installation_code` och `environment` är immutable efter create; tenant-FK
använder delete restrict.

Version 1:s environments är `production`, `staging`, `test` och `development`.
Pilot är tenantkategori, inte environment. Administrativ status är `planned`,
`active`, `paused` eller `decommissioned` och hålls skild från archive,
provisioning, deployment och health.

`application_url`, Supabase project ref och hosting region är skyddsvärd teknisk
metadata, aldrig credentials. Kunddata, connection strings, nycklar, tokens och
andra secrets är förbjudna. Installerad SweDox-version och deploytid ska ägas av
en framtida deployment-/releasedomän och lagras inte manuellt på installationen.

F2C1:s exakta kontrakt finns i
[Installation Database Design](INSTALLATION_DATABASE_DESIGN.md). Tabellen är
fail-closed. F2C2 ger den verifierade singleton-ownern SELECT till samtliga
installationer genom RLS, FORCE RLS, ett minimalt grant och exakt en policy som
återanvänder `public.is_control_center_owner()`. Arkiverade installationer och
installationer hos arkiverade tenants är historiskt läsbara. Policyn gör ingen
tenantjoin; tenant availability hör till framtida mutationsgräns. Audit,
mutationer och verksamhetslager saknas fortsatt och Installation Management är
inte verksamhetsklart.

F2C3 lagrar installationsaudit i en separat
`public.installation_audit_events`, inte i tenant audit. Tabellen är
metadata-only och append-only; den lagrar event, actor, revisioner, allowlistade
fältbenämningar och valfri correlation UUID, aldrig verksamhetsvärden eller
payloads. Provisioning, deployment och monitoring ska äga sina egna event.
Framtida global activity aggregerar domänägda reads i servicelagret och använder
inte en gemensam audittabell.

F2C4 låser installationsmutationer till sju separata typade RPC:er. Varje RPC
omprövar ownern, binder actor till `auth.uid()`, använder expected revision och
skriver exakt en auditpost atomiskt. Tenant måste vara active och icke arkiverad;
paused eller arkiverad tenant blockerar samtliga installationsmutationer.

Decommission är terminalt. Archive tillåts endast efter decommission och restore
återställer endast synlighet utan aktivering. Planned till active kräver
application URL, Supabase project ref och hosting region. Decommissioned men
oarkiverad installation får fortsatt uppdatera säker metadata.

F2C5 låser installationshistorik till en ownerkontrollerad, installationbunden
och cursorpaginerad RPC. Standardsidan är 25 och ordningen är newest-first på
timestamp och UUID. Output är metadata-only; direkt audit-SELECT, generell
aktivitet, sökning, export och UI ingår inte.

Steg E3 implementerar `public.tenant_audit_events` som en tenantspecifik,
append-only auditgrund. Kontraktet använder de sex låsta eventtyperna,
revisionspar med exakt en auditpost per tenantrevision, metadata-only
`changed_fields`, tenant-FK med delete restrict och actor-UUID utan Auth-FK.
Snapshots, diffvärden, JSONB och godtycklig metadata är uttryckligen uteslutna.

Audit-tabellen är helt stängd för API-roller i E3: FORCE RLS utan policies och
inga tabellgrants. En trigger blockerar UPDATE och DELETE. Framtida E4-funktioner
ska ensamma infoga audit atomiskt med create/edit/pause/activate/archive/restore;
direkt ownerläsning ersätts senare av en särskild ownerkontrollerad read-funktion.

Steg E4 implementerar sex smala, typade tenantmutationer som returnerar den
skapade eller uppdaterade tenant-raden. Create styr alla systemfält och skapar
revision ett. Update ändrar endast den fullständigt angivna målbilden för
organisationsnummer, juridiskt namn, kontaktfält och administrativ notering.
Kategori och övriga systemfält kan inte skickas av klienten.

Pause, activate, archive och restore är separata operationer. Alla operationer
utom create använder expected revision och `FOR UPDATE`; stale revision ger
`conflict` före statekontroll. Restore sätter status active enligt den låsta
livscykeln, medan archive bevarar aktuell status.

Tenantändring och auditinsert är atomiska. Endast `authenticated` har EXECUTE,
men varje funktion omprövar singleton-owner och binder actor till `auth.uid()`.
AAL2 ligger fortsatt i serverguarden och ingen audit-read-funktion införs i E4.

Steg E5 inför `list_tenant_audit_events` som den enda ownerkontrollerade
auditläsningen. Kontraktet använder obligatoriskt tenant-ID, nyast-först
cursorpagination på `(occurred_at, id)`, default 50 och maximum 100. Cursor är
ett typat timestamp/UUID-par och måste tillhöra samma tenant.

Returen innehåller auditens nio metadatafält, `has_more` och ett nullable nästa
cursorpar. Ingen total count och inga event-, actor-, tids- eller
correlationfilter införs. Direkt audit-SELECT och auditpolicies förblir
förbjudna.

Steg E6 inför en strikt server-only uppdelning mellan repository och service.
Repositoryt tar en request-lokal, cookie-baserad Supabase SSR-klient och kapslar
endast de låsta tenantfrågorna och RPC-anropen. Servicen anropar
`requireOwnerIntegrity()` exakt en gång före repositoryåtkomst, validerar input
och rå DB-output samt mappar snake_case till ett immutable camelCase-kontrakt.

Listan omfattar endast icke-arkiverade tenants sorterade på `legal_name, id`;
detail kan läsa arkiverade tenants. Sökning, filter, listpagination och total
count införs inte. Auditreturen är `{ items, hasMore, nextCursor }`.
Applikationsfelen är `unauthorized`, `not_found`, `conflict`,
`invalid_state_transition`, `validation_error`, `audit_failure` och
`unexpected_error`. Råa PostgREST-/SQL-fel lämnar aldrig servicegränsen.

Guarden verkställer session, ownerintegritet och AAL2. Databasen omprövar owner
via grants, RLS och RPC som defense in depth. Ingen Service Role, route, server
action eller UI ingår i E6.

Steg E7A exponerar server-only JSON `GET`-routes under `/api/tenants`,
`/api/tenants/[tenantId]` och `/api/tenants/[tenantId]/audit`. Route handlers
anropar endast E6:s servicefunktioner; Supabase, repository, RPC, mapping och
ownerkontroll dupliceras inte.

Listan returnerar servicens icke-arkiverade, deterministiskt sorterade array.
Detail returnerar en tenant och kan inkludera arkiverad tenant. Audit tar
valfri `pageSize` och ett separat, valfritt
`cursorOccurredAt`/`cursorId`-par och returnerar exakt
`{ items, hasMore, nextCursor }`. Inga extra filter eller total count införs.

Routes är `force-dynamic`, har `revalidate = 0` och sätter
`Cache-Control: private, no-store, max-age=0`. Servicefel mappas till stabila
JSON-koder: unauthorized 403, not found 404, conflict/state conflict 409,
validation 422 och interna/auditfel 500. Befintliga Next-redirects från
auth-/ownerguarden bevaras. Inga mutation routes, actions eller UI ingår.

Steg E7B inför sex separata Server Actions i `app/tenants/actions.ts` och en
injicerbar action-core under `lib/server/tenants`. Varje action anropar exakt
motsvarande E6-serviceoperation. En klientstyrd operation/eventtyp eller
generell mutation action är förbjuden.

Actiongränsen tar `FormData`, trimmar strängar, normaliserar tomma nullable fält
till null och kräver positiv decimal expected revision. Befintliga
servicevalidatorer verkställer UUID, kategori, organisationsnummer och
textgränser. Okända fält följer befintlig actionstandard och ignoreras; därför
kan systemfält, actor, event, target status och revision-after aldrig skickas
vidare.

Correlation-ID tas inte från formuläret. Ett kryptografiskt UUID skapas
server-side exakt efter godkänd boundaryvalidering och skickas till servicen.
Actionresultatet är antingen `{ ok: true, tenantId, revision }` eller
`{ ok: false, code, message }` med allowlistad servicekod och säker text.
Framework-control-flow återkastas med `unstable_rethrow`.

Next Server Actions inbyggda same-origin/origin-kontroll är E7B:s CSRF-gräns;
ingen egen tokenmodell och inga JSON mutation endpoints införs. Framtida
tenant-UI-paths och UX-redirects är inte låsta, så E7B utför ingen redirect,
`revalidatePath` eller `revalidateTag`. Detta kopplas först i E8 efter
pathbeslut och får endast ske efter lyckad mutation.

Steg E8A låser tenantlistans UI-path till `/tenants` och detail till
`/tenants/[tenantId]`. Båda är dynamiska Server Components och laddar initial
data direkt genom E6-servicen. De anropar inte E7A-routes via intern HTTP och
skapar ingen browserklient eller klientcache.

Listan visar endast icke-arkiverade tenants i servicens ordning med juridiskt
namn, presentationsformaterat organisationsnummer, kategori, operativ status,
kontaktperson och uppdateringstid. Ingen sökning, filtrering, pagination, total
count eller create-kontroll införs.

Detail visar identitet, kontakt, operativ status, arkiveringsstatus, revision,
administrativ notering och metadata. Arkiverad tenant stöds och markeras med
text. Status använder `StatusText`, aldrig badge eller enbart färg. Actor-UUID
exponeras inte; rollen visas som `Verifierad owner` eftersom DB binder samtliga
actorfält men inget säkert visningsnamn finns.

Global navigation ändras inte eftersom informationsarkitekturen ännu inte är
låst. Modulintern navigation sker genom listans detail-länkar och en
tillbaka-länk. E8A anropar inga mutation actions och läser ingen audit.

Steg E8B låser createpath till `/tenants/new` och editpath till
`/tenants/[tenantId]/edit`. Create och update använder endast E7B:s separata
Server Actions. Serverpages laddar eller verifierar owner på servern; den enda
Client Component-gränsen hanterar formulärstate och pending.

Actionresultatet utökas bakåtkompatibelt med optional allowlistade
`fieldErrors`. Boundaryfel kopplas till kategori, organisationsnummer,
juridiskt namn, kontaktfält, notering eller expected revision. Service-/DB-fel
som inte säkert kan knytas till ett fält visas på formulärnivå. Conflict
innehåller aldrig faktisk DB-revision och utlöser ingen retry eller overwrite.

Create exponerar endast kategori och de sex verksamhetsfälten. Edit visar
kategori och SE skrivskyddat, skickar full målbild och bär laddad revision som
dold men fortsatt opålitlig input. Arkiverad tenant kan visas men får inget
editformulär. Formuläret innehåller inga status-, actor-, event-, arkiv- eller
auditfält.

Efter `ok: true` revaliderar create/update endast `/tenants` och relevant
`/tenants/[tenantId]`, därefter redirectar servern till detail. Inget sådant sker
vid validation, conflict, invalid state, audit failure eller unexpected error.

Steg E8C inför state-specifika livscykelkontroller på tenantdetail. Active visar
pause/archive, paused visar activate/archive och arkiverad visar endast restore.
Client Component-gränsen importerar endast E7B:s fyra separata actions och
skickar tenant-ID samt expected revision, aldrig target status eller eventtyp.

Alla operationer kräver native dialogbekräftelse. Pause och activate presenteras
som reversibla normala åtgärder. Restore förklarar att tenant återgår som active.
Archive är visuellt separerad, destruktivt formgiven och beskriver uttryckligen
att tenant tas bort från aktiva listan men inte raderas.

Efter `ok: true` revalideras endast `/tenants` och aktuell detailpath, varefter
servern redirectar till samma detail. Det gäller även archive så att den
arkiverade detailvyn och restore förblir nåbara. Conflict, invalid state och
övriga fel stannar i dialogen utan retry, overwrite, revalidation eller
redirect.

Varje kontroll har separat pending-state. Native dialog sköter Escape;
Avbryt fokuseras vid öppning och fokus återgår till triggern vid stängning.
Status visas fortsatt som text och E8C läser ingen audit.

Steg E8D placerar tenantens `Händelsehistorik` direkt på
`/tenants/[tenantId]`; ingen separat route införs. Initiala 25 poster hämtas
server-side direkt genom `listTenantAuditEvents()`. Endast den minimala
load-more-gränsen är klientbaserad och anropar E7A:s audit-GET med det kompletta
cursorpar som föregående verifierade svar returnerade.

Historiken är en semantisk lista i `occurred_at DESC, id DESC`. Svenska labels
används för de sex eventtyperna och E3:s samtliga allowlistade changed-fields.
Create visas som `Revision 1`, övriga som `Revision före → efter`. Actor visas
som `Verifierad owner`; actor-UUID, audit-ID och correlation-ID renderas inte.
Tidigare/nya verksamhetsvärden finns inte i presentationen.

Ingen total count, URL-cursor, offset, filtrering, sökning, export, retention
eller backup införs. Arkiverade tenants behåller historiken.

Bootstrap och recovery regleras i [Owner-bootstrap](OWNER_BOOTSTRAP.md) och [Databas-recovery](DATABASE_RECOVERY.md).

F1 låser owner-bootstrap som en miljöspecifik administrativ driftoperation, inte
som ownerdatamigration. En mekanismmigration skapar två postgres-only,
security-invoker-funktioner i det icke-exponerade `private`-schemat. Ingen
owneridentitet finns i migrationen.

Bootstrap kräver existerande Auth-user och explicit UUID. Tom singleton fylls,
samma owner ger idempotent success utan write och annan owner ger
`owner_mismatch` utan takeover. Local-only CLI kräver explicit target och
bekräftelse; staging/production använder kortlivad direkt DB-adminåtkomst.
Service Role, HTTP, UI, automatisk discovery och owner-switch är förbjudna.

MFA-enrollment ska initieras server-side när en autentiserad AAL1-owner når
`/auth/mfa/enroll`; ett initialt null-state med en ensam startknapp är inte ett
giltigt enrollmentflöde. Supabase är ensam källa för QR-data och setup secret.

Eftersom en overifierad factors secret inte kan återläsas ska normal refresh
kontrollerat unenrolla den overifierade TOTP-faktorn och skapa exakt en ny.
Verifiering använder factor challenge och verify, läser därefter assurance level
och redirectar till den fasta interna routen `/tenants` endast vid `aal2`.
Query-styrda return paths införs inte.

F2A låser Control Centers permanenta informationsarkitektur till en gemensam
server-renderad applikationsram med vänstersida, toppheader och ett enda
huvudinnehåll. Ramen är generell och domänoberoende; Tenant Management ansluts
genom en tunn layout utan duplicerad global markup eller ändrad tenantlogik.
Auth- och MFA-routes ligger utanför ramen och deras guards påverkas inte.

Modulordningen är Dashboard, Tenants, Installations, Licenses, Provisioning,
Monitoring och Settings. Endast implementerade moduler får vara interaktiva.
F2A länkar därför endast Tenants och visar övriga som icke-interaktiv
`Kommer senare`-text. Inga tomma routes eller placeholder-sidor skapas.
Aktiv modul markeras med text och `aria-current`, aldrig badge eller enbart
färg. Root `/` serverredirectar fast till den första tillgängliga modulen
`/tenants`.

F2C6A låser installationslistans serverinterna databaskontrakt till
`list_installations`. Läsningen är owner-only och använder keyset-pagination
på `(display_name ASC, id ASC)`, standardsida 50 och max 100. Cursorposten
valideras mot samma filterkontext innan nästa sida läses.

Tenant, environment, administrativ status, archived-läge och en
case-insensitive bokstavlig sökning är de enda filtren. Sökningen omfattar
endast installationens display name och installation code; tenantens legal name
och application host är medvetet uteslutna. Full URL, project ref, hosting
region och intern notering får inte påverka träffresultatet.

Listan returnerar allowlistad metadata, tenantens legal name och hostdelen av
application URL trots att de två senare inte är sökbara. Befintliga index
bedöms tillräckliga; inga nya index, DAL/service, routes, actions eller UI
införs.

## Arbetssätt

### Analys före implementation

Varje förändring ska börja med analys av syfte, avgränsning, dataflöden, behörigheter, risker och verifieringskriterier. Implementation får påbörjas först när analysen ger ett tillräckligt beslutsunderlag.

Säkerhetskontroller ska identifieras och dokumenteras innan varje ny funktion implementeras.

### Små verifierbara implementationer

Förändringar ska delas upp i små, tydligt avgränsade leveranser. Varje leverans ska kunna granskas, testas och återställas utan att vara beroende av orelaterade förändringar.

### Server-first

Säkerhetskritisk logik, verifiering, auktorisering och kommunikation med andra system ska utformas server-first. Klienten ska betraktas som en opålitlig anropsyta.

### Security Pass

En modul får inte låsas eller betraktas som färdig innan en dokumenterad Security Pass har genomförts. Den ska minst omfatta autentisering, auktorisering, dataåtkomst, validering, loggning, secrets, sessioner och felhantering där dessa områden är tillämpliga.

## Relaterade dokument

- [Security Standard](SECURITY_STANDARD.md)
- [UI Standard](UI_STANDARD.md)
- [Control Center Roadmap](CONTROL_CENTER_ROADMAP.md)
- [Module Status](MODULE_STATUS.md)
- [Changelog](CHANGELOG.md)
- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Owner-bootstrap](OWNER_BOOTSTRAP.md)
- [Databas-recovery](DATABASE_RECOVERY.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
