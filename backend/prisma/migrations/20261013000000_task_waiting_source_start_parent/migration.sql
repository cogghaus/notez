-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'WAITING';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "external_id" VARCHAR(255),
ADD COLUMN     "parent_task_id" TEXT,
ADD COLUMN     "source" VARCHAR(50),
ADD COLUMN     "start_date" TIMESTAMP(3),
ADD COLUMN     "waiting_on" VARCHAR(255);

-- CreateIndex
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_user_id_source_external_id_key" ON "tasks"("user_id", "source", "external_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
