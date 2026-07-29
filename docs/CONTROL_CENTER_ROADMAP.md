# Control Center Roadmap

## Syfte

Roadmapen anger avsedd ordning för analys och framtida implementation. En fas får delas upp i mindre verifierbara leveranser och ska genomgå Security Pass innan den låses.

## Faser

### Fas 0 – Teknisk grund

Etablera den minimala tekniska baslinjen, dokumentationsstrukturen och verifierbara kvalitetskontroller.

### Fas 1 – Intern autentisering

Etablera version 1 för ägaren med exakt ett konto och rollen `owner`: e-post och lösenord via Supabase Auth, obligatorisk TOTP-MFA med Microsoft Authenticator samt cookiebaserade, serverhanterade PKCE-sessioner.

Fasen ska även omfatta avstängd självregistrering, kontrollerad bootstrap, server-side verifiering av identitet, MFA-nivå och aktiv `owner`-behörighet samt en dokumenterad manuell recoveryrutin via Supabase. Ingen användaradministration, invitation, SMS-MFA eller egna recovery codes ska införas.

SSO, flera interna administratörer, invitationer och roller som `admin` och `super_admin` är en möjlig framtida utbyggnad efter en separat analys. De är inte en del av fas 1 eller ett krav för version 1.

### Fas 2 – Kundregister

Etablera ett minimalt register över kunder utan att lagra kundernas affärsdata.

### Fas 3 – Installationer

Representera separata kundinstallationer och deras tekniska identitet utan generell direktåtkomst till kunddatabaser.

F2C1–F2C8D är implementerade och lokalverifierade från schema och ownerkontroll
till komplett administrations-UI och metadata-only audit history. F2C9:s
runtimeverifiering identifierade och korrigerade tre integrationsfel:
administrativ aktivering kopplad till provisioningmetadata, nullable metadata
i listan och implicit collation. F2C9C väntar deployment och efterföljande
runtimeverifiering; fasen är därför inte formellt stängd.

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

Varje fas kräver analys före implementation, identifierade säkerhetskontroller, definierade verifieringskriterier och uppdaterad [modulstatus](MODULE_STATUS.md). Säkerhetskraven i [Security Standard](SECURITY_STANDARD.md) gäller genom hela roadmapen.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)
- [Changelog](CHANGELOG.md)
