# Security Standard

## Syfte

Denna standard anger obligatoriska säkerhetsprinciper för SweDox Control Center. Kraven ska tillämpas i analys, implementation, granskning och Security Pass.

## Grundprinciper

### Server-side verifiering

All säkerhetskritisk input, identitet, behörighet och dataåtkomst ska verifieras på servern. Klientvalidering får endast användas för användarupplevelse och ersätter aldrig server-side verifiering.

### Authentication och Authorization

Authentication fastställer vem aktören är. Authorization fastställer vad den identifierade aktören får göra. Kontrollerna ska vara separata, explicita och utföras för varje skyddad operation.

I version 1 ska authentication ske med e-post och lösenord via Supabase Auth. Authorization ska separat verifiera att det enda tillåtna kontot har aktiv `owner`-behörighet. Behörighet får inte hämtas från klientstyrd metadata.

### Minsta privilegium

Användare, tjänster, API-nycklar och processer ska endast få den minsta behörighet som krävs för den aktuella uppgiften, under kortast möjliga tid och inom minsta möjliga datamängd.

### MFA

Intern åtkomst till Control Center ska alltid kräva TOTP-MFA med Microsoft Authenticator. Alla skyddade routes och serveroperationer ska verifiera den aktuella MFA-nivån på servern. SMS-MFA ska inte användas.

Control Center ska inte skapa egna recovery codes. Förlorad MFA-åtkomst ska hanteras genom en dokumenterad manuell rutin via Supabase. Rutinen ska verifiera ägarens identitet, återkalla berörda sessioner och vara auditerbar. En extra registrerad TOTP-enhet kan senare övervägas som reserv, men ingår inte som krav i version 1.

### RLS

När en databas senare införs ska Row Level Security användas som ett obligatoriskt skyddslager för exponerade tabeller. Policies ska utgå från nekad åtkomst och öppna endast dokumenterade operationer. RLS ersätter inte server-side auktorisering.

### Service Role

Service Role eller motsvarande privilegierad credential får aldrig exponeras i klientkod, webbläsare, mobilklient eller annan opålitlig miljö. Privilegierade operationer får endast utföras i kontrollerad servermiljö.

### Kundinstallationernas databaser

Control Center får inte ha generell direktåtkomst till kundinstallationernas databaser. Det får inte finnas centrala databascredentials som möjliggör sådan åtkomst.

### API-baserad kommunikation

Kommunikation med kundinstallationer ska ske genom verifierade server-API:er. Anrop ska autentiseras, auktoriseras, valideras, begränsas till ett tydligt syfte och använda minsta möjliga behörighet.

## Operativ säkerhet

### Audit

Säkerhetsrelevanta händelser ska ge spårbara audit-poster med aktör, operation, mål, tidpunkt och resultat. Audit-data ska skyddas mot manipulation och får inte innehålla secrets eller onödig affärsdata.

### Secrets

Secrets får aldrig lagras i källkod, dokumentation, klientkod eller loggar. De ska hanteras i en avsedd secret-hantering, roteras, kunna återkallas och avgränsas per miljö och ändamål.

### Sessioner

Sessioner ska vara cookiebaserade, serverhanterade och använda PKCE. De ska vara tidsbegränsade, säkert lagrade och möjliga att återkalla. Förnyelse, utloggning, inaktivitet och känsliga operationer ska hanteras explicit.

En sessions existens innebär inte automatiskt behörighet till en operation. Varje skyddad route och serveroperation ska på servern verifiera identitet, MFA-nivå och aktiv `owner`-behörighet.

### Bootstrap-principer

Initial etablering av det enda `owner`-kontot ska vara avgränsad, engångsbetonad och auditerbar. Bootstrap får inte skapa permanenta bakdörrar, generella standardcredentials, självregistrering eller en dold väg för att skapa ytterligare konton. Efter etablering ska bootstrap-vägen stängas eller göras obrukbar, och ägaren ska omfattas av obligatorisk TOTP-MFA och ordinarie server-side auktorisering.

## Omfattning och framtida utbyggnad

Version 1 omfattar ett konto och rollen `owner`. Användaradministration, invitationer, SSO och rollerna `admin` och `super_admin` ska inte implementeras.

En framtida modell med flera interna administratörer kan analyseras separat. Den kräver nya beslut om invitationer, livscykelhantering, separation of duties, recovery och rollbehörigheter innan implementation.

## Efterlevnad

Säkerhetskontroller ska identifieras innan varje ny funktion implementeras. Avvikelser kräver dokumenterad riskbedömning, tydlig ägare, tidsgräns och godkännande innan implementation. En modul får inte låsas förrän dess Security Pass är godkänd.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)

Verifierat:
- SSR-session etableras korrekt efter lyckad autentisering.
- Ingen känslig information loggas vid misslyckad inloggning.
- Generiska felmeddelanden används mot klient.
- Nästa steg är serverbaserad owner-verifiering följt av MFA.