# Security Standard

## Syfte

Denna standard anger obligatoriska säkerhetsprinciper för SweDox Control Center. Kraven ska tillämpas i analys, implementation, granskning och Security Pass.

## Grundprinciper

### Server-side verifiering

All säkerhetskritisk input, identitet, behörighet och dataåtkomst ska verifieras på servern. Klientvalidering får endast användas för användarupplevelse och ersätter aldrig server-side verifiering.

### Authentication och Authorization

Authentication fastställer vem aktören är. Authorization fastställer vad den identifierade aktören får göra. Kontrollerna ska vara separata, explicita och utföras för varje skyddad operation.

### Minsta privilegium

Användare, tjänster, API-nycklar och processer ska endast få den minsta behörighet som krävs för den aktuella uppgiften, under kortast möjliga tid och inom minsta möjliga datamängd.

### MFA

Intern åtkomst till Control Center ska skyddas med MFA. Återställning och reservmetoder ska hålla motsvarande säkerhetsnivå och vara auditerbara.

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

Sessioner ska vara tidsbegränsade, säkert lagrade och möjliga att återkalla. Förnyelse, utloggning, inaktivitet och känsliga operationer ska hanteras explicit. En sessions existens innebär inte automatiskt behörighet till en operation.

### Bootstrap-principer

Initial etablering av administrativ åtkomst ska vara avgränsad, engångsbetonad och auditerbar. Bootstrap får inte skapa permanenta bakdörrar eller generella standardcredentials. Efter etablering ska bootstrap-vägen stängas eller göras obrukbar, och den första administratören ska omfattas av MFA och ordinarie auktorisering.

## Efterlevnad

Avvikelser kräver dokumenterad riskbedömning, tydlig ägare, tidsgräns och godkännande innan implementation. En modul får inte låsas förrän dess Security Pass är godkänd.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)
