-- CreateIndex
CREATE INDEX "conversations_userId_createdAt_idx" ON "conversations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "conversations_dealerId_createdAt_idx" ON "conversations"("dealerId", "createdAt");

-- CreateIndex
CREATE INDEX "dealers_verificationStatus_idx" ON "dealers"("verificationStatus");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_dealerId_createdAt_idx" ON "notifications"("dealerId", "createdAt");

-- CreateIndex
CREATE INDEX "part_requests_userId_createdAt_idx" ON "part_requests"("userId", "createdAt");
