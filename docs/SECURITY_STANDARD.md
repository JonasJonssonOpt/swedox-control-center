# Security Standard

## Syfte

Denna standard anger obligatoriska säkerhetsprinciper för SweDox Control Center. Kraven ska tillämpas i analys, implementation, granskning och Security Pass.

## Grundprinciper

### Server-side verifiering

All säkerhetskritisk input, identitet, behörighet och dataåtkomst ska verifieras på servern. Klientvalidering får endast användas för användarupplevelse och ersätter aldrig server-side verifiering.

### Authentication och Authorization

Authentication fastställer vem aktören är. Authorization fastställer vad den identifierade aktören får göra. Kontrollerna ska vara separata, explicita och utföras för varje skyddad operation.

I version 1 ska authentication ske med e-post och lösenord via Supabase Auth. Authorization ska separat verifiera att det enda tillåtna kontot har aktiv `owner`-behörighet. Behörighet får inte hämtas från klientstyrd metadata.

Självregistrering och anonymous sign-in ska vara avstängda. Den verifierade Auth-användarens UUID ska matcha det exakt konfigurerade, miljöspecifika owner-ID:t. En annan authenticated användare får aldrig behandlas som owner.

### Minsta privilegium

Användare, tjänster, API-nycklar och processer ska endast få den minsta behörighet som krävs för den aktuella uppgiften, under kortast möjliga tid och inom minsta möjliga datamängd.

### MFA

Intern åtkomst till Control Center ska alltid kräva TOTP-MFA med Microsoft Authenticator. Alla skyddade routes och serveroperationer ska verifiera den aktuella MFA-nivån på servern. SMS-MFA ska inte användas.

Control Center ska inte skapa egna recovery codes. Förlorad MFA-åtkomst ska hanteras genom en dokumenterad manuell rutin via Supabase. Rutinen ska verifiera ägarens identitet, återkalla berörda sessioner och vara auditerbar. En extra registrerad TOTP-enhet kan senare övervägas som reserv, men ingår inte som krav i version 1.

MFA-enrollment för en autentiserad AAL1-owner initieras server-side på
`/auth/mfa/enroll`. QR-kod och manuell setup-nyckel kommer uteslutande från
Supabase `mfa.enroll()` och får endast finnas i den aktuella autentiserade
sidans state. De får aldrig loggas eller transporteras i URL.

En overifierad TOTP-factor saknar återläsningsbar secret. Vid normal refresh
unenrollas därför den overifierade faktorn kontrollerat innan en ny enrollment
skapas. Verifierad factor skapar ingen ny enrollment utan går till challenge.
Challenge och verify måste lyckas och sessionens `currentLevel` måste därefter
vara `aal2` innan fast intern redirect till `/tenants`. Råa Supabasefel maskeras.

### RLS

När en databas senare införs ska Row Level Security användas som ett obligatoriskt skyddslager för exponerade tabeller. Policies ska utgå från nekad åtkomst och öppna endast dokumenterade operationer. RLS ersätter inte server-side auktorisering.

Tenant Management ska dessutom följa dessa krav:

- varje skyddad route och mutation kräver `requireFullAccessOwner()` och `aal2`
- RLS jämför framtida tenantåtkomst mot samma owneridentitet genom en skyddad DB-singleton
- mismatch mellan environment och databas stoppar modulen fail-closed
- browserklienten utför inte tenant-CRUD
- actorfält som `created_by`, `updated_by` och `archived_by` får inte styras av klienten
- permanent delete ska nekas

`public.control_center_owner` har RLS och FORCE RLS aktiverat utan tillåtande
policies. `PUBLIC`, `anon`, `authenticated` och `service_role` saknar direkt
tabellåtkomst. Därmed får inte heller en normal owner-session läsa singletonen
direkt. `public.get_owner_integrity_status()` är en argumentlös
`SECURITY DEFINER` med ägare `postgres`, fast `search_path = pg_catalog`,
schema-kvalificerade objekt och kategorisk textretur utan UUID. `PUBLIC`, `anon`
och `service_role` saknar EXECUTE medan `authenticated` får EXECUTE. Funktionen
sväljer inte tekniska fel; framtida appintegration ska mappa dem till unavailable.

