# Control Center Roadmap

## Syfte

Roadmapen anger avsedd ordning för analys och framtida implementation. En fas får delas upp i mindre verifierbara leveranser och ska genomgå Security Pass innan den låses.

## Faser

### Fas 0 – Teknisk grund

Etablera den minimala tekniska baslinjen, dokumentationsstrukturen och verifierbara kvalitetskontroller.

### Fas 1 – Intern autentisering

Etablera säker intern inloggning, MFA, sessionshantering och kontrollerad bootstrap för behöriga interna användare.

### Fas 2 – Kundregister

Etablera ett minimalt register över kunder utan att lagra kundernas affärsdata.

### Fas 3 – Installationer

Representera separata kundinstallationer och deras tekniska identitet utan generell direktåtkomst till kunddatabaser.

### Fas 4 – Licenser

Hantera licensstatus, omfattning och giltighet med tydlig historik och auktorisering.

### Fas 5 – Versioner

Hantera tillgängliga och installerade versioner samt verifierad versionsinformation per installation.

### Fas 6 – Health och drift

Presentera verifierad hälsa, driftsstatus och relevanta avvikelser via avgränsade server-API:er.

### Fas 7 – Support

Stöd interna supportflöden med explicit behörighet, spårbarhet och minimerad dataåtkomst.

### Fas 8 – Backup

Synliggör verifierad backupstatus och kontrollerade återställningsflöden utan central lagring av kundernas affärsdata.

### Fas 9 – Billing

Hantera avgränsad faktureringsinformation och relaterade interna arbetsflöden enligt minsta privilegium.

## Styrning

Varje fas kräver analys före implementation, definierade verifieringskriterier och uppdaterad [modulstatus](MODULE_STATUS.md). Säkerhetskraven i [Security Standard](SECURITY_STANDARD.md) gäller genom hela roadmapen.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)
- [Changelog](CHANGELOG.md)
