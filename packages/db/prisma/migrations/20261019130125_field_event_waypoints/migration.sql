-- CreateTable
CREATE TABLE "field_event_waypoint" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "field_event_id" UUID NOT NULL,
    "field_event_kind" "field_event_kind" NOT NULL,
    "position" INTEGER NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DECIMAL(38,8),
    "longitude" DECIMAL(38,8),
    "unreadable_gps" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "field_event_waypoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_event_waypoint_field_event_id_position_key" ON "field_event_waypoint"("field_event_id", "position");

-- AddForeignKey
ALTER TABLE "field_event_waypoint" ADD CONSTRAINT "field_event_waypoint_field_event_id_field_event_kind_fkey" FOREIGN KEY ("field_event_id", "field_event_kind") REFERENCES "field_event"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;
