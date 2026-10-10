import { NextRequest, NextResponse } from "next/server";
import { ensureApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { computeStats, toRegistryItems } from "@/lib/journal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    const [settings, opens] = await Promise.all([
      prisma.brokerSettings.findUnique({ where: { id: "default" } }),
      prisma.tradeOpen.findMany({
        include: { close: true },
        orderBy: { openedAt: "desc" },
      }),
    ]);

    const startingBalance = settings
      ? Number(settings.startingBalance)
      : 100000;

    if (!settings) {
      await prisma.brokerSettings.create({
        data: { id: "default", startingBalance: 100000 },
      });
    }

    const stats = computeStats(startingBalance, opens);
    const items = toRegistryItems(opens);
    const openPositions = opens
      .filter((o) => !o.close)
      .map((o) => ({
        id: o.id,
        instrument: o.instrument,
        openedAt: o.openedAt.toISOString(),
        price: Number(o.price),
        quantity: Number(o.quantity),
      }));

    return NextResponse.json({ stats, items, openPositions });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Не удалось загрузить реестр" },
      { status: 500 }
    );
  }
}
