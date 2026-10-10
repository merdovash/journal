import { PrismaClient, CloseReason } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.brokerSettings.upsert({
    where: { id: "default" },
    create: { id: "default", startingBalance: 100000 },
    update: {},
  });

  const existing = await prisma.tradeOpen.count();
  if (existing > 0) {
    console.log("Seed skipped: trades already exist");
    return;
  }

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  const open1 = await prisma.tradeOpen.create({
    data: {
      openedAt: hoursAgo(48),
      instrument: "GC=F",
      price: 2650.5,
      commission: 2.5,
      stopLoss: 2630,
      takeProfit: 2700,
      leverage: 10,
      quantity: 1,
      openReason: "Пробой сопротивления на золоте",
    },
  });

  await prisma.tradeClose.create({
    data: {
      openId: open1.id,
      closedAt: hoursAgo(24),
      price: 2688.2,
      commission: 2.5,
      closeReason: CloseReason.take_profit,
    },
  });

  await prisma.tradeOpen.create({
    data: {
      openedAt: hoursAgo(6),
      instrument: "SI=F",
      price: 31.45,
      commission: 1.8,
      stopLoss: 30.8,
      takeProfit: 32.5,
      leverage: 5,
      quantity: 2,
      openReason: "Отскок от поддержки серебра",
    },
  });

  await prisma.tradeOpen.create({
    data: {
      openedAt: hoursAgo(2),
      instrument: "CL=F",
      price: 72.15,
      commission: 2.0,
      stopLoss: 70.5,
      takeProfit: 75,
      leverage: 8,
      quantity: 1,
      openReason: "Импульс на нефти после новостей",
    },
  });

  console.log("Seed complete: settings + sample trades");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
