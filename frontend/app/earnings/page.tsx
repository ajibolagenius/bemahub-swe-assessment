"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import axios from "axios";

import { useAuthStore } from "@/lib/auth/authStore";
import { getEarnings, createWithdrawal } from "@/lib/api/services/earnings";
import { StatusMessage } from "@/components/StatusMessage";
import { formatMoney } from "@/lib/format";
import type { Withdrawal, ApiError } from "@/lib/types/api";

export default function EarningsPage() {
  const queryClient = useQueryClient();
  const { token, user, signOut, hydrate } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [successWithdrawal, setSuccessWithdrawal] = useState<Withdrawal | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    setMounted(true);
  }, [hydrate]);

  // Fetch earnings data for authenticated instructors
  const {
    data: earnings,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["earnings"],
    queryFn: getEarnings,
    enabled: mounted && !!token,
    retry: false,
  });

  // Client-side validation schema based on API minimum and available balance
  const minMinor = earnings?.minimumWithdrawalMinor ?? 50000;
  const maxMinor = earnings?.availableMinor ?? 0;

  const formSchema = z.object({
    amountMinor: z.coerce
      .number({ invalid_type_error: "Amount must be a number." })
      .int("Amount must be an integer in minor units.")
      .positive("Amount must be greater than zero.")
      .min(minMinor, `Amount must be at least ${minMinor.toLocaleString()} minor units (${formatMoney(minMinor, "NGN")}).`)
      .max(maxMinor, `Amount cannot exceed your available balance of ${maxMinor.toLocaleString()} minor units (${formatMoney(maxMinor, "NGN")}).`),
  });

  type FormValues = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onSubmit",
  });

  // Mutation to request withdrawal
  const withdrawalMutation = useMutation({
    mutationFn: createWithdrawal,
    onSuccess: (withdrawal) => {
      setSuccessWithdrawal(withdrawal);
      setGeneralError(null);
      reset();
      // Refresh earnings balance
      queryClient.invalidateQueries({ queryKey: ["earnings"] });
    },
    onError: (err: unknown) => {
      setSuccessWithdrawal(null);
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status;
        const apiErr = err.response.data as ApiError | undefined;
        const code = apiErr?.code;
        const message = apiErr?.message ?? "An error occurred during withdrawal.";

        // Attach amount-specific server rejections directly to the field
        if (code === "below_minimum" || code === "insufficient_balance") {
          setError("amountMinor", {
            type: "server",
            message: message,
          });
        } else if (status === 403) {
          setGeneralError("Forbidden: Only instructors can withdraw earnings.");
        } else {
          setGeneralError(message);
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("An unexpected error occurred.");
      }
    },
  });

  // Submit handler: generates payoutReference once per attempt
  const onSubmit = (formData: FormValues) => {
    setGeneralError(null);
    setSuccessWithdrawal(null);

    // Generate unique idempotency reference once per attempt
    const payoutReference = "wd_" + Math.random().toString(36).substring(2, 10);

    withdrawalMutation.mutate({
      amountMinor: formData.amountMinor,
      payoutReference,
    });
  };

  if (!mounted) {
    return <StatusMessage state="loading" />;
  }

  // 1. Signed-out state: tell the truth, do not show empty success
  if (!token) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Sign in required</h2>
          <p className="mt-2 text-sm text-slate-600">
            You are currently signed out. Please sign in with an instructor account to view earnings and request withdrawals.
          </p>
          <div className="mt-4">
            <Link
              href="/login"
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Loading state
  if (isLoading) {
    return <StatusMessage state="loading" />;
  }

  // 3. Error state (e.g. 403 for learners or transport failure)
  if (isError) {
    let message = "Failed to load earnings.";
    if (axios.isAxiosError(error) && error.response) {
      if (error.response.status === 403) {
        message = "Access denied: Instructors only. Learner accounts cannot access earnings.";
      } else {
        const apiErr = error.response.data as ApiError | undefined;
        message = apiErr?.message ?? error.message;
      }
    } else if (error instanceof Error) {
      message = error.message;
    }

    return (
      <div className="space-y-4">
        <StatusMessage state="error" message={message} />
        <div className="text-center">
          <button
            onClick={() => signOut()}
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Sign out and try another account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with user details and sign out */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Instructor Earnings</h2>
          <p className="text-sm text-slate-500">
            Welcome back, {user?.name ?? "Instructor"}. Manage your course revenue and payouts.
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>

      {/* Balance Cards */}
      {earnings && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-semibold uppercase text-slate-500">Available Balance</span>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatMoney(earnings.availableMinor, earnings.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {earnings.availableMinor.toLocaleString()} minor units
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-semibold uppercase text-slate-500">Pending Balance</span>
            <p className="mt-2 text-2xl font-bold text-slate-600">
              {formatMoney(earnings.pendingMinor, earnings.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {earnings.pendingMinor.toLocaleString()} minor units
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <span className="text-xs font-semibold uppercase text-slate-500">Minimum Withdrawal</span>
            <p className="mt-2 text-2xl font-bold text-slate-600">
              {formatMoney(earnings.minimumWithdrawalMinor, earnings.currency)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {earnings.minimumWithdrawalMinor.toLocaleString()} minor units
            </p>
          </div>
        </div>
      )}

      {/* Withdrawal Form */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Request Withdrawal</h3>
        <p className="text-sm text-slate-500">
          Enter an amount in minor units to withdraw to your bank account.
        </p>

        {/* General Error Banner */}
        {generalError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {generalError}
          </div>
        )}

        {/* Success Banner */}
        {successWithdrawal && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 space-y-1">
            <p className="font-semibold">Withdrawal requested successfully!</p>
            <p>
              Amount: <strong>{formatMoney(successWithdrawal.amountMinor, earnings?.currency ?? "NGN")}</strong> ({successWithdrawal.amountMinor.toLocaleString()} minor units)
            </p>
            <p>Status: <span className="capitalize">{successWithdrawal.status}</span></p>
            <p className="text-xs text-emerald-700">Reference: <code>{successWithdrawal.payoutReference}</code></p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Withdrawal Amount (minor units)
            </label>
            <div className="mt-1">
              <input
                type="number"
                step="1"
                {...register("amountMinor")}
                disabled={isSubmitting || withdrawalMutation.isPending}
                placeholder={earnings?.minimumWithdrawalMinor.toString() ?? "50000"}
                className={`block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                  errors.amountMinor
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                    : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                }`}
              />
            </div>

            {/* Field-attached error message */}
            {errors.amountMinor && (
              <p className="mt-1.5 text-sm text-red-600">
                {errors.amountMinor.message}
              </p>
            )}

            <p className="mt-1 text-xs text-slate-500">
              Minimum: {earnings ? formatMoney(earnings.minimumWithdrawalMinor, earnings.currency) : "—"} (
              {earnings?.minimumWithdrawalMinor.toLocaleString()} minor units). Available:{" "}
              {earnings ? formatMoney(earnings.availableMinor, earnings.currency) : "—"}.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || withdrawalMutation.isPending}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting || withdrawalMutation.isPending ? "Submitting request…" : "Submit Withdrawal"}
          </button>
        </form>
      </div>
    </div>
  );
}
