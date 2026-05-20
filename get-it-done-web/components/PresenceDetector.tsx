'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';

// Phase 9 — Presence detection.
//
// Headless component mounted globally in app/layout.tsx. Self-guards on:
//   • prefs.presence_detection_enabled
//   • at least one live tracked_session
//
// Three detection methods (user picks):
//   • mouse_keyboard: listen to mousemove / keydown / scroll / touchstart
//   • webcam:         on-device brightness-variance heuristic on the webcam
//                     stream. Crude (not real face detection) but requires
//                     no model download or new deps. Frames are never stored
//                     or sent.
//   • mobile_motion:  no-op on web — implemented inside the Expo app.
//
// On inactivity:
//   ≥ presence_break_after_min → start a break on the live session
//   ≥ presence_stop_after_min  → stop the live session entirely
//
// Privacy invariants (NON-NEGOTIABLE):
//   - No frames, screen content, or audio stored or transmitted.
//   - Only derived "active at T" timestamps are kept in component state.
//   - Webcam stream is torn down the moment the toggle goes off or the
//     session ends.

const CHECK_INTERVAL_MS = 30_000; // 30s tick per the brief

export function PresenceDetector() {
  const prefs = useStore((s) => s.prefs);
  const activeSessions = useStore((s) => s.activeSessions);
  const startBreak = useStore((s) => s.startBreak);
  const stopSession = useStore((s) => s.stopSession);
  const showToast = useStore((s) => s.showToast);

  const enabled = prefs?.presence_detection_enabled ?? false;
  const method = prefs?.presence_method ?? 'mouse_keyboard';
  const breakAfterMin = prefs?.presence_break_after_min ?? 5;
  const stopAfterMin = prefs?.presence_stop_after_min ?? 20;

  // Refs so the tick interval can read latest values without re-creating
  // the listener every render. lastActiveRef is seeded to 0; the
  // detection-enabled effect below stamps it to now() on mount so the
  // inactivity clock starts fresh, and Date.now() never gets called during
  // render (React 19 purity rule).
  const lastActiveRef = useRef<number>(0);
  const breakFiredRef = useRef<boolean>(false);
  const liveSessionIdRef = useRef<string | null>(null);

  // Keep the ref in sync with the first live session id (mirror the
  // FloatingTimerPill convention — only act on session [0]).
  useEffect(() => {
    liveSessionIdRef.current = activeSessions[0]?.id ?? null;
    if (activeSessions.length === 0) {
      breakFiredRef.current = false;
    }
  }, [activeSessions]);

  // Reset the active timestamp when the user (re)enables detection so a
  // long-idle browser tab doesn't immediately fire on toggle-on.
  useEffect(() => {
    if (enabled) lastActiveRef.current = Date.now();
  }, [enabled, method]);

  // -------- Method: mouse + keyboard --------
  useEffect(() => {
    if (!enabled || method !== 'mouse_keyboard') return;
    if (typeof window === 'undefined') return;
    const mark = () => {
      lastActiveRef.current = Date.now();
      breakFiredRef.current = false;
    };
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('mousemove', mark, opts);
    window.addEventListener('keydown', mark, opts);
    window.addEventListener('scroll', mark, opts);
    window.addEventListener('touchstart', mark, opts);
    window.addEventListener('focus', mark, opts);
    return () => {
      window.removeEventListener('mousemove', mark);
      window.removeEventListener('keydown', mark);
      window.removeEventListener('scroll', mark);
      window.removeEventListener('touchstart', mark);
      window.removeEventListener('focus', mark);
    };
  }, [enabled, method]);

  // -------- Method: webcam (brightness-variance heuristic) --------
  // We never store or transmit frames. Each tick we sample 1 frame, compute
  // a single Number (variance), discard the pixel buffer. The MediaStream
  // is torn down the moment detection turns off or the session ends.
  useEffect(() => {
    if (!enabled || method !== 'webcam') return;
    if (typeof window === 'undefined' || !navigator.mediaDevices) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 64, height: 48, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => {
          // Autoplay denied or stream lost — fall through; the sampler will
          // bail when video.readyState is too low.
        });
      } catch {
        // User denied permission or no camera. Fall back to mouse/keyboard
        // semantics: treat as no signal (stay active until inactivity timer
        // triggers via the 30s tick).
        showToast(
          'Camera permission denied. Presence detection idle — using last input timestamp.',
        );
      }
    };

    const sample = () => {
      if (!ctx || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Single-pass brightness variance. A face in frame produces meaningful
        // brightness contrast between center and periphery (forehead/eyes/
        // shadow). Empty office / lid closed / lens covered → near-zero
        // variance. Threshold is empirical; the user can switch method if
        // it's wrong on their camera.
        const data = img.data;
        let sum = 0;
        let sum2 = 0;
        const n = canvas.width * canvas.height;
        for (let i = 0; i < data.length; i += 4) {
          const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
          sum += b;
          sum2 += b * b;
        }
        const mean = sum / n;
        const variance = sum2 / n - mean * mean;
        // Threshold of 250 picks up most realistic camera-on-face scenes
        // while ignoring a uniformly-lit empty wall. Tunable later.
        if (variance > 250) {
          lastActiveRef.current = Date.now();
          breakFiredRef.current = false;
        }
      } catch {
        // ImageData rejection (cross-origin etc.) — fail closed: don't update
        // lastActive, so the inactivity timer will eventually fire.
      }
    };

    void start();
    const tick = setInterval(sample, 5_000);

    return () => {
      cancelled = true;
      clearInterval(tick);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      video.srcObject = null;
    };
  }, [enabled, method, showToast]);

  // -------- Method: mobile_motion --------
  // No-op on web. The Expo app implements the real motion / face-down /
  // screen-off proxy. We surface a small toast on first detect-enable so
  // the user knows to expect zero behavior here.
  useEffect(() => {
    if (!enabled || method !== 'mobile_motion') return;
    showToast(
      'Mobile-motion presence detection is implemented in the Expo app, not the web client.',
    );
  }, [enabled, method, showToast]);

  // -------- Inactivity tick --------
  // Runs every 30s. Reads the latest values from refs so it isn't recreated
  // on every state change. Checks: is the active session still alive?
  // How long since the last activity event? Cross the thresholds → fire.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    const tick = window.setInterval(() => {
      const sessionId = liveSessionIdRef.current;
      if (!sessionId) return;
      // Guard against the initial-mount race where lastActiveRef hasn't
      // been seeded yet (0 → "inactive since epoch"). A zero timestamp
      // means we have no signal at all, treat it as just-now.
      if (lastActiveRef.current === 0) {
        lastActiveRef.current = Date.now();
        return;
      }
      const inactiveMs = Date.now() - lastActiveRef.current;
      const inactiveMin = inactiveMs / 60_000;

      if (inactiveMin >= stopAfterMin) {
        void stopSession(sessionId);
        showToast(
          `Auto-stopped: you were away for ${Math.round(inactiveMin)} minutes.`,
        );
      } else if (
        !breakFiredRef.current &&
        inactiveMin >= breakAfterMin
      ) {
        breakFiredRef.current = true;
        void startBreak(sessionId);
        showToast(
          `Auto-break: you've been away ${Math.round(inactiveMin)} minutes.`,
        );
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(tick);
  }, [enabled, breakAfterMin, stopAfterMin, stopSession, startBreak, showToast]);

  // Headless — nothing renders. The "👁 active" indicator the brief mentions
  // could be added to NowTrackingBar in a follow-up; for Phase 9 first cut,
  // the Settings panel's toggle + the toast on first event are the user
  // signal.
  return null;
}
