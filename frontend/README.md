# Bazm frontend

Next.js App Router frontend for Bazm. Run it through the repository-root scripts
so all workspace tooling uses the shared lockfile:

```bash
npm run dev
npm run check
```

Firebase browser configuration is validated in `src/lib/env/client.ts`; local
values belong in `.env.local`, using `.env.example` as the inventory.
