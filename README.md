# SweDox Control Center

SweDox Control Center är ett separat internt system. Det är frikopplat från kundernas SweDox-installationer och delar ingen kod med dem.

Kundernas affärsdata får aldrig lagras i Control Center. Control Center får inte ha generell direktåtkomst till kundernas databaser.

Framtida kommunikation med kundinstallationer ska ske genom verifierade server-API:er med minsta möjliga behörighet.

## Lokal utveckling

Krav: Node.js 24 LTS, npm 11 och en startad Docker Desktop-/Docker-kompatibel daemon.

```bash
npm ci
npm run dev
```

Den lokala Supabase-stacken startas och stoppas med:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

Repositoryt innehåller versionshanterade verksamhetsmigrationer för owner-,
tenant- och installationsdomänerna. Lokal utveckling använder fortsatt den
isolerade stacken. En lokal CLI kan vara länkad för uttryckligen godkända
releaseoperationer, men projektidentifierare och credentials versionshanteras
inte. Den lokala stacken får endast köras på en betrodd utvecklingsmaskin med
aktiv brandvägg.

## Aktuell modulstatus

Tenant Management är tekniskt komplett. Installation Management är
implementerat genom databas, owner/RLS, audit, server-only service, read
routes, mutation actions samt list-, detail-, create-, edit-, lifecycle- och
audit-UI. F2C9A och F2C9B är distribuerade; F2C9C:s deterministiska
listordning är lokalverifierad och väntar migrations- och appdeployment innan
den manuella runtimeverifieringen kan slutföras.

Senaste lokala fullregression: 804/804 pgTAP och 151/151 Node-tester samt grön
databaslint, TypeScript, Prettier, ESLint och Next.js production build.

## Kontroller

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:types
```

## Databasdrift

- [Databas- och migrationsflöde](docs/DATABASE_WORKFLOW.md)
- [Owner-bootstrap](docs/OWNER_BOOTSTRAP.md)
- [Databas-recovery](docs/DATABASE_RECOVERY.md)
