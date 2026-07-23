-- Optional $SPLUNK_HOME override on a component (e.g. /opt/splunk vs
-- /opt/splunkforwarder). Additive, nullable.
ALTER TABLE "Component" ADD COLUMN "splunkHome" TEXT;
