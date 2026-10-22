// Presentation only. Never changes the deterministic game or persisted decisions.
let enabled = false;
let context;
let lastCue = 0;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function soundEnabled() {
  return enabled;
}

export async function toggleSound() {
  enabled = !enabled;
  if (!enabled) {
    if (context?.state === "running") await context.suspend().catch(() => {});
    return false;
  }
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error("Audio unavailable");
    context ||= new Audio();
    await context.resume();
    cue("open");
  } catch {
    enabled = false;
  }
  return enabled;
}

export function cue(kind) {
  if (!enabled || !context || context.state !== "running" || document.hidden)
    return;
  const now = context.currentTime;
  if (now - lastCue < 0.12) return;
  lastCue = now;
  const notes = {
    incoming: [660, 880],
    send: [520, 700],
    open: [440, 660, 880],
    transfer: [380, 280],
    complete: [440, 550, 660],
    tap: [480],
  }[kind] || [480];
  notes.forEach((frequency, i) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + i * 0.075;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.035, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  });
}

export function enter(element, kind = "incoming") {
  if (!element?.animate || reduced() || document.hidden) return;
  const x = kind === "mine" || kind === "transfer" ? 10 : -8;
  const animation = element.animate(
    [
      { opacity: 0, transform: `translate(${x}px, 12px) scale(.97)` },
      { opacity: 1, transform: "translate(0, 0) scale(1)" },
    ],
    { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
  animation.finished.then(() => animation.cancel()).catch(() => {});
}

export function walletFeedback(amount, format) {
  if (!amount) return;
  const wallet = document.querySelector(".game-wallet");
  if (!wallet) return;
  const delta = document.createElement("span");
  delta.className = "wallet-delta";
  delta.setAttribute("role", "status");
  delta.textContent = `模拟转出 −${format(amount)}`;
  wallet.append(delta);
  enter(delta, "transfer");
  setTimeout(() => delta.remove(), 3200);
}
