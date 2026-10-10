import { NextRequest, NextResponse } from "next/server";
import { CloseReason } from "@prisma/client";
import { z } from "zod";
import { ensureApiAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { calcNetPnl, d, serializeOpen } from "@/lib/journal";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  openId: z.string().min(1),
  closedAt: z.string().min(1),
  price: z.number().positive(),
  commission: z.number().min(0),
  closeReason: z.nativeEnum(CloseReason),
});

export async function GET(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      const close = await prisma.tradeClose.findUnique({
        where: { id },
        include: { open: { include: { close: true } } },
      });
      if (!close) {
        return NextResponse.json({ error: "Закрытие не найдено" }, { status: 404 });
      }
      const open = close.open;
      return NextResponse.json({
        id: close.id,
        openId: close.openId,
        closedAt: close.closedAt.toISOString(),
        price: d(close.price),
        commission: d(close.commission),
        closeReason: close.closeReason,
        pnl: calcNetPnl(
          d(open.price),
          d(close.price),
          d(open.quantity),
          d(open.commission),
          d(close.commission)
        ),
        open: serializeOpen(open),
      });
    }

    const closes = await prisma.tradeClose.findMany({
      include: { open: true },
      orderBy: { closedAt: "desc" },
    });
    return NextResponse.json(
      closes.map((close) => ({
        id: close.id,
        openId: close.openId,
        closedAt: close.closedAt.toISOString(),
        price: d(close.price),
        commission: d(close.commission),
        closeReason: close.closeReason,
        instrument: close.open.instrument,
        pnl: calcNetPnl(
          d(close.open.price),
          d(close.price),
          d(close.open.quantity),
          d(close.open.commission),
          d(close.commission)
        ),
      }))
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ошибка чтения закрытий" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const data = createSchema.parse(body);

    const open = await prisma.tradeOpen.findUnique({
      where: { id: data.openId },
      include: { close: true },
    });
    if (!open) {
      return NextResponse.json({ error: "Открытие не найдено" }, { status: 404 });
    }
    if (open.close) {
      return NextResponse.json(
        { error: "Это открытие уже закрыто" },
        { status: 409 }
      );
    }

    const closedAt = new Date(data.closedAt);
    if (closedAt < open.openedAt) {
      return NextResponse.json(
        { error: "Дата закрытия раньше открытия" },
        { status: 400 }
      );
    }

    // Never mutate the open row — only create a close referencing it
    const close = await prisma.tradeClose.create({
      data: {
        openId: data.openId,
        closedAt,
        price: data.price,
        commission: data.commission,
        closeReason: data.closeReason,
      },
      include: { open: { include: { close: true } } },
    });

    return NextResponse.json(
      {
        id: close.id,
        openId: close.openId,
        closedAt: close.closedAt.toISOString(),
        price: d(close.price),
        commission: d(close.commission),
        closeReason: close.closeReason,
        pnl: calcNetPnl(
          d(close.open.price),
          d(close.price),
          d(close.open.quantity),
          d(close.open.commission),
          d(close.commission)
        ),
        open: serializeOpen(close.open),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось создать закрытие" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const id = z.string().min(1).parse(body.id);
    const data = createSchema.partial().omit({ openId: true }).parse(body);

    const existing = await prisma.tradeClose.findUnique({
      where: { id },
      include: { open: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Закрытие не найдено" }, { status: 404 });
    }

    if (data.closedAt) {
      const closedAt = new Date(data.closedAt);
      if (closedAt < existing.open.openedAt) {
        return NextResponse.json(
          { error: "Дата закрытия раньше открытия" },
          { status: 400 }
        );
      }
    }

    const close = await prisma.tradeClose.update({
      where: { id },
      data: {
        ...(data.closedAt ? { closedAt: new Date(data.closedAt) } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.commission !== undefined ? { commission: data.commission } : {}),
        ...(data.closeReason ? { closeReason: data.closeReason } : {}),
      },
      include: { open: { include: { close: true } } },
    });

    return NextResponse.json({
      id: close.id,
      openId: close.openId,
      closedAt: close.closedAt.toISOString(),
      price: d(close.price),
      commission: d(close.commission),
      closeReason: close.closeReason,
      pnl: calcNetPnl(
        d(close.open.price),
        d(close.price),
        d(close.open.quantity),
        d(close.open.commission),
        d(close.commission)
      ),
      open: serializeOpen(close.open),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Некорректные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось обновить закрытие" }, { status: 500 });
  }
}
