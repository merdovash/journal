import { NextRequest, NextResponse } from "next/server";
import { ensureApiAuth } from "@/lib/api-auth";
import { recognizeCloseScreenshot } from "@/lib/screenshot/recognize-close";
import { ScreenshotInputError } from "@/lib/screenshot/ocr";
import { ScreenshotParseError } from "@/lib/screenshot/parse-open";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await ensureApiAuth(req);
  if (auth.error) return auth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ожидался файл скриншота" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Приложите изображение" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Изображение должно быть не пустым и меньше 8 МБ" },
      { status: 400 }
    );
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await recognizeCloseScreenshot(bytes);
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof ScreenshotParseError || error instanceof ScreenshotInputError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось разобрать скриншот" }, { status: 500 });
  }
}
