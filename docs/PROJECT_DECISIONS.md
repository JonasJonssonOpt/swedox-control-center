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

## Arbetssätt

### Analys före implementation

Varje förändring ska börja med analys av syfte, avgränsning, dataflöden, behörigheter, risker och verifieringskriterier. Implementation får påbörjas först när analysen ger ett tillräckligt beslutsunderlag.

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
