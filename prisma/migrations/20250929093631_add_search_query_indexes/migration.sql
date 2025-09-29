-- CreateIndex
CREATE INDEX "search_queries_user_id_created_at_idx" ON "public"."search_queries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "search_queries_created_at_idx" ON "public"."search_queries"("created_at");
