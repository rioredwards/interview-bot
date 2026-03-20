import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string().trim(),
  sessionId: z.string().trim(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const smsRequestSchema = z.object({
  From: z.string(),
  Body: z.string().trim(),
});

export type SmsRequest = z.infer<typeof smsRequestSchema>;
