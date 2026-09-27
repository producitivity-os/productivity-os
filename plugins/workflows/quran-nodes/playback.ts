import type {
  QuranRecording,
  QuranRecordingSegment,
  WorkflowPluginServices,
} from "@productivity-os/workflow-plugin-sdk";

type PlaybackState = {
  playheadMs: number;
  selectionMs: number | null;
  playing: boolean;
  dragging: boolean;
};

type DerivedPeaks = { durationMs: number; peaks: number[] };

export function quranRecordingSourceAt(
  recording: QuranRecording,
  positionMs: number,
): { segmentIndex: number; segment: QuranRecordingSegment; sourcePositionMs: number } | null {
  const position = Math.max(0, Math.min(recording.durationMs, positionMs));
  const segmentIndex = recording.segments.findIndex((segment) =>
    position >= segment.startMs && position < segment.startMs + segment.durationMs,
  );
  const segment = recording.segments[segmentIndex];
  return segment
    ? {
        segmentIndex,
        segment,
        sourcePositionMs: segment.sourceStartMs + position - segment.startMs,
      }
    : null;
}

const EMPTY_STATE: PlaybackState = {
  playheadMs: 0,
  selectionMs: null,
  playing: false,
  dragging: false,
};

export class QuranRecordingPlaybackController {
  private readonly states = new Map<string, PlaybackState>();
  private readonly recordings = new Map<string, QuranRecording>();
  private readonly derivedPeaks = new Map<string, DerivedPeaks>();
  private readonly loadingPeaks = new Set<string>();
  private active: { nodeId: string; audio: HTMLAudioElement; segmentIndex: number } | null = null;
  private frame = 0;
  private services: WorkflowPluginServices | null = null;

  bind(nodeId: string, recording: QuranRecording | null, services: WorkflowPluginServices): void {
    this.services = services;
    if (!recording) {
      if (this.recordings.delete(nodeId) || this.active?.nodeId === nodeId)
        this.resetPlayback(nodeId, true);
      return;
    }
    const previous = this.recordings.get(nodeId);
    this.recordings.set(nodeId, recording);
    if (
      previous &&
      (previous.id !== recording.id || previous.updatedAt !== recording.updatedAt)
    )
      this.resetPlayback(nodeId, true);
    const state = this.mutableState(nodeId);
    state.playheadMs = Math.min(state.playheadMs, recording.durationMs);
    void this.ensureLegacyPeaks(recording);
  }

  state(nodeId: string): Readonly<PlaybackState> {
    return this.states.get(nodeId) ?? EMPTY_STATE;
  }

  selection(nodeId: string): number | null {
    return this.states.get(nodeId)?.selectionMs ?? null;
  }

  beginScrub(nodeId: string, positionMs: number): void {
    this.stopAudio();
    const state = this.mutableState(nodeId);
    state.dragging = true;
    state.playing = false;
    state.selectionMs = this.clampPosition(nodeId, positionMs);
    state.playheadMs = state.selectionMs;
    this.render();
  }

  moveScrub(nodeId: string, positionMs: number): void {
    const state = this.mutableState(nodeId);
    if (!state.dragging) return;
    state.selectionMs = this.clampPosition(nodeId, positionMs);
    state.playheadMs = state.selectionMs;
    this.render();
  }

  endScrub(nodeId: string, positionMs: number): void {
    const state = this.mutableState(nodeId);
    state.dragging = false;
    state.selectionMs = this.clampPosition(nodeId, positionMs);
    state.playheadMs = state.selectionMs;
    void this.play(nodeId, state.playheadMs);
  }

  cancelScrub(nodeId: string): void {
    const state = this.mutableState(nodeId);
    state.dragging = false;
    state.selectionMs = null;
    state.playing = false;
    this.render();
  }

  clearSelection(nodeId: string): void {
    const state = this.mutableState(nodeId);
    state.selectionMs = null;
    state.dragging = false;
    this.render();
  }

  stop(nodeId: string, clearSelection = false): void {
    if (this.resetPlayback(nodeId, clearSelection)) this.render();
  }

  private resetPlayback(nodeId: string, clearSelection: boolean): boolean {
    let changed = false;
    if (this.active?.nodeId === nodeId) {
      this.stopAudio();
      changed = true;
    }
    const state = this.states.get(nodeId);
    if (!state) return changed;
    changed ||= state.playing || state.dragging;
    state.playing = false;
    state.dragging = false;
    if (clearSelection) {
      changed ||= state.selectionMs !== null || state.playheadMs !== 0;
      state.selectionMs = null;
      state.playheadMs = 0;
    }
    return changed;
  }

  waveform(nodeId: string, bins = 72): number[] {
    const recording = this.recordings.get(nodeId);
    if (!recording || recording.durationMs <= 0) return [];
    const output = Array.from({ length: bins }, () => 0);
    for (const segment of recording.segments) {
      const peaks = this.segmentPeaks(segment);
      if (peaks.length === 0 || segment.durationMs <= 0) continue;
      for (let index = 0; index < peaks.length; index++) {
        const timelineMs = segment.startMs + (index + 0.5) / peaks.length * segment.durationMs;
        const outputIndex = Math.min(bins - 1, Math.floor(timelineMs / recording.durationMs * bins));
        output[outputIndex] = Math.max(output[outputIndex], peaks[index] ?? 0);
      }
    }
    return output;
  }

