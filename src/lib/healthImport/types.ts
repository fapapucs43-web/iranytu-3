/** Shared types for the health import (Batch 9). One shape, two sources. */

/** One measurement: the app-day it belongs to and the value. */
export type HealthSample = {
  /** ISO day "YYYY-MM-DD" — the app's own entry key. */
  day: string;
  /** Normalized value: bpm, %, or minutes depending on the series. */
  value: number;
};

/** day → summed/averaged value for that day. */
export type HealthDaySummary = Record<string, number>;

/** Sleep stage as the app understands it, regardless of source vocabulary. */
export type SleepStage = "asleep" | "deep" | "rem" | "awake" | "inbed";

/** One workout, mapped toward the app's sport select vocabulary. */
export type HealthWorkout = {
  day: string;
  minutes: number;
  kind: "walk" | "run" | "bike" | "swim" | "yoga" | "gym" | "other";
};

/** What either parser produces. `error` is set only when the read degraded. */
export type HealthImportResult = {
  source: "apple" | "google";
  /** How many raw records were seen — the caller's honesty metric. */
  recordsSeen: number;
  /** Heart rate samples in bpm. */
  hr: HealthSample[];
  /** SpO2 samples in %. */
  spo2: HealthSample[];
  /**
   * Heart-rate variability samples in ms (Apple's SDNN).
   *
   * A separate series rather than a second `hr` reading: bpm and SDNN are not
   * the same measurement and averaging them together would produce a number
   * that means nothing. Google Fit's export carries no HRV, so its parser
   * leaves this empty — honestly, rather than inventing it.
   */
  hrv: HealthSample[];
  /**
   * Resting heart rate samples in bpm (Apple's RestingHeartRate).
   *
   * A third spot series beside hr and hrv: an average heart rate and a
   * resting heart rate are not the same measurement, and merging them into
   * one lane would produce a number that means neither. Google Fit's export
   * carries no resting-HR series, so its parser leaves this empty — the same
   * honest answer the hrv lane gives.
   */
  restingHr: HealthSample[];
  /** Steps, summed per day. */
  steps: HealthDaySummary;
  /** Sleep minutes per day (in-bed-awake excluded). */
  sleep: HealthDaySummary;
  /** Workouts with minutes and the mapped sport kind. */
  workouts: HealthWorkout[];
  /** Set when the read degraded: "truncated" | "unparseable" | "no-domparser". */
  error?: string;
};

/** The preview the UI shows BEFORE anything is applied. */
export type HealthPreview = {
  /** Number of distinct days with any data. */
  daysCovered: number;
  /** Inclusive ISO date range of the data. */
  dateRange: { from: string; to: string } | null;
  counts: {
    hr: number;
    spo2: number;
    steps: number;
    sleep: number;
    workouts: number;
  };
};

/**
 * The per-day values one entry would gain, in the app's tracker shape —
 * what `applyToEntries` fills. Numbers are pre-snapped to the trackers' own
 * steps so the merge cannot produce values the sanitizers would clamp away.
 */
export type HealthDayPlan = {
  "weather-temp"?: never;
  vitalsRestingHr?: number;
  vitalsSpO2?: number;
  vitalsSleepHours?: number;
  steps?: number;
  sport?: { kind: "select"; value: string };
  "sport-duration"?: { kind: "number"; value: number };
};
