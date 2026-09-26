// import { invoke } from "@tauri-apps/api/core";
//
//
// export async function canvasApiIsHealthy(): Promise<boolean> {
//   try {
//     return await invoke<boolean>(
//       "canvas_is_healthy",
//     );
//   } catch {
//     return false;
//   }
// }
//
// export async function loadCanvasBoards(): Promise<CanvasBoardsResponse> {
//   return invoke<CanvasBoardsResponse>(
//     "load_canvas_boards",
//   );
// }
//
// export async function createCanvasBoard(
//   name: string,
// ): Promise<CanvasBoard> {
//   return invoke<CanvasBoard>(
//     "create_canvas_board",
//     {
//       name,
//     },
//   );
// }
//
// export async function updateCanvasBoardName(
//   boardId: string,
//   name: string,
// ): Promise<CanvasBoard> {
//   return invoke<CanvasBoard>(
//     "update_canvas_board_name",
//     {
//       boardId,
//       name,
//     },
//   );
// }
//
// export async function deleteCanvasBoard(
//   boardId: string,
// ): Promise<void> {
//   await invoke(
//     "delete_canvas_board",
//     {
//       boardId,
//     },
//   );
// }
//
// export async function setActiveCanvasBoard(
//   boardId: string,
// ): Promise<void> {
//   await invoke(
//     "set_active_canvas_board",
//     {
//       boardId,
//     },
//   );
// }
//
// export async function loadCanvasStore(
//   boardId = "",
// ): Promise<CanvasStore> {
//   return invoke<CanvasStore>(
//     "load_canvas_store",
//     {
//       boardId,
//     },
//   );
// }
//
// export async function saveCanvasStore(
//   boardId: string,
//   cards: CanvasCard[],
//   links: CanvasLink[],
//   viewport: CanvasViewport,
// ): Promise<void> {
//   await invoke(
//     "save_canvas_store",
//     {
//       boardId,
//       cards,
//       links,
//       viewport,
//     },
//   );
// }
//
// export async function uploadCanvasImage(
//   dataUrl: string,
//   name: string,
// ): Promise<UploadedCanvasImage> {
//   return invoke<UploadedCanvasImage>(
//     "upload_canvas_image",
//     {
//       dataUrl,
//       name,
//     },
//   );
// }
//
// export function normalizeImageUrl(
//   src: string,
// ): string {
//   return src;
// }