Serverintegrationen ligger endast under `lib/server/auth/`, importerar
`server-only` och använder den cookiebaserade SSR-klienten, aldrig browser- eller
Service Role-klient. RPC-resultat allowlistas exakt; null, okänd status, oväntad
form och tekniskt fel failar stängt. Loggning får endast innehålla säker kategori,
tidpunkt och correlation-id, aldrig UUID, raw environment, session eller raw
Supabase-fel.

Tenanttabellens E1-grund lämnas utan RLS och policies tills det separata
RLS-steget är granskat. Under mellanläget är tabellåtkomst fail-closed genom att
`PUBLIC`, `anon`, `authenticated` och `service_role` saknar tabellprivilegier.
Ingen Service Role används av applikationen. Canonical format, Luhn, kategori,
status, arkivmetadata, revision och textgränser verkställs i databasen som sista
skyddslager även när framtida appvalidering finns.

Installationstabellens F2C1-grund följer samma isolerade fail-closed-princip.
F2C2 aktiverar RLS och FORCE RLS och ger `authenticated` endast SELECT. Exakt en
SELECT-policy återanvänder den argumentlösa, informationsminimerade
`public.is_control_center_owner()`. `PUBLIC`, `anon` och `service_role` saknar
tabellprivilegier och samtliga API-roller saknar direkta writes. Lokal
`service_role` kan ha BYPASSRLS som plattformsegenskap men saknar verksamhetsgrant
och används inte i appkod.

Ownerpolicyn omfattar alla aktiva och arkiverade installationsrader, även när
tenant är arkiverad. Den gör ingen tenantjoin och bedömer inte tenantstatus.
Authenticated non-owner, null auth, saknad singleton och mismatch returnerar
noll rader. Tenant availability ska senare verkställas atomiskt i
mutationsfunktionerna.

F2C3:s `public.installation_audit_events` lagrar endast installationsägd
mutationsmetadata: installation, eventtyp, actor UUID, tid, revisioner,
allowlistade fältnamn och valfri correlation UUID. Business values, snapshots,
JSON, endpoints, project refs, noteringar, credentials, requestpayloads och
providerfel är förbjudna. Actor saknar Auth-FK så historiken består efter
Auth-userns livscykel.

Audit är append-only genom både privilege/RLS-lager och en trigger som blockerar
UPDATE/DELETE med stabil SQLSTATE. Tabellen har RLS och FORCE RLS, noll policies
och noll direkta grants för samtliga API-roller, inklusive `service_role`.
F2C3 skapar ingen publik insert- eller readfunktion. Audit får senare endast
skrivas atomiskt av installationsmutationerna och läsas genom en separat
ownerkontrollerad RPC.

F2C4:s sju installationsmutationer omprövar den giltiga singleton-ownern i varje
anrop och binder actorfält till `auth.uid()`; actor, target status, revision
after, timestamps och archivemetadata kan inte skickas av klienten. AAL2 ligger
fortsatt i serverguarden och ersätts inte av en ny DB-modell.

Mutationerna kräver active, icke arkiverad tenant, låser installationsraden och
kontrollerar expected revision före state. Installation och exakt en
metadata-only auditpost skrivs i samma transaktion; auditfel rullar tillbaka hela
ändringen. `authenticated` har endast EXECUTE på de sju smala RPC:erna. Direkta
installation- och auditwrites är fortsatt blockerade, writepolicies saknas och
`service_role` saknar EXECUTE.

F2C5:s installationsaudit-read återanvänder samma ownerhelper i en smal
`SECURITY DEFINER`-RPC. Funktionen kräver installation-ID, begränsad sidstorlek
och en fullständig installationbunden timestamp/UUID-cursor. Den returnerar
endast auditmetadata och pagineringsstatus. Non-owner, null auth och saknad
singleton failar stängt.

`authenticated` har EXECUTE endast på RPC:n och får fortsatt inte SELECT på
audittabellen. `PUBLIC`, `anon` och `service_role` saknar EXECUTE. Audit-RLS,
FORCE RLS, noll policies och noll direkta grants är oförändrade.

