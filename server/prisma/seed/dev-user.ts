/**
 * Dev fixture user seed — creates (or refreshes) a local development / E2E
 * login. It is a regular Administrator in the default Organization, NOT the
 * instance superadmin.
 *
 * Intentionally a STANDALONE script, NOT part of `seed/index.ts` (which runs
 * on every deploy) — so this fixture can never accidentally land in a
 * production database. Run it explicitly for local dev:
 *   npm run seed:dev
 *
 * Idempotent: re-running resets the password so the documented credentials
 * always work again after a schema/migration reset.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { DEFAULT_ORGANIZATION_ID } from './constants';

const prisma = new PrismaClient();

const DEV_EMAIL = process.env.DEV_USER_EMAIL || 'dev@local.test';
const DEV_PASSWORD = process.env.DEV_USER_PASSWORD || 'DevLocal@123';

async function seedDevUser(): Promise<void> {
  // Extra guard: refuse to run against production unless explicitly forced.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEV_USER !== 'true') {
    console.log('Refusing to seed the dev fixture user in production (set SEED_DEV_USER=true to override).');
    return;
  }

  try {
    console.log(`Seeding dev fixture user (${DEV_EMAIL})...`);

    // The default Organization + Administrator role are created by
    // admin-account.ts — require them rather than re-creating, to stay a
    // pure fixture add.
    const organization = await prisma.organization.findUnique({ where: { id: DEFAULT_ORGANIZATION_ID } });
    if (!organization) {
      console.warn('Default Organization not found — run `npm run seed` (admin-account) first. Skipping.');
      return;
    }
    const adminRole = await prisma.role.findFirst({
      where: { name: 'Administrator', customerId: DEFAULT_ORGANIZATION_ID },
    });
    if (!adminRole) {
      console.warn('Administrator role not found for the default Organization. Run `npm run seed` first. Skipping.');
      return;
    }

    const hashed = await bcrypt.hash(DEV_PASSWORD, 10);
    const existing = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          isPlatformAdmin: false,
          roleId: adminRole.id,
          customerId: DEFAULT_ORGANIZATION_ID,
          authProvider: 'LOCAL',
          password: { upsert: { create: { password: hashed }, update: { password: hashed } } },
        },
      });
      console.log(`Dev user refreshed: ${DEV_EMAIL} / ${DEV_PASSWORD}`);
      return;
    }

    await prisma.user.create({
      data: {
        email: DEV_EMAIL,
        name: 'Local Dev',
        firstName: 'Local',
        lastName: 'Dev',
        authProvider: 'LOCAL',
        customerId: DEFAULT_ORGANIZATION_ID,
        roleId: adminRole.id,
        isPlatformAdmin: false,
        password: { create: { password: hashed } },
        profile: { create: { organization: 'Local Dev' } },
      },
    });
    console.log(`Dev user created: ${DEV_EMAIL} / ${DEV_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

export default seedDevUser;

if (require.main === module) {
  seedDevUser()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding dev user:', error);
      process.exit(1);
    });
}
