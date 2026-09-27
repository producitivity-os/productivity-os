import * as React from "react";
import { BookMarked } from "lucide-react";
import { Graphics, Sprite, Text } from "pixi.js";
import { imageTextureFor } from "@productivity-os/canvas";
import { DurationPicker } from "@productivity-os/shared-ui/components/duration-picker";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@productivity-os/shared-ui/components/ui/combobox";
import {
  WorkflowNodeButton,
  WorkflowNodeProgressBar,
  type BookEntity,
  type WorkflowPluginActionResult,
  type WorkflowNodePickerPreviewProps,
  type WorkflowNodePluginPackage,
  type WorkflowPluginNode,
  type WorkflowPluginPropertiesProps,
} from "@productivity-os/workflow-plugin-sdk";
import { bookNodeTheme, bookPalette } from "./theme";

const playIconUrl = new URL(
  "../../../apps/Workflows/src/assets/svg/play-1003-svgrepo-com.svg",
  import.meta.url,
).href;

function previewStyle(
  palette: WorkflowNodePickerPreviewProps["palette"],
): React.CSSProperties {
  return {
    "--workflow-plugin-surface": palette.surface,
    "--workflow-plugin-border": palette.border,
    "--workflow-plugin-foreground": palette.foreground,
    "--workflow-plugin-muted": palette.mutedForeground,
  } as React.CSSProperties;
}

function ReadingLogPreview({ palette }: WorkflowNodePickerPreviewProps) {
  return (
    <span
      className="workflow-plugin-node-preview"
      style={previewStyle(palette)}
    >
      <span className="workflow-plugin-preview-cover" aria-hidden="true" />
      <span className="workflow-plugin-preview-copy">
        <strong>Reading Log</strong>
        <small>Set a page range</small>
      </span>
    </span>
  );
}

function ReadBookPreview({ palette }: WorkflowNodePickerPreviewProps) {
  return (
    <span
      className="workflow-plugin-node-preview"
      style={previewStyle(palette)}
    >
      <span className="workflow-plugin-preview-icon" aria-hidden="true">
        <img src={playIconUrl} alt="" />
      </span>
      <span className="workflow-plugin-preview-copy">
        <strong>Read Book</strong>
        <small>Choose a Book</small>
      </span>
      <small>25:00</small>
    </span>
  );
}

type ReadingSession = {
  id: string;
  startPage: number;
  endPage: number;
  pagesRead: number;
  currentPage: number;
  loggedAt: number;
};

type ReadingLogData = Record<string, unknown> & {
  bookEntityId: string | null;
  fallbackTitle: string;
  fallbackAuthor: string;
  fallbackCoverMediaId: string | null;
  fallbackCoverWidth: number | null;
  fallbackCoverHeight: number | null;
  startPage: number | null;
  endPage: number | null;
  sessions: ReadingSession[];
};

const createData = (): ReadingLogData => ({
  bookEntityId: null,
  fallbackTitle: "",
  fallbackAuthor: "",
  fallbackCoverMediaId: null,
  fallbackCoverWidth: null,
  fallbackCoverHeight: null,
  startPage: null,
  endPage: null,
  sessions: [],
});

type ReadBookData = Record<string, unknown> & {
  bookEntityId: string | null;
  fallbackTitle: string;
  fallbackAuthor: string;
  durationMs: number;
  elapsedMs: number;
  startedAt: number | null;
  status: "idle" | "running" | "paused" | "completed";
};

const createReadBookData = (): ReadBookData => ({
  bookEntityId: null,
  fallbackTitle: "",
  fallbackAuthor: "",
  durationMs: 25 * 60_000,
  elapsedMs: 0,
  startedAt: null,
  status: "idle",
});

function readBookElapsed(data: ReadBookData, now = Date.now()): number {
  const running =
    data.status === "running" && data.startedAt !== null
      ? Math.max(0, now - data.startedAt)
      : 0;
  return Math.min(data.durationMs, Math.max(0, data.elapsedMs + running));
}

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function snapshotBook(
  data: ReadingLogData,
  book: BookEntity | null,
): ReadingLogData {
  if (!book) return data;
  return {
    ...data,
    bookEntityId: book.cardId,
    fallbackTitle: book.title,
    fallbackAuthor: book.authorName,
    fallbackCoverMediaId: book.coverMediaId,
    fallbackCoverWidth: book.coverWidth,
    fallbackCoverHeight: book.coverHeight,
  };
}

