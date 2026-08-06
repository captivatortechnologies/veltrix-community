/**
 * E2E app-fixture seed — enables a fixed set of app-scoped apps for the default
 * Organization so the Playwright app specs (which `goto('/apps/<id>')` and
 * assume the app is installed) run unattended.
 *
 * Intentionally a STANDALONE script, NOT part of `seed/index.ts` (which runs on
 * every deploy) — so this fixture can never accidentally land in a production
 * database, exactly like `dev-user.ts`.
 *
 * Run it AFTER the dev/e2e server has booted at least once with `APPS_DIR` set:
 * boot REGISTERS each app (the `App` row + its config types); this seed only
 * creates the per-Organization `AppInstallation`. Apps not yet registered are
 * skipped with a clear hint rather than failing the whole seed.
 *
 *   npm run seed:e2e                         # default app set
 *   E2E_APP_IDS=crowdstrike-edr,axonius npm run seed:e2e   # override the set
 *
 * Idempotent: re-running simply re-enables each app for the Organization.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ORGANIZATION_ID } from './constants';

const prisma = new PrismaClient();

// The apps the app-scoped e2e specs exercise. Override with E2E_APP_IDS (CSV).
const DEFAULT_E2E_APP_IDS = ['crowdstrike-edr', 'splunk-enterprise', 'splunk-cloud'];

const DEV_EMAIL = process.env.DEV_USER_EMAIL || 'dev@local.test';

/** The app slugs to enable — the E2E_APP_IDS override (CSV) or the default set. */
function targetAppIds(): string[] {
  const raw = process.env.E2E_APP_IDS;
  if (!raw) return DEFAULT_E2E_APP_IDS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function seedE2eApps(): Promise<void> {
  // Extra guard: refuse to run against production unless explicitly forced.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_E2E_APPS !== 'true') {
    console.log('Refusing to seed e2e app fixtures in production (set SEED_E2E_APPS=true to override).');
    return;
  }

  try {
    // The default Organization is created by admin-account.ts — require it
    // rather than re-creating, to stay a pure fixture add.
    const organization = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID } });
    if (!organization) {
      console.warn('Default Organization not found — run `npm run seed` (admin-account) first. Skipping.');
      return;
    }

    // `installedBy` is a free-form actor id — prefer the dev fixture user, fall
    // back to any user in the Organization, else a stable seed marker.
    const devUser = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
    const actor = devUser ?? (await prisma.user.findFirst({ where: { customerId: DEFAULT_ORGANIZATION_ID } }));
    const installedBy = actor?.id ?? 'seed:e2e';

    const appIds = targetAppIds();
    const enabled: string[] = [];
    const notRegistered: string[] = [];

    for (const appId of appIds) {
      // The App row is created by the app registry on boot from APPS_DIR — look
      // it up rather than registering here (this seed owns installation, not
      // registration). Skip cleanly if it hasn't been registered yet.
      const app = await prisma.app.findUnique({ where: { appId } });
      if (!app) {
        notRegistered.push(appId);
        continue;
      }

      // Mirrors AppRegistry.enable()'s core upsert — enable the app for the
      // Organization so the app-scoped pages/specs treat it as installed.
      await prisma.appInstallation.upsert({
        where: { appId_customerId: { appId: app.id, customerId: DEFAULT_ORGANIZATION_ID } },
        create: {
          appId: app.id,
          customerId: DEFAULT_ORGANIZATION_ID,
          version: app.version,
          enabled: true,
          installedBy,
          status: 'ENABLED',
        },
        update: { enabled: true, status: 'ENABLED' },
      });
      enabled.push(appId);
    }

    console.log(
      `E2E apps enabled for the default Organization (${enabled.length}): ${enabled.join(', ') || '(none)'}`,
    );
    if (notRegistered.length) {
      console.warn(
        `E2E apps NOT registered yet, skipped (${notRegistered.length}): ${notRegistered.join(', ')}.\n` +
          '  Boot the dev/e2e server once with APPS_DIR pointing at your veltrix-apps checkout so these\n' +
          '  apps get registered, then re-run `npm run seed:e2e`.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

export default seedE2eApps;

if (require.main === module) {
  seedE2eApps()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding e2e apps:', error);
      process.exit(1);
    });
}