  dispose(): void {
    this.stopAudio();
    this.states.clear();
    this.recordings.clear();
    this.derivedPeaks.clear();
    this.loadingPeaks.clear();
  }

  private async play(nodeId: string, positionMs: number): Promise<void> {
    const recording = this.recordings.get(nodeId);
    if (!recording || recording.durationMs <= 0 || typeof Audio === "undefined") return;
    const source = quranRecordingSourceAt(recording, positionMs);
    if (!source) {
      this.finish(nodeId, recording.durationMs);
      return;
    }
    await this.playSegment(nodeId, recording, source.segmentIndex, positionMs);
  }

  private async playSegment(
    nodeId: string,
    recording: QuranRecording,
    segmentIndex: number,
    positionMs: number,
  ): Promise<void> {
    const segment = recording.segments[segmentIndex];
    if (!segment || !this.services) return;
    this.stopAudio();
    const audio = new Audio(this.services.quranRecordingUrl(segment.mediaId));
    audio.preload = "auto";
    const sourcePosition = quranRecordingSourceAt(recording, positionMs)?.sourcePositionMs
      ?? segment.sourceStartMs;
    this.active = { nodeId, audio, segmentIndex };
    const state = this.mutableState(nodeId);
    state.playing = true;
    state.playheadMs = positionMs;
    const advance = () => {
      if (this.active?.audio !== audio) return;
      const elapsed = Math.max(0, audio.currentTime * 1_000 - segment.sourceStartMs);
      state.playheadMs = Math.min(segment.startMs + segment.durationMs, segment.startMs + elapsed);
      this.render();
      if (elapsed + 12 >= segment.durationMs || audio.ended) {
        const next = recording.segments[segmentIndex + 1];
        if (next) void this.playSegment(nodeId, recording, segmentIndex + 1, next.startMs);
        else this.finish(nodeId, recording.durationMs);
        return;
      }
      this.frame = requestAnimationFrame(advance);
    };
    audio.addEventListener("ended", advance, { once: true });
    try {
      if (audio.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("Recording could not be loaded.")), { once: true });
        });
      }
      if (this.active?.audio !== audio) return;
      audio.currentTime = sourcePosition / 1_000;
      await audio.play();
      this.frame = requestAnimationFrame(advance);
    } catch {
      if (this.active?.audio === audio) this.stop(nodeId);
    }
  }

  private finish(nodeId: string, durationMs: number): void {
    this.stopAudio();
    const state = this.mutableState(nodeId);
    state.playing = false;
    state.playheadMs = durationMs;
    state.selectionMs = null;
    state.dragging = false;
    this.render();
  }

  private stopAudio(): void {
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.active) {
      this.active.audio.pause();
      this.active.audio.removeAttribute("src");
      this.active.audio.load();
      const state = this.states.get(this.active.nodeId);
      if (state) state.playing = false;
    }
    this.active = null;
  }

  private mutableState(nodeId: string): PlaybackState {
    let state = this.states.get(nodeId);
    if (!state) {
      state = { ...EMPTY_STATE };
      this.states.set(nodeId, state);
    }
    return state;
  }

  private clampPosition(nodeId: string, positionMs: number): number {
    return Math.max(0, Math.min(this.recordings.get(nodeId)?.durationMs ?? 0, positionMs));
  }

  private render(): void {
    this.services?.requestRender();
  }

  private segmentPeaks(segment: QuranRecordingSegment): readonly number[] {
    if (segment.waveformPeaks.length > 0) return segment.waveformPeaks;
    const derived = this.derivedPeaks.get(segment.id);
    if (!derived || derived.durationMs <= 0) return [];
    const start = Math.floor(segment.sourceStartMs / derived.durationMs * derived.peaks.length);
    const end = Math.ceil((segment.sourceStartMs + segment.durationMs) / derived.durationMs * derived.peaks.length);
    return derived.peaks.slice(Math.max(0, start), Math.min(derived.peaks.length, end));
  }

  private async ensureLegacyPeaks(recording: QuranRecording): Promise<void> {
    const services = this.services;
    if (typeof AudioContext === "undefined" || !services) return;
    for (const segment of recording.segments) {
      if (segment.waveformPeaks.length > 0 || this.derivedPeaks.has(segment.id) || this.loadingPeaks.has(segment.id)) continue;
      this.loadingPeaks.add(segment.id);
      try {
        const response = await fetch(services.quranRecordingUrl(segment.mediaId));
        const bytes = await response.arrayBuffer();
        const context = new AudioContext();
        try {
          const buffer = await context.decodeAudioData(bytes.slice(0));
          const samples = buffer.getChannelData(0);
          const count = Math.min(256, Math.max(24, Math.ceil(buffer.duration * 8)));
          const peaks = Array.from({ length: count }, (_, index) => {
            const start = Math.floor(index / count * samples.length);
            const end = Math.max(start + 1, Math.floor((index + 1) / count * samples.length));
            let peak = 0;
            for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
            return peak;
          });
          this.derivedPeaks.set(segment.id, { durationMs: buffer.duration * 1_000, peaks });
          this.render();
          void services.cacheQuranRecordingSegmentPeaks(segment.id, peaks).catch(() => undefined);
        } finally {
          await context.close().catch(() => undefined);
        }
      } catch {
        // A quiet placeholder remains available when the platform cannot decode legacy audio.
      } finally {
        this.loadingPeaks.delete(segment.id);
      }
    }
  }
}

export const quranPlayback = new QuranRecordingPlaybackController();
