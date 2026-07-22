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
