import api from "@/lib/api/client";
import type { Earnings, Withdrawal } from "@/lib/types/api";

export async function getEarnings(): Promise<Earnings> {
  const response = await api.get<Earnings>("/me/earnings");
  return response.data;
}

export async function createWithdrawal(payload: {
  amountMinor: number;
  payoutReference: string;
}): Promise<Withdrawal> {
  const response = await api.post<Withdrawal>("/me/withdrawals", payload, {
    headers: {
      "Idempotency-Key": payload.payoutReference,
    },
  });
  return response.data;
}
