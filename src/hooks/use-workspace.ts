"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readWorkspace, type WorkspaceSnapshot } from "@/lib/data/repository";
import { DEFAULT_RULE_SETTINGS } from "@/lib/domain/types";
import { isoNowDate, monthOf } from "@/lib/domain/time";

const EMPTY: WorkspaceSnapshot = { bars: [], employees: [], shifts: [], schedule: null, requirements: [], settings: DEFAULT_RULE_SETTINGS };

export function useWorkspace(userId: string) {
  const [month, setMonth] = useState(monthOf(isoNowDate()));
  const [data, setData] = useState<WorkspaceSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = useMemo(() => createClient(), []);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await readWorkspace(client, month);
      setData(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your workspace.");
    } finally {
      setLoading(false);
    }
  }, [client, month]);

  // The remote database read intentionally begins after mount and whenever the selected month changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(true); }, [refresh]);

  useEffect(() => {
    const channel = client.channel(`workspace-${userId}`);
    ["bars", "employees", "employee_bars", "schedules", "shifts", "staffing_requirements", "rule_settings"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void refresh(true), 300);
      });
    });
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void client.removeChannel(channel);
    };
  }, [client, refresh, userId]);

  return { month, setMonth, data, loading, error, setError, connected, refresh };
}
