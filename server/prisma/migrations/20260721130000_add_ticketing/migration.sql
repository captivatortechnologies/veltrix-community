-- Ticketing integration: per-tenant ticketing connections + config↔ticket links.
-- Purely additive: two NEW tables, no ALTER on any existing table.

-- CreateTable: TicketingConnection
CREATE TABLE "TicketingConnection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instanceUrl" TEXT NOT NULL,
    "credentialId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "statusMessage" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketingConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketingConnection_customerId_provider_name_key"
    ON "TicketingConnection"("customerId", "provider", "name");
CREATE INDEX "TicketingConnection_customerId_idx"
    ON "TicketingConnection"("customerId");
CREATE INDEX "TicketingConnection_customerId_isDefault_idx"
    ON "TicketingConnection"("customerId", "isDefault");

ALTER TABLE "TicketingConnection"
    ADD CONSTRAINT "TicketingConnection_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketingConnection"
    ADD CONSTRAINT "TicketingConnection_credentialId_fkey"
    FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ConfigurationTicketLink
CREATE TABLE "ConfigurationTicketLink" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalKey" TEXT,
    "url" TEXT,
    "ticketType" TEXT,
    "title" TEXT,
    "status" TEXT,
    "linkType" TEXT NOT NULL DEFAULT 'change',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfigurationTicketLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfigurationTicketLink_canvasId_provider_externalId_key"
    ON "ConfigurationTicketLink"("canvasId", "provider", "externalId");
CREATE INDEX "ConfigurationTicketLink_canvasId_idx"
    ON "ConfigurationTicketLink"("canvasId");
CREATE INDEX "ConfigurationTicketLink_customerId_idx"
    ON "ConfigurationTicketLink"("customerId");
CREATE INDEX "ConfigurationTicketLink_connectionId_idx"
    ON "ConfigurationTicketLink"("connectionId");

ALTER TABLE "ConfigurationTicketLink"
    ADD CONSTRAINT "ConfigurationTicketLink_canvasId_fkey"
    FOREIGN KEY ("canvasId") REFERENCES "ConfigurationCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfigurationTicketLink"
    ADD CONSTRAINT "ConfigurationTicketLink_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfigurationTicketLink"
    ADD CONSTRAINT "ConfigurationTicketLink_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "TicketingConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConfigurationTicketLink"
    ADD CONSTRAINT "ConfigurationTicketLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
