import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serializeOpen } from "@/lib/journal";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  openedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  instrument: z.string().min(1).max(64),
  price: z.number().positive(),
  commission: z.number().min(0),
  stopLoss: z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
  leverage: z.number().positive(),
  quantity: z.number().positive(),
  openReason: z.string().max(2000).default(""),
});

export async function GET(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      const open = await prisma.tradeOpen.findUnique({
        where: { id },
        include: { close: true },
      });
      if (!open) {
        return NextResponse.json({ error: "Открытие не найдено" }, { status: 404 });
      }
      return NextResponse.json(serializeOpen(open));
    }

    const opens = await prisma.tradeOpen.findMany({
      include: { close: true },
      orderBy: { openedAt: "desc" },
    });
    return NextResponse.json(opens.map(serializeOpen));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ошибка чтения открытий" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const data = createSchema.parse(body);
    const open = await prisma.tradeOpen.create({
      data: {
        openedAt: new Date(data.openedAt),
        instrument: data.instrument.trim().toUpperCase(),
        price: data.price,
        commission: data.commission,
        stopLoss: data.stopLoss ?? null,
        takeProfit: data.takeProfit ?? null,
        leverage: data.leverage,
        quantity: data.quantity,
        openReason: data.openReason ?? "",
      },
      include: { close: true },
    });
    return NextResponse.json(serializeOpen(open), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать открытие" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const id = z.string().min(1).parse(body.id);
    const data = createSchema.partial().parse(body);

    const existing = await prisma.tradeOpen.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Открытие не найдено" }, { status: 404 });
    }

    const open = await prisma.tradeOpen.update({
      where: { id },
      data: {
        ...(data.openedAt ? { openedAt: new Date(data.openedAt) } : {}),
        ...(data.instrument
          ? { instrument: data.instrument.trim().toUpperCase() }
          : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.commission !== undefined ? { commission: data.commission } : {}),
        ...(data.stopLoss !== undefined ? { stopLoss: data.stopLoss } : {}),
        ...(data.takeProfit !== undefined ? { takeProfit: data.takeProfit } : {}),
        ...(data.leverage !== undefined ? { leverage: data.leverage } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.openReason !== undefined ? { openReason: data.openReason } : {}),
      },
      include: { close: true },
    });

    return NextResponse.json(serializeOpen(open));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось обновить открытие" }, { status: 500 });
  }
}
