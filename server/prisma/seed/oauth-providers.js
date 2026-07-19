"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seeds the global IdentityProvider catalog rows for Google and Microsoft
 * SSO. Both are disabled by default and only take on real values when their
 * FEATURE_OAUTH_* flag and matching *_CLIENT_ID / *_CLIENT_SECRET env vars
 * are set — nothing here is ever hardcoded.
 */
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function seedOAuthProviders() {
    try {
        console.log('Seeding OAuth identity providers...');
        const googleEnabled = process.env.FEATURE_OAUTH_GOOGLE === 'true';
        const googleConfig = googleEnabled
            ? {
                clientId: process.env.GOOGLE_CLIENT_ID || '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
                redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
                scope: process.env.GOOGLE_SCOPES || 'openid email profile',
            }
            : {};
        const googleProvider = await prisma.identityProvider.upsert({
            where: { type: 'GOOGLE' },
            update: { enabled: googleEnabled, config: JSON.stringify(googleConfig) },
            create: { name: 'Google', type: 'GOOGLE', enabled: googleEnabled, config: JSON.stringify(googleConfig) },
        });
        console.log(`Google provider ready: ${googleProvider.id} (enabled: ${googleEnabled})`);
        const microsoftEnabled = process.env.FEATURE_OAUTH_MICROSOFT === 'true';
        const microsoftTenantId = process.env.MICROSOFT_TENANT_ID || 'common';
        const microsoftConfig = microsoftEnabled
            ? {
                clientId: process.env.MICROSOFT_CLIENT_ID || '',
                clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
                tenantId: microsoftTenantId,
                redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
                scope: process.env.MICROSOFT_SCOPES || 'openid email profile User.Read',
                authority: process.env.MICROSOFT_AUTHORITY || `https://login.microsoftonline.com/${microsoftTenantId}`,
            }
            : {};
        const microsoftProvider = await prisma.identityProvider.upsert({
            where: { type: 'AZURE' },
            update: { enabled: microsoftEnabled, config: JSON.stringify(microsoftConfig) },
            create: {
                name: 'Microsoft',
                type: 'AZURE',
                enabled: microsoftEnabled,
                config: JSON.stringify(microsoftConfig),
            },
        });
        console.log(`Microsoft provider ready: ${microsoftProvider.id} (enabled: ${microsoftEnabled})`);
        console.log('OAuth identity providers seeded.');
    }
    finally {
        await prisma.$disconnect();
    }
}
exports.default = seedOAuthProviders;
if (require.main === module) {
    seedOAuthProviders()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Error seeding OAuth providers:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=oauth-providers.js.map