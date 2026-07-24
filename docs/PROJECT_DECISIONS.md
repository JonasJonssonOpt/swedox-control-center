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

Bootstrap och recovery regleras i [Owner-bootstrap](OWNER_BOOTSTRAP.md) och [Databas-recovery](DATABASE_RECOVERY.md).

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
