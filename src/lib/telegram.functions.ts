import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const inputSchema = z.object({
  studentName: z.string().min(1).max(255),
  amount: z.number().positive(),
  receiptNo: z.string().min(1).max(64),
  paymentMode: z.string().min(1).max(32),
  paidOn: z.string().min(1).max(32),
  className: z.string().max(64).optional(),
});

export const notifyFeeDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Check admin
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin only");

    // Get chat_id from settings
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "telegram_chat_id")
      .maybeSingle();

    const chatId = setting?.value?.trim();
    if (!chatId) {
      return { sent: false, reason: "no_chat_id" };
    }

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!TELEGRAM_API_KEY) throw new Error("TELEGRAM_API_KEY is not configured");

    const text =
      `💰 <b>Fee Received</b>\n\n` +
      `<b>Student:</b> ${escapeHtml(data.studentName)}` +
      (data.className ? ` (${escapeHtml(data.className)})` : "") +
      `\n<b>Amount:</b> ₹${data.amount.toFixed(2)}` +
      `\n<b>Mode:</b> ${escapeHtml(data.paymentMode)}` +
      `\n<b>Date:</b> ${escapeHtml(data.paidOn)}` +
      `\n<b>Receipt:</b> ${escapeHtml(data.receiptNo)}`;

    const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        `Telegram API call failed [${res.status}]: ${JSON.stringify(body)}`
      );
    }
    return { sent: true };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
