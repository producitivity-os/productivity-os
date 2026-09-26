import type { CanvasObject } from "@productivity-os/canvas";
import {
  isWorkflowNode,
  type WorkflowTimerNode,
  type WorkflowTaskNode,
} from "../nodes/index.ts";
import { timerElapsed } from "../nodes/timer/lifecycle.ts";

type SoundState =
  | { kind: "task"; completed: boolean }
  | { kind: "timer"; status: WorkflowTimerNode["timerStatus"] };

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

function tone(frequencies: readonly number[], duration = 0.075, volume = 0.035): void {
  const destination = context();
  if (!destination) return;
  const now = destination.currentTime;
  frequencies.forEach((frequency, index) => {
    const start = now + index * duration;
    const gain = destination.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(destination.destination);
    const oscillator = destination.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  });
}

function soundState(object: CanvasObject): SoundState | null {
  if (!isWorkflowNode(object)) return null;
  if (object.nodeKind === "task")
    return { kind: "task", completed: (object as WorkflowTaskNode).completed };
  if (object.nodeKind === "timer")
    return { kind: "timer", status: (object as WorkflowTimerNode).timerStatus };
  return null;
}

/** Coordinates lifecycle sounds without coupling audio to node rendering. */
export class WorkflowSoundController {
  private previous = new Map<string, SoundState>();
  private tickSeconds = new Map<string, number>();
  private readonly ringCompletion: () => void;

  constructor(ringCompletion: () => void) {
    this.ringCompletion = ringCompletion;
  }

  prime(objects: readonly CanvasObject[]): void {
    this.previous = new Map(
      objects.flatMap((object) => {
        const state = soundState(object);
        return state ? [[object.id, state] as const] : [];
      }),
    );
    this.tickSeconds.clear();
    this.tick(objects);
  }

  observeMutation(objects: readonly CanvasObject[]): void {
    for (const object of objects) {
      const next = soundState(object);
      if (!next) continue;
      const previous = this.previous.get(object.id);
      if (next.kind === "task" && previous?.kind === "task" && !previous.completed && next.completed)
        tone([620, 830], 0.07, 0.045);
      if (next.kind === "timer" && previous?.kind === "timer" && previous.status !== next.status) {
        if (next.status === "running") tone([520, 690], 0.065, 0.035);
        else if (next.status === "paused") tone([420, 315], 0.07, 0.032);
        else if (next.status === "completed") {
          tone([660, 880, 1_045], 0.09, 0.045);
          this.ringCompletion();
        }
      }
      this.previous.set(object.id, next);
    }
  }

  tick(objects: readonly CanvasObject[], now = Date.now()): void {
    for (const object of objects) {
      if (!isWorkflowNode(object) || object.nodeKind !== "timer") continue;
      const timer = object as WorkflowTimerNode;
      if (timer.timerStatus !== "running") {
        this.tickSeconds.delete(timer.id);
        continue;
      }
      const second = Math.floor(timerElapsed(timer, now) / 1_000);
      const previous = this.tickSeconds.get(timer.id);
      this.tickSeconds.set(timer.id, second);
      if (previous !== undefined && previous !== second) tone([940], 0.025, 0.012);
    }
  }
}