Databasconstraints verkställer tenant-FK med delete restrict, canonical och unik
installation code, canonical och partiellt unik Supabase project ref, säker
HTTPS-metadata utan credentials eller fragment, positiv revision och konsekvent
archivemetadata. Project ref, URL och administrativ notering är skyddsvärda och
får inte förekomma i generell loggning. URL:en får inte hämtas eller användas som
monitoringtarget utan en separat SSRF- och outbound-request-granskning.

Steg E2 gör RLS och FORCE RLS till tenanttabellens obligatoriska åtkomstlager.
`authenticated` har endast SELECT; `PUBLIC`, `anon` och `service_role` saknar
tenantprivilegier och inga normala roller har direkta skrivgrants. En enda
SELECT-policy använder den booleska, informationsminimerade
`public.is_control_center_owner()`. Helpern returnerar endast sant eller falskt,
exponerar aldrig owner-ID och failar stängt vid null auth, saknad singleton eller
mismatch. Arkiverade tenants omfattas av samma owner-läsning. Inga
skrivpolicies finns, och Service Role ingår inte i verksamhetsflödet.

### Service Role

Service Role eller motsvarande privilegierad credential får aldrig exponeras i klientkod, webbläsare, mobilklient eller annan opålitlig miljö. Privilegierade operationer får endast utföras i kontrollerad servermiljö.

Service Role får inte användas för normal tenant-CRUD eller för att kringgå RLS. Miljöspecifik bootstrap och recovery är separata, avgränsade och auditerade driftoperationer.

### Owner-bootstrap

Owner-bootstrap är en separat administrativ DB-operation utan HTTP-, UI-,
Server Action- eller API-rollsyta. Mekanismen ligger i schemat `private`, ägs av
`postgres`, körs som security invoker och saknar EXECUTE för `PUBLIC`, `anon`,
`authenticated` och `service_role`.

Endast en redan existerande, identitetsverifierad Auth-user får kopplas. Tom
singleton kan fyllas, samma owner är idempotent och annan owner ger hard fail
utan overwrite. Automatisk owner discovery, första-user-logik, takeover och
signupändring är förbjudna.

Samma UUID ska sättas som server-secret och DB-owner. D3 kräver dessutom
matchande Auth-session och AAL2. Bootstrapcredential är kortlivad
DB-administration, får inte lagras eller loggas och är aldrig en runtime-
eller Service Role-väg. Recovery/ownerbyte kräver separat incidentprocess.

### Kundinstallationernas databaser

Control Center får inte ha generell direktåtkomst till kundinstallationernas databaser. Det får inte finnas centrala databascredentials som möjliggör sådan åtkomst.

### API-baserad kommunikation

Kommunikation med kundinstallationer ska ske genom verifierade server-API:er. Anrop ska autentiseras, auktoriseras, valideras, begränsas till ett tydligt syfte och använda minsta möjliga behörighet.

## Operativ säkerhet

### Audit

Säkerhetsrelevanta händelser ska ge spårbara audit-poster med aktör, operation, mål, tidpunkt och resultat. Audit-data ska skyddas mot manipulation och får inte innehålla secrets eller onödig affärsdata.

Tekniska loggar och generell audit får inte innehålla kontaktuppgifter, organisationsnummer, administrativ notering, credentials eller råa Auth- och databasfel. Beständig och atomisk tenant-audit krävs före första pilot med verkliga kunddata.

Steg E3:s `public.tenant_audit_events` lagrar endast strukturerad metadata och
ändrade fältnamn, aldrig verksamhetsvärden eller requestinnehåll. Tenantkopplingen
använder delete restrict och actor saknar Auth-FK så att auditspåret inte
kaskadreras bort. Revisioner är positiva, sammanhängande och unika per tenant.
UPDATE och DELETE stoppas av en append-only-trigger.

Audit-tabellen har RLS och FORCE RLS utan policies. `PUBLIC`, `anon`,
`authenticated` och `service_role` saknar alla direkta tabellprivilegier. E3
skapar ingen publik insert- eller read-funktion. Endast framtida smala
security-definer-mutationer får skriva en auditpost atomiskt med tenantändringen;
ownerläsning ska ske genom en separat paginerad, ownerkontrollerad funktion.

