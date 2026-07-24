# Changelog

## 2026-07-24

- Implementerade den server-only `requireOwnerIntegrity()` ovanpå befintlig
  owner-/AAL2-guard med environmentvalidering, allowlistad DB-RPC och fail-closed
  felmappning.
- Lade till dependency-fria Node-tester för environment, auth/RPC-ordning,
  resultatallowlist, informationsminimering, säker loggmetadata och frånvaro av
  cross-request cache.
- Implementerade `get_owner_integrity_status()` med kategorisk textretur,
  SECURITY DEFINER, fast search path och minimerade execute-grants.
- Lade till lokala pgTAP-bevis för JWT-kontext, owner/mismatch/missing/
  unauthenticated, informationsminimering och fortsatt nekad tabellåtkomst.
- Implementerade den första migrationen för `public.control_center_owner` med
  konstant singletonnyckel, Auth-FK, FORCE RLS och nekad normal tabellåtkomst.
- Lade till 43 godkända pgTAP-kontroller för struktur, constraints, FK, ägarskap,
  RLS och grants samt genererade deterministiska databastyper.
- Genomförde Steg C:s kodfria Security Pass för Tenant Management.
- Låste design för owner-singleton, equality, tenantdata, RLS, atomiska
  mutationer, beständig audit, tester, migrationsordning, DAL, fel och recovery.
- Inget verksamhetsschema, ingen migration och ingen tenantkod implementerades.

Alla betydande förändringar i projektet kommer att dokumenteras i denna fil.

Formatet baseras på [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) och projektet följer [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Låst autentiseringsmodellen för version 1 till ett internt `owner`-konto med e-post och lösenord via Supabase Auth, obligatorisk TOTP-MFA och serverhanterade PKCE-sessioner.
- Avgränsat användaradministration, invitationer, SSO och ytterligare roller till en möjlig framtida utbyggnad.
- Dokumenterat manuell recovery via Supabase samt förbud mot självregistrering, SMS-MFA och egna recovery codes.
- Etablerat repositorystruktur och dokumentationsstandard för framtida Supabase-migrationer, owner-bootstrap och databas-recovery utan att införa databas- eller tenantschema.
- Infört en versionspinnad lokal Supabase CLI-miljö med local-only scripts, tom migrationsverifiering, databaslint, pgTAP-smoketest, typgenerering och CI-grund.
