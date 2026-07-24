-- On-demand drift check ("Check drift now") runs asynchronously: the endpoint
-- marks the canvas CHECKING, enqueues a one-off pipeline-drift-canvas job, and
-- returns 202; a worker finalizes the state (IDLE + lastDriftCheckAt). The client
-- polls these columns to end its wait cleanly.
ALTER TABLE "ConfigurationCanvas" ADD COLUMN "driftCheckState" TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE "ConfigurationCanvas" ADD COLUMN "lastDriftCheckAt" TIMESTAMP(3);
