-- CreateTable
CREATE TABLE "public"."search_queries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."search_results" (
    "id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "metadata" JSONB,
    "source_service" TEXT NOT NULL DEFAULT 'ira',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_results_user_id_created_at_idx" ON "public"."search_results"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "search_results_thread_id_idx" ON "public"."search_results"("thread_id");

-- AddForeignKey
ALTER TABLE "public"."search_queries" ADD CONSTRAINT "search_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."search_results" ADD CONSTRAINT "search_results_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "public"."search_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."search_results" ADD CONSTRAINT "search_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
