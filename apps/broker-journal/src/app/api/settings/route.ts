import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    let settings = await prisma.brokerSettings.findUnique({
      where: { id: "default" },
    });
    if (!settings) {
      settings = await prisma.brokerSettings.create({
        data: { id: "default", startingBalance: 100000 },
      });
    }
    return NextResponse.json({
      startingBalance: Number(settings.startingBalance),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ошибка настроек" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const startingBalance = z.number().finite().parse(body.startingBalance);
    const settings = await prisma.brokerSettings.upsert({
      where: { id: "default" },
      create: { id: "default", startingBalance },
      update: { startingBalance },
    });
    return NextResponse.json({
      startingBalance: Number(settings.startingBalance),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректный баланс" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
