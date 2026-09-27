import { useEffect, type PropsWithChildren } from "react";

import { ApplicationContextMenu } from "./application-context-menu";
import { TooltipProvider } from "./ui/tooltip";

type SharedUiProviderProps = PropsWithChildren<{
  tooltipDelayDuration?: number;
  suppressNativeContextMenu?: boolean;
  applicationContextMenu?: boolean;
  applicationBackgroundMenu?: "none" | "reload";
}>;

function SharedUiProvider({
  children,
  tooltipDelayDuration = 0,
  suppressNativeContextMenu = true,
  applicationContextMenu = true,
  applicationBackgroundMenu = "none",
}: SharedUiProviderProps) {
  useEffect(() => {
    if (!suppressNativeContextMenu) return undefined;
    const preventNativeMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventNativeMenu);
    return () => document.removeEventListener("contextmenu", preventNativeMenu);
  }, [suppressNativeContextMenu]);

  const content = applicationContextMenu ? (
    <ApplicationContextMenu backgroundAction={applicationBackgroundMenu}>
      <div className="contents">{children}</div>
    </ApplicationContextMenu>
  ) : (
    children
  );
  return (
    <TooltipProvider delayDuration={tooltipDelayDuration}>
      {content}
    </TooltipProvider>
  );
}

export { SharedUiProvider };
export type { SharedUiProviderProps };
