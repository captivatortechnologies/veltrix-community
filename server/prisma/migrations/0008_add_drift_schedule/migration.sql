-- Configurable scheduled drift check: one row per (customer, scope). appId '*'
-- is the tenant default; an app slug is a per-app override (which wins over the
-- tenant default). frequency ∈ off | hourly | daily | weekly.
CREATE TABLE "DriftSchedule" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appId" TEXT NOT NULL DEFAULT '*',
    "frequency" TEXT NOT NULL DEFAULT 'hourly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriftSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriftSchedule_customerId_appId_key" ON "DriftSchedule"("customerId", "appId");

CREATE INDEX "DriftSchedule_customerId_idx" ON "DriftSchedule"("customerId");
