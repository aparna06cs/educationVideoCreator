import { useSyncExternalStore } from "react";
import type { BuildStage, Lesson, Scene } from "./lesson-types";

export type BuildState = {
  stage: BuildStage;
  message: string;
  error: string | null;
  imagesDone: number;
  audioDone: number;
  /** The part currently being built (or, once finished, the last one built). */
  lesson: Lesson | null;
  /** All parts completed so far this build — length 1 unless the source was split. */
  lessons: Lesson[];
  totalParts: number;
  seriesTitle: string | null;
};

const initialState: BuildState = {
  stage: "idle",
  message: "",
  error: null,
  imagesDone: 0,
  audioDone: 0,
  lesson: null,
  lessons: [],
  totalParts: 1,
  seriesTitle: null,
};

let state: BuildState = initialState;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const lessonStore = {
  get: () => state,
  set(patch: Partial<BuildState>) {
    state = { ...state, ...patch };
    emit();
  },
  updateScene(id: string, patch: Partial<Scene>) {
    if (!state.lesson) return;
    state = {
      ...state,
      lesson: {
        ...state.lesson,
        scenes: state.lesson.scenes.map((scene) =>
          scene.id === id ? { ...scene, ...patch } : scene,
        ),
      },
    };
    emit();
  },
  reset() {
    const lessonsToClean = state.lessons.length ? state.lessons : state.lesson ? [state.lesson] : [];
    for (const lesson of lessonsToClean) {
      for (const scene of lesson.scenes) {
        if (scene.audioUrl?.startsWith("blob:")) URL.revokeObjectURL(scene.audioUrl);
      }
    }
    state = initialState;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useBuildState(): BuildState {
  return useSyncExternalStore(
    lessonStore.subscribe,
    lessonStore.get,
    () => initialState,
  );
}
