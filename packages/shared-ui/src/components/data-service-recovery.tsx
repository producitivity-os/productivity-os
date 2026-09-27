import * as React from "react";
import { AlertTriangle, Check, Copy, RefreshCw, X } from "lucide-react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export type DataServiceIssueKind =
  | "protocol_too_old"
  | "service_unavailable"
  | "migration_failure"
  | "request_failed";

export type DataServiceIssue = {
  kind: DataServiceIssueKind;
  message: string;
  actualProtocol?: number;
  requiredProtocol?: number;
  migrationVersion?: number;
};

const ISSUE_EVENT = "productivity-os:data-service-issue";
let currentIssue: DataServiceIssue | null = null;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error)
    return String((error as { message: unknown }).message);
  return "The shared data service could not complete the request.";
}

export function dataServiceIssueFrom(error: unknown): DataServiceIssue {
  const message = errorMessage(error);
  const protocol = message.match(
    /data service protocol\s+(\d+)\s+is older than required protocol\s+(\d+)/i,
  );
  if (protocol)
    return {
      kind: "protocol_too_old",
      message,
      actualProtocol: Number(protocol[1]),
      requiredProtocol: Number(protocol[2]),
    };

  const migration = message.match(/(?:VersionMismatch|migration[^\d]*)(\d{6,})/i);
  if (migration)
    return {
      kind: "migration_failure",
      message,
      migrationVersion: Number(migration[1]),
    };

  if (/offline|unavailable|not configured|connect|socket|refused|not found/i.test(message))
    return { kind: "service_unavailable", message };
  return { kind: "request_failed", message };
}

export function reportDataServiceIssue(error: unknown): DataServiceIssue {
  currentIssue = dataServiceIssueFrom(error);
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(ISSUE_EVENT, { detail: currentIssue }));
  return currentIssue;
}

export function clearDataServiceIssue(): void {
  currentIssue = null;
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(ISSUE_EVENT, { detail: null }));
}

export function useDataServiceIssue(): DataServiceIssue | null {
  const [issue, setIssue] = React.useState<DataServiceIssue | null>(currentIssue);
  React.useEffect(() => {
    const update = (event: Event) =>
      setIssue((event as CustomEvent<DataServiceIssue | null>).detail);
    window.addEventListener(ISSUE_EVENT, update);
    return () => window.removeEventListener(ISSUE_EVENT, update);
  }, []);
  return issue;
}

type DataServiceRecoveryDialogProps = {
  issue: DataServiceIssue | null;
  onRetry: () => void | Promise<void>;
  onClose: () => void | Promise<void>;
  restartCommand?: string;
};

export function DataServiceRecoveryDialog({
  issue,
  onRetry,
  onClose,
  restartCommand = "cargo run -p data-service",
}: DataServiceRecoveryDialogProps) {
  const [copied, setCopied] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  if (!issue) return null;

  const protocolMismatch = issue.kind === "protocol_too_old";
  const title = protocolMismatch
    ? "Update the data service"
    : issue.kind === "migration_failure"
      ? "The data service needs repair"
      : "The data service is unavailable";
  const description = protocolMismatch
    ? `Workflows needs protocol ${issue.requiredProtocol}, but protocol ${issue.actualProtocol} is running. Stop the old process and restart the updated data service.`
    : issue.kind === "migration_failure"
      ? `The database migration${issue.migrationVersion ? ` ${issue.migrationVersion}` : ""} does not match the installed service. Restart after updating the application files.`
      : "Start the shared data service, then retry. Your canvas remains unchanged.";

  return (
    <Dialog open modal>
      <DialogContent showCloseButton={false} className="max-w-[390px]">
        <DialogHeader>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/12 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <code className="select-all rounded-md border bg-muted px-3 py-2 font-mono text-[11px] text-foreground">
          {restartCommand}
        </code>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => void onClose()}>
            <X /> Close
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(restartCommand).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1_500);
              });
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy command"}
          </Button>
          <Button
            type="button"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              void Promise.resolve(onRetry()).finally(() => setRetrying(false));
            }}
          >
            <RefreshCw className={retrying ? "animate-spin" : undefined} /> Retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

