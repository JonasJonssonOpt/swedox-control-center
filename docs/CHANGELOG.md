# Changelog

Alla betydande förändringar i projektet kommer att dokumenteras i denna fil.

Formatet baseras på [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) och projektet följer [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Låst autentiseringsmodellen för version 1 till ett internt `owner`-konto med e-post och lösenord via Supabase Auth, obligatorisk TOTP-MFA och serverhanterade PKCE-sessioner.
- Avgränsat användaradministration, invitationer, SSO och ytterligare roller till en möjlig framtida utbyggnad.
- Dokumenterat manuell recovery via Supabase samt förbud mot självregistrering, SMS-MFA och egna recovery codes.
