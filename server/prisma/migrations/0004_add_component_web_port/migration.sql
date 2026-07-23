-- Optional secondary service port on a component (e.g. Splunk Web on 8000
-- alongside the primary management/API port). Additive, nullable.
ALTER TABLE "Component" ADD COLUMN "webPort" TEXT;
