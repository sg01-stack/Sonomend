import "@fontsource/great-vibes/latin-400.css";
import "@fontsource/inter/latin-800.css";
import "./landing.css";
export const landingMarkup = () =>
  `<section class="design-slide" aria-label="Sonomend introduction"><canvas class="reactive-field" aria-hidden="true"></canvas><div class="design-title"><h1><span>Sonomend.</span></h1><p><span>Peace on the pavement,<br>one decibel at a time.</span></p></div><div class="megaphone-stage" role="img" aria-label="Red and ivory megaphone surrounded by six glass capsules"></div><button class="design-calibrate" data-action="calibrate-start">CALIBRATE</button><section class="design-dashboard" aria-label="Dashboard"><h2><span>Dashboard</span></h2><div class="design-cells">${["penalties", "propers", "rewards"].map((x) => `<div><div class="design-cell" aria-hidden="true"></div><p><span>${x}</span></p></div>`).join("")}</div></section></section>`;
export function mountLanding(host: HTMLElement) {
  const canvas = host.querySelector<HTMLCanvasElement>(".reactive-field")!,
    ctx = canvas.getContext("2d")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let dead = false,
    frame = 0,
    w = 1,
    h = 1,
    t = 0,
    last = 0,
    visible = true;
  const trail: { x: number; y: number; life: number }[] = [];
  const resize = () => {
    w = host.clientWidth;
    h = host.clientHeight;
    const d = Math.min(devicePixelRatio, 1.5);
    canvas.width = w * d;
    canvas.height = h * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  const pointer = (e: PointerEvent) => {
    if (reduced.matches) return;
    const r = host.getBoundingClientRect();
    trail.push({ x: e.clientX - r.left, y: e.clientY - r.top, life: 1 });
    if (trail.length > 36) trail.shift();
  };
  host.addEventListener("pointermove", pointer);
  const io = new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
  });
  io.observe(host);
  const draw = (now: number) => {
    if (dead) return;
    frame = requestAnimationFrame(draw);
    if (!visible || document.hidden || now - last < 33) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduced.matches) t += dt;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#d5d5d5";
    ctx.fillRect(0, 0, w, h);
    // Fine crosshatch field, displaced by the pointer's fading wake.
    for (let y = 0; y < h; y += 7)
      for (let x = 0; x < w; x += 7) {
        let heat = 0;
        for (const p of trail) {
          const d = (x - p.x) ** 2 + (y - p.y) ** 2;
          heat = Math.max(heat, Math.exp(-d / 4800) * p.life);
        }
        ctx.strokeStyle =
          heat > 0.08
            ? `rgba(242,57,128,${heat * 0.65})`
            : "rgba(73,73,73,.10)";
        ctx.beginPath();
        ctx.moveTo(x - 1.3, y - 1.3);
        ctx.lineTo(x + 1.3, y + 1.3);
        ctx.moveTo(x + 1.3, y - 1.3);
        ctx.lineTo(x - 1.3, y + 1.3);
        ctx.stroke();
      }
    for (const p of trail) p.life -= dt * 0.65;
    while (trail[0]?.life <= 0) trail.shift();
  };
  frame = requestAnimationFrame(draw);
  let disposeModel: (() => void) | undefined;
  void import("./model")
    .then(async (m) => {
      if (dead) return;
      disposeModel = await m.mountModel(
        host.querySelector(".megaphone-stage")!,
        reduced.matches,
        () => dead,
      );
      if (dead) disposeModel?.();
    })
    .catch(() => {});
  return () => {
    dead = true;
    cancelAnimationFrame(frame);
    ro.disconnect();
    io.disconnect();
    host.removeEventListener("pointermove", pointer);
    disposeModel?.();
  };
}
