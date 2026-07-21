-- Surface the deploy failure reason on the configuration.
-- Additive: one nullable column, no data migration.

-- Human-readable reason from the most recent failed deploy (e.g. the provider's
-- validation error). Set when a deploy fails, cleared when one starts/succeeds,
-- so the "Deploy failed" badge can explain WHY without digging into logs.
ALTER TABLE "ConfigurationCanvas" ADD COLUMN "lastDeployError" TEXT;
