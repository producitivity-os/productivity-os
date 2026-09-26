import { File, FileImage, FileText, FileType2, FileVideo2 } from "lucide-react";

import type { MediaKind } from "@/api/media-data";

export function MediaKindIcon({ kind }: { kind: MediaKind }) {
  if (kind === "image") return <FileImage aria-hidden="true" />;
  if (kind === "video") return <FileVideo2 aria-hidden="true" />;
  if (kind === "pdf") return <FileType2 aria-hidden="true" />;
  if (kind === "document") return <FileText aria-hidden="true" />;
  return <File aria-hidden="true" />;
}
