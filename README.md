# SweDox Control Center

SweDox Control Center är ett separat internt system. Det är frikopplat från kundernas SweDox-installationer och delar ingen kod med dem.

Kundernas affärsdata får aldrig lagras i Control Center. Control Center får inte ha generell direktåtkomst till kundernas databaser.

Framtida kommunikation med kundinstallationer ska ske genom verifierade server-API:er med minsta möjliga behörighet.

## Lokal utveckling

Krav: Node.js 24 LTS och npm 11.

```bash
npm ci
npm run dev
```

## Kontroller

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
```
