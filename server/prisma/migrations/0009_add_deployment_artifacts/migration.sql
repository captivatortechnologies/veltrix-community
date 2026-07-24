-- App-declared deploy output (DeployResult.artifacts), surfaced read-only in the
-- config View modal's "Deployed resources" section. Merged across components in
-- the orchestrator; may carry secrets, so only returned through authenticated
-- app endpoints.
ALTER TABLE "Deployment" ADD COLUMN "artifacts" JSONB;
