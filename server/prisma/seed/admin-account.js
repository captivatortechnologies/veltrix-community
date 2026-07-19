"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Default Organization + RBAC roles + first admin user.
 *
 * Community Edition is single-tenant: this seed is idempotent and creates
 * (once) the one Organization row every other model hangs off of, plus a
 * baseline "Administrator" / "User" role pair and the first admin account.
 *
 * SECRETS: the admin password is NEVER hardcoded.
 *  - If VELTRIX_ADMIN_PASSWORD is set, it is used (and hashed) as-is.
 *  - If unset, a cryptographically random password is generated, hashed for
 *    storage, and the PLAINTEXT is printed to stdout exactly once. There is
 *    no insecure fallback — treat the printed value as sensitive and
 *    disregarded after first login (change it immediately).
 */
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("./constants");
const prisma = new client_1.PrismaClient();
/** Generates a random, URL-safe password with ample entropy for a first-run credential. */
function generateRandomPassword() {
    return crypto_1.default.randomBytes(24).toString('base64url'); // 32 chars, ~144 bits of entropy
}
async function seedAdminAccount() {
    try {
        console.log('Seeding default Organization + RBAC + admin account...');
        // ---- 1. Default Organization (single-tenant) ----
        let organization = await prisma.organization.findUnique({
            where: { id: constants_1.DEFAULT_ORGANIZATION_ID },
        });
        if (!organization) {
            const orgName = process.env.VELTRIX_ORG_NAME || 'Default Organization';
            organization = await prisma.organization.create({
                data: {
                    id: constants_1.DEFAULT_ORGANIZATION_ID,
                    name: orgName,
                    isActive: true,
                },
            });
            console.log(`Organization created: ${organization.name} (${organization.id})`);
        }
        else {
            console.log(`Organization already exists: ${organization.name} (${organization.id})`);
        }
        // ---- 2. Administrator role (unrestricted: all:all wildcard) ----
        let adminRole = await prisma.role.findFirst({
            where: { name: 'Administrator', customerId: organization.id },
        });
        if (!adminRole) {
            adminRole = await prisma.role.create({
                data: {
                    name: 'Administrator',
                    description: 'Full access to every resource on this instance',
                    customerId: organization.id,
                    permissions: {
                        createMany: { data: [{ resource: 'all', action: 'all' }] },
                    },
                },
            });
            console.log('Administrator role created:', adminRole.id);
        }
        // ---- 3. User role — baseline grants across the KEEP resource catalog ----
        // Mirrors the platform's live resource catalog (server/src/module/role/
        // resource-catalog.ts) restricted to Community Edition resources. Not
        // exhaustive by design — expand via the Roles UI as needed.
        let userRole = await prisma.role.findFirst({
            where: { name: 'User', customerId: organization.id },
        });
        if (!userRole) {
            userRole = await prisma.role.create({
                data: {
                    name: 'User',
                    description: 'Standard user with baseline access',
                    customerId: organization.id,
                    permissions: {
                        createMany: {
                            data: [
                                { resource: 'dashboard', action: 'read' },
                                { resource: 'profile', action: 'read' },
                                { resource: 'profile', action: 'update' },
                                { resource: 'tool', action: 'read' },
                                { resource: 'tag', action: 'read' },
                                { resource: 'tag', action: 'write' },
                                { resource: 'credential', action: 'read' },
                                { resource: 'credential', action: 'write' },
                                { resource: 'component', action: 'read' },
                                { resource: 'component', action: 'write' },
                                { resource: 'connectivity', action: 'read' },
                                { resource: 'configuration-canvas', action: 'read' },
                                { resource: 'configuration-canvas', action: 'write' },
                                { resource: 'apps', action: 'read' },
                                { resource: 'report', action: 'read' },
                            ],
                        },
                    },
                },
            });
            console.log('User role created:', userRole.id);
        }
        // ---- 4. First admin user ----
        const adminEmail = process.env.VELTRIX_ADMIN_EMAIL || 'admin@example.com';
        let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (!adminUser) {
            const providedPassword = process.env.VELTRIX_ADMIN_PASSWORD;
            const generated = !providedPassword;
            const plaintextPassword = providedPassword || generateRandomPassword();
            const hashedPassword = await bcrypt_1.default.hash(plaintextPassword, 10);
            adminUser = await prisma.user.create({
                data: {
                    email: adminEmail,
                    name: 'Administrator',
                    firstName: 'Instance',
                    lastName: 'Administrator',
                    authProvider: 'LOCAL',
                    customerId: organization.id,
                    roleId: adminRole.id,
                    isPlatformAdmin: true, // instance owner / superadmin
                    password: { create: { password: hashedPassword } },
                    profile: { create: { organization: organization.name } },
                },
            });
            console.log('Administrator user created.');
            console.log(`  Email:    ${adminEmail}`);
            if (generated) {
                console.log(`  Password: ${plaintextPassword}  (generated — shown once, change on first login)`);
            }
            else {
                console.log('  Password: set from VELTRIX_ADMIN_PASSWORD (change on first login if this is a shared value)');
            }
        }
        else {
            console.log(`Administrator user already exists: ${adminEmail}`);
            if (!adminUser.isPlatformAdmin) {
                await prisma.user.update({ where: { id: adminUser.id }, data: { isPlatformAdmin: true } });
                console.log('  Updated existing user with isPlatformAdmin flag.');
            }
        }
        console.log('Admin account seeding complete.');
    }
    finally {
        await prisma.$disconnect();
    }
}
exports.default = seedAdminAccount;
if (require.main === module) {
    seedAdminAccount()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Error seeding admin account:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=admin-account.js.map