Steg E4:s sex tenantmutationer är `SECURITY DEFINER`, ägs av `postgres`, har
`search_path = pg_catalog`, schema-kvalificerade databasobjekt och EXECUTE endast
för `authenticated`. Varje anrop kräver att `auth.uid()` är den giltiga
singleton-ownern. Actor och samtliga systemfält sätts i databasen; direkt
INSERT/UPDATE/DELETE på tenant- och audittabellerna förblir nekat.

Alla mutationer utom create använder radlås och expected revision. Lyckad
tenantändring och exakt en auditpost sker i samma transaktion; auditfel rollbackar
tenantändringen. Felen är kategoriska och innehåller inga UUID:n eller
verksamhetsvärden.

Databaskontrollen bevisar inte AAL2. Obligatorisk AAL2 och full
environment/Auth/DB equality ska fortsatt verkställas av
`requireOwnerIntegrity()` innan en framtida serverväg anropar RPC:n. Direkt
RPC-åtkomst för en kapad owner-session är därför en kvarvarande risk tills
applikationsgränsen är kopplad.

Steg E5:s `public.list_tenant_audit_events()` är den enda tillåtna
auditläsningsgränsen. Den är `STABLE SECURITY DEFINER`, omprövar owner innan
tenant- eller cursoruppslag och har EXECUTE endast för `authenticated`.
Tenant-ID är obligatoriskt och en cursor accepteras endast när både timestamp och
UUID motsvarar ett event för samma tenant.

Direkt SELECT på audit-tabellen förblir nekat och inga RLS-policies har skapats.
Funktionen returnerar endast auditmetadata och paginationstillstånd, aldrig
tenantens verksamhetsfält, total count, ownerdata eller intern diagnos. AAL2 och
environment-equality ligger fortsatt i serverguarden.

Steg E6:s publika tenantservice är den enda avsedda applikationsgränsen för
framtida routes och actions. Varje serviceoperation kör
`requireOwnerIntegrity()` före DAL-anrop och skapar därefter en request-lokal
Supabase SSR-klient från den verifierade cookiebaserade sessionen. Klienten
cachelagras inte globalt.

Serverguarden ansvarar för autentisering, owner-equality, AAL2 och fail-closed
integritet. DB-grants, tenant-RLS och ownerkontroll i RPC omprövar åtkomsten.
Detta är defense in depth; inget av lagren ersätter ett annat. Service Role,
browserklient, direkta tenantwrites och direkt auditåtkomst är förbjudna.

All input och rå DB-output valideras. Felaktiga rows, nullable RPC-fält,
cursorpar eller cross-tenant auditresultat stoppas. Endast stabila servicekoder
lämnar gränsen; oväntade fel loggas med kod, korrelations-ID, event och
timestamp utan SQL-detaljer, auth claims, owner-ID eller verksamhetsdata.

Steg E7A:s tenant read routes får endast importera och anropa tenantservicen.
Dataflödet är route → service → repository → request-lokal Supabase SSR →
RLS/RPC. Route handlers får inte skapa egen ownerkontroll, Supabase-klient,
direkt query eller RPC.

Routes är dynamiska utan revalidation och varje JSON-svar är
`private, no-store`. Därmed får tenant- eller auditdata inte delas genom
cross-request cache. Query- och routeparametrar förs till servicegränsens
runtimevalidering, som sker efter ownerguarden. Ett ofullständigt auditcursorpar
nekas som `validation_error`.

Stabila servicefel mappas till en status och en enda felkod. Okända fel
återges som `unexpected_error`; råa exceptions, stack traces, SQL-detaljer,
claims, owner-ID och kontaktuppgifter får inte ingå. Nexts kontrollflödesfel
för auth- och säkerhetsredirects ska återkastas och får inte maskeras som 500.

Steg E7B:s tenantmutationer exponeras endast som Next Server Actions, aldrig som
POST-, PUT-, PATCH- eller DELETE-route handlers. Actions och deras core får
endast anropa tenantservicen. Supabase, repository, RPC, ownerkontroll, actor,
revisionökning och audit får inte dupliceras i actionlagret.

FormData-gränsen allowlistar endast respektive operations verksamhetsfält.
Okända fält ignoreras och vidarebefordras aldrig. Nullable text normaliseras
från tom sträng till null, expected revision måste vara ett positivt heltal och
E6:s validatorer körs som defense in depth. Correlation-ID genereras
server-side med kryptografiskt UUID; formulärvärden kan inte styra det.

