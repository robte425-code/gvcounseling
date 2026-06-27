"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { DriveImportResultBox } from "@/components/portal/DriveImportResultBox";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
} from "@/components/portal/ui";

type DriveStatus = {
  connected: boolean;
  googleEmail?: string | null;
  message?: string | null;
  error?: string | null;
};

type ImportResult = {
  created?: number;
  updated?: number;
  closed?: number;
  unchanged?: number;
  skipped?: number;
  errors?: string[];
  warnings?: string[];
  error?: string;
};

export function GoogleDriveConnectionPanel({
  driveStatus,
  description,
  syncButtonLabel = "Sync from Drive",
  showSync = true,
}: {
  driveStatus: DriveStatus;
  description: ReactNode;
  syncButtonLabel?: string;
  showSync?: boolean;
}) {
  const [driveResult, setDriveResult] = useState<ImportResult | null>(null);
  const [driveProgress, setDriveProgress] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [connected, setConnected] = useState(driveStatus.connected);
  const [googleEmail, setGoogleEmail] = useState(driveStatus.googleEmail ?? null);

  async function syncFromDrive() {
    setLoading("drive");
    setDriveResult(null);
    setDriveProgress("Syncing Google Drive…");

    try {
      const res = await fetch("/api/portal/clients/import-drive", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as ImportResult;

      if (!res.ok) {
        setDriveResult({ error: body.error ?? "Drive sync failed." });
        return;
      }

      setDriveResult(body);
    } catch {
      setDriveResult({ error: "Drive sync failed. Check your connection and try again." });
    } finally {
      setDriveProgress(null);
      setLoading(null);
    }
  }

  async function disconnectDrive() {
    setLoading("disconnect");
    await fetch("/api/portal/integrations/google/disconnect", { method: "POST" });
    setConnected(false);
    setGoogleEmail(null);
    setLoading(null);
  }

  return (
    <div className={`${portalCardClass} space-y-4`}>
      <h2 className="font-serif text-xl font-semibold text-primary-dark">Google Drive</h2>
      <div className="text-sm text-muted">{description}</div>

      {driveStatus.message && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          {driveStatus.message}
        </p>
      )}
      {driveStatus.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {driveStatus.error}
        </p>
      )}

      {connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-primary-dark">
            Connected as <strong>{googleEmail ?? "Google account"}</strong>
          </p>
          {showSync && (
            <button
              type="button"
              onClick={syncFromDrive}
              disabled={loading !== null}
              className={portalButtonClass}
            >
              {loading === "drive" ? driveProgress ?? "Syncing…" : syncButtonLabel}
            </button>
          )}
          <button
            type="button"
            onClick={disconnectDrive}
            disabled={loading !== null}
            className={portalButtonSecondaryClass}
          >
            {loading === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <a href="/api/portal/integrations/google/connect" className={portalButtonClass}>
          Connect Google Drive
        </a>
      )}

      <DriveImportResultBox result={driveResult} />
    </div>
  );
}
