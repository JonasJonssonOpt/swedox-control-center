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

Repositoryt är inte länkat till något externt Supabase-projekt och innehåller ännu ingen verksamhetsmigration. Den lokala stacken får endast köras på en betrodd utvecklingsmaskin med aktiv brandvägg.

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
