import * as React from "react";

import { Button } from "./button";
import { cn } from "../../lib/utils";

type AttachmentProps = React.ComponentProps<"div"> & {
  state?: "idle" | "uploading" | "processing" | "error" | "done";
  size?: "default" | "sm" | "xs";
  orientation?: "horizontal" | "vertical";
};

function Attachment({
  className,
  state = "done",
  size = "default",
  orientation = "horizontal",
  ...props
}: AttachmentProps) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      data-size={size}
      data-orientation={orientation}
      className={cn(
        "group/attachment relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-colors",
        "data-[orientation=horizontal]:p-3 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:p-3",
        "data-[size=sm]:gap-2 data-[size=sm]:rounded-lg data-[size=sm]:p-2 data-[size=xs]:gap-1.5 data-[size=xs]:rounded-md data-[size=xs]:p-1.5",
        "data-[state=error]:border-destructive/40 data-[state=error]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentMedia({
  className,
  variant = "icon",
  ...props
}: React.ComponentProps<"div"> & { variant?: "icon" | "image" }) {
  return (
    <div
      data-slot="attachment-media"
      data-variant={variant}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground [&_svg]:size-4",
        "data-[variant=image]:aspect-[4/3] data-[variant=image]:h-auto data-[variant=image]:w-full data-[variant=image]:bg-muted [&_img]:size-full [&_img]:object-cover [&_video]:size-full [&_video]:object-cover",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-content"
      className={cn("grid min-w-0 flex-1 gap-0.5", className)}
      {...props}
    />
  );
}

function AttachmentTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-title"
      className={cn(
        "truncate text-sm font-medium group-data-[state=uploading]/attachment:animate-pulse group-data-[state=processing]/attachment:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-description"
      className={cn("truncate text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function AttachmentActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-actions"
      className={cn(
        "relative z-10 ml-auto flex shrink-0 items-center gap-1",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentAction({
  className,
  size = "icon-xs",
  variant = "ghost",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="attachment-action"
      className={cn("relative z-10", className)}
      size={size}
      variant={variant}
      {...props}
    />
  );
}

function AttachmentTrigger({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-slot="attachment-trigger"
      className={cn(
        "absolute inset-0 z-0 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}

function AttachmentGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="attachment-group"
      className={cn("flex min-w-0 gap-3 overflow-x-auto", className)}
      {...props}
    />
  );
}

export {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
};
export type { AttachmentProps };
