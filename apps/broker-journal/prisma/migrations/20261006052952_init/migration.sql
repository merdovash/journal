-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('manual', 'take_profit', 'stop_loss');

-- CreateTable
CREATE TABLE "TradeOpen" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "instrument" TEXT NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "commission" DECIMAL(18,6) NOT NULL,
    "stopLoss" DECIMAL(18,6),
    "takeProfit" DECIMAL(18,6),
    "leverage" DECIMAL(18,6) NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "openReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeClose" (
    "id" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "commission" DECIMAL(18,6) NOT NULL,
    "closeReason" "CloseReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "startingBalance" DECIMAL(18,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeOpen_openedAt_idx" ON "TradeOpen"("openedAt");

-- CreateIndex
CREATE INDEX "TradeOpen_instrument_idx" ON "TradeOpen"("instrument");

-- CreateIndex
CREATE UNIQUE INDEX "TradeClose_openId_key" ON "TradeClose"("openId");

-- CreateIndex
CREATE INDEX "TradeClose_closedAt_idx" ON "TradeClose"("closedAt");

-- AddForeignKey
ALTER TABLE "TradeClose" ADD CONSTRAINT "TradeClose_openId_fkey" FOREIGN KEY ("openId") REFERENCES "TradeOpen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
