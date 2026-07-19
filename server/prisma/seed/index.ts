/**
 * Main seed entrypoint — runs on deploy (`npm run seed`). Seeds only what
 * Community Edition needs to boot: the default Organization + RBAC + first
 * admin account, optional OAuth identity providers, the tool catalog, and
 * the compliance framework catalog.
 *
 * `dev-user.ts` is intentionally NOT called here — it is a separate,
 * explicitly-invoked local/E2E fixture (`npm run seed:dev`).
 */
import seedAdminAccount from './admin-account';
import seedOAuthProviders from './oauth-providers';
import seedTools from './tools';
import seedComplianceCatalog from './compliance-catalog';

async function main(): Promise<void> {
  console.log('==================================================');
  console.log('Starting database seeding...');
  console.log('==================================================\n');

  // 1. Default Organization, RBAC roles, first admin account.
  await seedAdminAccount();
  console.log('');

  // 2. Optional OAuth identity providers (Google/Microsoft) — disabled
  //    unless FEATURE_OAUTH_GOOGLE / FEATURE_OAUTH_MICROSOFT are set.
  await seedOAuthProviders();
  console.log('');

  // 3. Tool catalog.
  await seedTools();
  console.log('');

  // 4. Compliance framework catalog.
  await seedComplianceCatalog();
  console.log('');

  console.log('==================================================');
  console.log('Database seeding completed successfully.');
  console.log('==================================================');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n==================================================');
    console.error('Database seeding failed.');
    console.error('==================================================');
    console.error(error);
    process.exit(1);
  });