Next Server Actions verifierade same-origin/origin-modell är den valda
CSRF-gränsen. En parallell egen token eller öppen JSON-mutationsyta får inte
införas utan nytt säkerhetsbeslut. Framework-redirects från ownerguard/AAL2
återkastas. Oväntade fel maskeras och loggas endast med kod, event och timestamp.

E7B utför ingen cacheinvalidiering eller redirect eftersom UI-paths ännu inte
är låsta. När detta införs får relevanta paths endast revalideras efter ett
lyckat serviceanrop; aldrig vid validation, conflict eller audit failure.

Steg E8A:s `/tenants` och `/tenants/[tenantId]` är dynamiska Server Components.
De får endast anropa tenantservicens `listTenants()` respektive
`getTenantById()`. Supabase, repository, RPC, read-route via intern HTTP och
browserklient är förbjudna i sidorna.

Servicen verkställer ownerintegritet och AAL2 före dataåtkomst; RLS omprövar
owner i databasen. Sidorna har `revalidate = 0` och får inte använda global
eller cross-request cache. Detail anropar inte auditservicen och inga
mutation actions kopplas till readkomponenterna.

Not-found presenteras utan tenant-ID. Oväntade fel går till en generell
error boundary utan stack, rå servicekod, kontaktfält eller identifierare.
Actor-UUID visas inte i UI; endast den verifierade rollen anges. Operativ och
arkiverad status kommuniceras som text och aldrig enbart med färg.

Steg E8B:s create/edit-formulär får endast anropa E7B:s create- respektive
update-action. Client Component-gränsen får inte importera tenantservice,
Supabase, repository, RPC eller livscykelactions. Next Server Actions
same-origin/origin-skydd är fortsatt CSRF-gräns.

Action-core validerar FormData server-side och returnerar endast allowlistade
fältfel. Browserattribut som required, maxlength och input type är kompletterande
och aldrig source of truth. Systemfält saknas i formuläret och ignoreras även om
de manipuleras in i requesten. Correlation-ID skapas fortsatt server-side.

Expected revision transporteras i hidden input för optimistic concurrency men
betraktas som opålitlig. Service och DB kräver positiv och aktuell revision.
Conflict får inte avslöja faktisk revision, retrya eller skriva över tyst.
Arkiverad tenant får ingen update-submit.

`revalidatePath` och redirect får endast köras efter `ok: true`. Endast
tenantlistan och relevant detailpath invalidieras. Framework-redirects från
ownerguard/AAL2 bevaras och råa action-, service- eller DB-fel exponeras inte.

Steg E8C:s lifecycle Client Component får endast importera pause-, activate-,
archive- och restore-actions. Den får inte importera service, Supabase,
repository, RPC eller auditread. Varje request innehåller endast tenant-ID och
expected revision; target status, actor och eventtyp kan inte klientstyras.

UI-state avgör endast vilken kontroll som visas. Service och DB omprövar
revision och state atomiskt. Manipulerad eller stale input ger conflict eller
invalid state och får aldrig retryas eller skrivas över automatiskt.

Archive kräver en explicit dialog som klargör att tenant inte raderas. Samtliga
operationer kräver bekräftelse, har separat pending-state och blockerar
dubbelsubmit. Revalidation och redirect sker endast efter `ok: true` och
omfattar endast lista/detail. Felresultat stannar utan cacheinvalidiering.

### Secrets

Secrets får aldrig lagras i källkod, dokumentation, klientkod eller loggar. De ska hanteras i en avsedd secret-hantering, roteras, kunna återkallas och avgränsas per miljö och ändamål.

### Lokal databas- och CLI-säkerhet

- Repositoryts Supabase-scripts ska vara local-only och använda explicit lokal target när CLI-kommandot kan välja target.
- Normalt utvecklings- och CI-flöde får inte innehålla remote project reference, access token, produktionsecrets eller Service Role.
- Länkade destruktiva kommandon är förbjudna utan separat godkännande och verifierad target.
- Lokala Auth-users, owneridentiteter och testdata ska vara syntetiska.
- Lokalt genererade credentials får inte skrivas till CI-logg eller versionshanteras.
- Den lokala stacken får endast köras på en betrodd maskin med aktivt brandväggsskydd och ska stoppas när den inte används.

