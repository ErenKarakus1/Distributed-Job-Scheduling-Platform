CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "actorLabel" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "requestId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_createdAt_idx" ON "audit_events"("createdAt");
CREATE INDEX "audit_events_actorType_actorId_idx" ON "audit_events"("actorType", "actorId");
CREATE INDEX "audit_events_resourceType_resourceId_idx" ON "audit_events"("resourceType", "resourceId");