function ReadingLogProperties({
  node,
  services,
  completeNode,
  canInteract,
}: WorkflowPluginPropertiesProps<ReadingLogData>) {
  const source = { ...createData(), ...node.pluginData };
  const [books, setBooks] = React.useState<BookEntity[]>([]);
  const [draft, setDraft] = React.useState(source);
  React.useEffect(() => {
    let cancelled = false;
    void services.listBooks().then(async (items) => {
      if (cancelled) return;
      setBooks(items);
      if (!draft.bookEntityId) {
        const current = await services.getPreference<string>(
          "workflows.book-nodes",
          "currentBookId",
        );
        const book = items.find((item) => item.cardId === current);
        if (book && !cancelled) {
          const next = snapshotBook(draft, book);
          setDraft(next);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [node.id]);
  const selected =
    books.find((book) => book.cardId === draft.bookEntityId) ?? null;
  const startValid =
    Number.isInteger(draft.startPage) && (draft.startPage ?? 0) > 0;
  const endValid =
    Number.isInteger(draft.endPage) &&
    (draft.endPage ?? 0) >= (draft.startPage ?? 1);
  const log = () => {
    if (!selected || !startValid || !endValid) return;
    const startPage = draft.startPage!;
    const endPage = draft.endPage!;
    const entry: ReadingSession = {
      id: crypto.randomUUID(),
      startPage,
      endPage,
      pagesRead: endPage - startPage + 1,
      currentPage: endPage,
      loggedAt: Date.now(),
    };
    const sessions =
      node.completed && draft.sessions.length
        ? [
            ...draft.sessions.slice(0, -1),
            { ...entry, id: draft.sessions.at(-1)!.id },
          ]
        : [...draft.sessions, entry];
    const next = { ...snapshotBook(draft, selected), sessions };
    void services.setPreference(
      "workflows.book-nodes",
      "currentBookId",
      selected.cardId,
    );
    completeNode(next);
  };
  return (
    <>
      <div className="workflow-book-combobox">
        <span>Book</span>
        <Combobox
          items={books}
          value={selected}
          onValueChange={(book) => {
            const next = snapshotBook(draft, book as BookEntity | null);
            setDraft(next);
          }}
          itemToStringValue={(book) => (book as BookEntity).title}
        >
          <ComboboxInput
            placeholder="Choose a Book from Notes"
            showClear={false}
          />
          <ComboboxContent>
            <ComboboxEmpty>No Books found in Notes.</ComboboxEmpty>
            <ComboboxList>
              {(book: BookEntity) => (
                <ComboboxItem key={book.cardId} value={book}>
                  {book.coverMediaId ? (
                    <img
                      src={services.bookCoverUrl(book.coverMediaId)}
                      alt=""
                    />
                  ) : (
                    <span className="workflow-book-option-placeholder">
                      <BookMarked />
                    </span>
                  )}
                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.authorName || book.notebookTitle}</small>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {!selected && (
        <small className="workflow-plugin-field-error">
          Choose a Book from Notes.
        </small>
      )}
      <label className="canvas-property-control">
        <span>Start page</span>
        <input
          type="number"
          min={1}
          step={1}
          value={draft.startPage ?? ""}
          aria-invalid={draft.startPage !== null && !startValid}
          onChange={(event) =>
            setDraft({
              ...draft,
              startPage: event.currentTarget.value
                ? event.currentTarget.valueAsNumber
                : null,
            })
          }
        />
      </label>
      {draft.startPage !== null && !startValid && (
        <small className="workflow-plugin-field-error">
          Enter a positive whole page.
        </small>
      )}
      <label className="canvas-property-control">
        <span>End page</span>
        <input
          type="number"
          min={draft.startPage ?? 1}
          step={1}
          value={draft.endPage ?? ""}
          aria-invalid={draft.endPage !== null && !endValid}
          onChange={(event) =>
            setDraft({
              ...draft,
              endPage: event.currentTarget.value
                ? event.currentTarget.valueAsNumber
                : null,
            })
          }
        />
      </label>
      {draft.endPage !== null && !endValid && (
        <small className="workflow-plugin-field-error">
          End page must be at least the start page.
        </small>
      )}
      {startValid && endValid && (
        <div className="workflow-plugin-summary">
          <span>{draft.endPage! - draft.startPage! + 1} pages</span>
          <span>Current page {draft.endPage}</span>
        </div>
      )}
      <button
        type="button"
        className="workflow-plugin-primary-action"
        disabled={!canInteract || !selected || !startValid || !endValid}
        onClick={log}
      >
        {node.completed ? "Update session" : "Log session"}
      </button>
    </>
  );
}

function ReadBookProperties({
  node,
  services,
  updateNode,
}: WorkflowPluginPropertiesProps<ReadBookData>) {
  const data = { ...createReadBookData(), ...node.pluginData };
  const [books, setBooks] = React.useState<BookEntity[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    void services.listBooks().then((items) => {
      if (!cancelled) setBooks(items);
    });
    return () => {
      cancelled = true;
    };
  }, [node.id, services]);
  const selected =
    books.find((book) => book.cardId === data.bookEntityId) ?? null;
  return (
    <>
      <div className="workflow-book-combobox">
        <span>Book</span>
        <Combobox
          items={books}
          value={selected}
          onValueChange={(book) => {
            const selectedBook = book as BookEntity | null;
            updateNode({
              pluginData: selectedBook
                ? {
                    ...data,
                    bookEntityId: selectedBook.cardId,
                    fallbackTitle: selectedBook.title,
                    fallbackAuthor: selectedBook.authorName,
                  }
                : {
                    ...data,
                    bookEntityId: null,
                    fallbackTitle: "",
                    fallbackAuthor: "",
                  },
            });
          }}
          itemToStringValue={(book) => (book as BookEntity).title}
        >
          <ComboboxInput
            placeholder="Choose a Book from Notes"
            showClear={false}
          />
          <ComboboxContent>
            <ComboboxEmpty>No Books found in Notes.</ComboboxEmpty>
            <ComboboxList>
              {(book: BookEntity) => (
                <ComboboxItem key={book.cardId} value={book}>
                  {book.coverMediaId ? (
                    <img
                      src={services.bookCoverUrl(book.coverMediaId)}
                      alt=""
                    />
                  ) : (
                    <span className="workflow-book-option-placeholder">
                      <BookMarked />
                    </span>
                  )}
                  <span>
                    <strong>{book.title}</strong>
                    <small>{book.authorName || book.notebookTitle}</small>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      <label className="canvas-property-control">
        <span>Duration</span>
        <DurationPicker
          valueMs={data.durationMs}
          onChange={(durationMs) =>
            updateNode({ pluginData: { ...data, durationMs } })
          }
        />
      </label>
      <div className="workflow-plugin-summary">
        <span>{data.status === "idle" ? "Ready" : data.status}</span>
        <span>{formatRemaining(data.durationMs - readBookElapsed(data))}</span>
      </div>
    </>
  );
}

const readBookProgress = new WorkflowNodeProgressBar<
  WorkflowPluginNode<ReadBookData>
>({
  id: "read-book:progress",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node, now) => {
    const data = { ...createReadBookData(), ...node.pluginData };
    return readBookElapsed(data, now) / Math.max(1, data.durationMs);
  },
  theme: bookNodeTheme.progress,
  radius: 20,
  animationDurationMs: 300,
});

const readingLogProgress = new WorkflowNodeProgressBar<
  WorkflowPluginNode<ReadingLogData>
>({
  id: "reading-log:progress",
  bounds: (node) => ({ x: 0, y: 0, width: node.width, height: node.height }),
  value: (node) => (node.completed ? 1 : 0),
  theme: bookNodeTheme.progress,
  radius: 20,
  animationDurationMs: 300,
});

const readBookButton = new WorkflowNodeButton<
  WorkflowPluginNode<ReadBookData>,
  WorkflowPluginPropertiesProps<ReadBookData>["services"],
  WorkflowPluginActionResult<ReadBookData>
>({
  id: "read-book:toggle",
  bounds: (node) => ({ x: 12, y: node.height / 2 - 18, width: 36, height: 36 }),
  icon: (node) => {
    const data = { ...createReadBookData(), ...node.pluginData };
    return data.status === "running"
      ? "pause"
      : data.status === "completed"
        ? "reset"
        : "play";
  },
  theme: (node) =>
    ({ ...createReadBookData(), ...node.pluginData }).status === "running"
      ? bookNodeTheme.runningTimerButton
      : bookNodeTheme.timerButton,
  onPress({ node }) {
    const data = { ...createReadBookData(), ...node.pluginData };
    const now = Date.now();
    if (!data.bookEntityId)
      throw new Error("Choose a Book before starting the timer.");
    if (data.status === "running")
      return {
        pluginData: {
          ...data,
          elapsedMs: readBookElapsed(data, now),
          startedAt: null,
          status: "paused" as const,
        },
      };
    const restarting = data.status === "completed";
    return {
      pluginData: {
        ...data,
        elapsedMs: restarting ? 0 : data.elapsedMs,
        startedAt: now,
        status: "running" as const,
      },
      nodePatch: restarting ? { completed: false } : undefined,
    };
  },
});

function renderReadingLogContents(
  target: import("pixi.js").Container,
  node: WorkflowPluginNode<ReadingLogData>,
  services: WorkflowPluginPropertiesProps<ReadingLogData>["services"],
  inverted: boolean,
): void {
  const data = { ...createData(), ...node.pluginData };
  const live = data.bookEntityId
    ? services.resolveBook(data.bookEntityId)
    : null;
  const title = live?.title || data.fallbackTitle || "Choose a Book";
  const coverMediaId = live?.coverMediaId ?? data.fallbackCoverMediaId;
  const coverX = 12,
    coverY = 10,
    coverWidth = 40,
    coverHeight = Math.max(44, node.height - 20);
  if (coverMediaId) {
    const texture = imageTextureFor(
      services.bookCoverUrl(coverMediaId, "thumbnail"),
      services.bookCoverUrl(coverMediaId, "content"),
    );
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.position.set(coverX, coverY);
      sprite.width = coverWidth;
      sprite.height = coverHeight;
      const mask = new Graphics()
        .roundRect(coverX, coverY, coverWidth, coverHeight, 7)
        .fill({ color: bookNodeTheme.clipMask });
      sprite.mask = mask;
      target.addChild(mask, sprite);
    } else
      target.addChild(
        new Graphics()
          .roundRect(coverX, coverY, coverWidth, coverHeight, 7)
          .fill({
            color: inverted
              ? bookNodeTheme.surface
              : bookNodeTheme.coverPlaceholder,
          })
          .stroke({
            color: inverted ? bookNodeTheme.surface : bookNodeTheme.border,
            width: 1,
          }),
      );
  } else
    target.addChild(
      new Graphics()
        .roundRect(coverX, coverY, coverWidth, coverHeight, 7)
        .fill({
          color: inverted
            ? bookNodeTheme.surface
            : bookNodeTheme.coverPlaceholder,
        })
        .stroke({
          color: inverted ? bookNodeTheme.surface : bookNodeTheme.border,
          width: 1,
        }),
    );
  const foreground = inverted
    ? bookNodeTheme.surface
    : bookNodeTheme.foreground;
  const muted = inverted
    ? bookNodeTheme.surface
    : bookNodeTheme.mutedForeground;
  const heading = new Text({
    text: title,
    style: {
      fill: foreground,
      fontFamily: bookNodeTheme.typography.fontFamily,
      fontSize: bookNodeTheme.typography.titleSize,
      fontWeight: bookNodeTheme.typography.titleWeight,
      wordWrap: true,
      wordWrapWidth: node.width - 76,
    },
  });
  heading.position.set(64, 16);
  target.addChild(heading);
  const latest = data.sessions.at(-1);
  const detail = latest
    ? `Pages ${latest.startPage}–${latest.endPage}  ·  ${latest.pagesRead} read`
    : "Set a page range in Properties";
  const detailText = new Text({
    text: detail,
    style: {
      fill: muted,
      fontFamily: bookNodeTheme.typography.fontFamily,
      fontSize: bookNodeTheme.typography.detailSize,
      fontWeight: bookNodeTheme.typography.detailWeight,
    },
  });
  detailText.position.set(64, Math.min(node.height - 20, 56));
  target.addChild(detailText);
  if (latest) {
    const current = new Text({
      text: `Current page ${latest.currentPage}`,
      style: {
        fill: muted,
        fontFamily: bookNodeTheme.typography.fontFamily,
        fontSize: bookNodeTheme.typography.footnoteSize,
      },
    });
    current.position.set(64, Math.min(node.height - 8, 73));
    target.addChild(current);
  }
}

function renderReadBookContents(
  target: import("pixi.js").Container,
  node: WorkflowPluginNode<ReadBookData>,
  services: WorkflowPluginPropertiesProps<ReadBookData>["services"],
  inverted: boolean,
): void {
  const data = { ...createReadBookData(), ...node.pluginData };
  const book = data.bookEntityId
    ? services.resolveBook(data.bookEntityId)
    : null;
  const title = book?.title || data.fallbackTitle || "Choose a Book";
  const elapsed = readBookElapsed(data);
  const foreground = inverted
    ? bookNodeTheme.surface
    : bookNodeTheme.foreground;
  const muted = inverted
    ? bookNodeTheme.surface
    : bookNodeTheme.mutedForeground;
  const heading = new Text({
    text: title,
    style: {
      fill: foreground,
      fontFamily: bookNodeTheme.typography.fontFamily,
      fontSize: bookNodeTheme.typography.titleSize,
      fontWeight: bookNodeTheme.typography.strongTitleWeight,
    },
  });
  heading.position.set(58, 16);
  target.addChild(heading);
  const status = new Text({
    text: data.status === "idle" ? "Ready to read" : data.status,
    style: {
      fill: muted,
      fontFamily: bookNodeTheme.typography.fontFamily,
      fontSize: bookNodeTheme.typography.detailSize,
      fontWeight: bookNodeTheme.typography.detailWeight,
    },
  });
  status.position.set(58, 43);
  target.addChild(status);
  const remaining = new Text({
    text: formatRemaining(data.durationMs - elapsed),
    style: {
      fill: foreground,
      fontFamily: bookNodeTheme.typography.fontFamily,
      fontSize: bookNodeTheme.typography.timerSize,
      fontWeight: bookNodeTheme.typography.timerWeight,
    },
  });
  remaining.anchor.set(1, 0.5);
  remaining.position.set(node.width - 16, node.height / 2);
  target.addChild(remaining);
}

const plugin: WorkflowNodePluginPackage = {
  manifest: {
    id: "workflows.book-nodes",
    name: "Book Nodes",
    version: "1.0.0",
    description: "Log reading sessions with Books from Notes.",
    marketplace: true,
    defaultInstalled: true,
    app: {
      id: "books",
      name: "Books",
      icon: BookMarked,
      launchTarget: "notes",
      palette: bookPalette,
    },
  },
  nodes: [
    {
      nodeType: "reading-log",
      title: "Reading Log",
      description: "Record pages read from a Notes Book",
      icon: BookMarked,
      schemaVersion: 1,
      defaultSize: { width: 320, height: 72 },
      NodePickerPreview: ReadingLogPreview,
      createData,
      migrate: (data) => ({
        ...createData(),
        ...data,
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
      }),
      PropertiesEditor: ReadingLogProperties,
      progressBars: [readingLogProgress],
      render(target, rawNode, _context, services) {
        const node = rawNode as WorkflowPluginNode<ReadingLogData>;
        readingLogProgress.renderContent(
          target,
          node,
          services,
          (content, contentNode, contentServices, inverted) =>
            renderReadingLogContents(
              content,
              contentNode,
              contentServices,
              inverted,
            ),
        );
        target.addChild(
          new Graphics()
            .roundRect(0, 0, node.width, node.height, 20)
            .stroke({ color: bookNodeTheme.border, width: 1.5 }),
        );
      },
      reset: (data) => ({ ...data }),
    },
    {
      nodeType: "read-book",
      title: "Read Book",
      description: "Read a selected Book for a timed session",
      icon: BookMarked,
      schemaVersion: 1,
      defaultSize: { width: 280, height: 72 },
      NodePickerPreview: ReadBookPreview,
      createData: createReadBookData,
      migrate: (data) => ({ ...createReadBookData(), ...data }),
      PropertiesEditor: ReadBookProperties,
      buttons: [readBookButton],
      progressBars: [readBookProgress],
      onTick(node, now) {
        const data = { ...createReadBookData(), ...node.pluginData };
        if (
          data.status !== "running" ||
          readBookElapsed(data, now) < data.durationMs
        )
          return;
        return {
          pluginData: {
            ...data,
            elapsedMs: data.durationMs,
            startedAt: null,
            status: "completed",
          },
          complete: !node.completed,
        };
      },
      render(target, rawNode, _context, services) {
        const node = rawNode as WorkflowPluginNode<ReadBookData>;
        readBookProgress.renderContent(
          target,
          node,
          services,
          (content, contentNode, contentServices, inverted) =>
            renderReadBookContents(
              content,
              contentNode,
              contentServices,
              inverted,
            ),
        );
        target.addChild(
          new Graphics()
            .roundRect(0, 0, node.width, node.height, 20)
            .stroke({ color: bookNodeTheme.border, width: 1.5 }),
        );
      },
      reset: (data) => ({
        ...createReadBookData(),
        bookEntityId:
          typeof data.bookEntityId === "string" ? data.bookEntityId : null,
        fallbackTitle:
          typeof data.fallbackTitle === "string" ? data.fallbackTitle : "",
        fallbackAuthor:
          typeof data.fallbackAuthor === "string" ? data.fallbackAuthor : "",
        durationMs: Number(data.durationMs) || 25 * 60_000,
      }),
    },
  ],
};

export default plugin;