### Installation list read

F2C6A:s installationslista är endast åtkomlig genom en postgresägd
`SECURITY DEFINER`-RPC som omprövar `is_control_center_owner()` för varje
anrop. Endast `authenticated` har EXECUTE; tabellens RLS, FORCE RLS och
befintliga direkta grants ändras inte.

Returkontraktet är allowlistat. Det innehåller listmetadata och en härledd
application host, men aldrig full URL, Supabase project ref, intern notering,
credentials eller providerpayload. Filter och cursor valideras i databasen
innan pagination; ogiltig eller filterfrämmande cursor stoppas kategoriskt.
Sökinput är längdbegränsad och `%` samt `_` har ingen wildcardbetydelse.
Sökvillkoret får endast använda display name och installation code. Tenant
legal name och application host är medvetet inte sökbara; full URL, project
ref, hosting region och intern notering får inte heller påverka träffresultatet.

### Sessioner

Sessioner ska vara cookiebaserade, serverhanterade och använda PKCE. De ska vara tidsbegränsade, säkert lagrade och möjliga att återkalla. Förnyelse, utloggning, inaktivitet och känsliga operationer ska hanteras explicit.

En sessions existens innebär inte automatiskt behörighet till en operation. Varje skyddad route och serveroperation ska på servern verifiera identitet, MFA-nivå och aktiv `owner`-behörighet.

### Bootstrap-principer

Initial etablering av det enda `owner`-kontot ska vara avgränsad, engångsbetonad och auditerbar. Bootstrap får inte skapa permanenta bakdörrar, generella standardcredentials, självregistrering eller en dold väg för att skapa ytterligare konton. Efter etablering ska bootstrap-vägen stängas eller göras obrukbar, och ägaren ska omfattas av obligatorisk TOTP-MFA och ordinarie server-side auktorisering.

Samma kontrollerade miljöinput ska etablera applikationens ownerkonfiguration och den framtida DB-singletonen. Saknad, ogiltig eller avvikande konfiguration ska neka tenantåtkomst utan fallback.

## Omfattning och framtida utbyggnad

Version 1 omfattar ett konto och rollen `owner`. Användaradministration, invitationer, SSO och rollerna `admin` och `super_admin` ska inte implementeras.

En framtida modell med flera interna administratörer kan analyseras separat. Den kräver nya beslut om invitationer, livscykelhantering, separation of duties, recovery och rollbehörigheter innan implementation.

## Efterlevnad

Säkerhetskontroller ska identifieras innan varje ny funktion implementeras. Avvikelser kräver dokumenterad riskbedömning, tydlig ägare, tidsgräns och godkännande innan implementation. En modul får inte låsas förrän dess Security Pass är godkänd.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)
- [Owner-bootstrap](OWNER_BOOTSTRAP.md)
- [Databas-recovery](DATABASE_RECOVERY.md)

Verifierat:

- SSR-session etableras korrekt efter lyckad autentisering.
- Ingen känslig information loggas vid misslyckad inloggning.
- Generiska felmeddelanden används mot klient.
- Serverbaserad owner-verifiering och obligatorisk MFA är implementerade.
- Owner-singletonens struktur och fail-closed tabellskydd är implementerade
  lokalt; bootstrap, equality och Tenant Management återstår.

## E8D security pass

E8D:s initiala auditläsning sker i tenantdetail genom E6:s
`listTenantAuditEvents()` och ärver därmed ownerintegritet, AAL2, request-lokal
SSR och databasens tenantbundna cursorverifiering. Load-more-komponenten får
endast anropa E7A:s no-store audit-GET. Ingen UI-kod importerar Supabase,
repository, RPC eller Service Role och ingen cross-request cache införs.

Klientgränsen accepterar endast komplett serverreturnerat cursorpar och
runtimevaliderar nästa sida, tenantkoppling, sortering och dubbletter före
append. Råa fel maskeras lokalt. UI-modellen tar bort actor-UUID,
correlation-ID och audit-ID före rendering och visar endast eventtyp, tid,
`Verifierad owner`, revision samt labels för ändrade fält. Inga
verksamhetsvärden, export-, retention- eller backupvägar skapas.
