// Small helpers shared by the project pages. Needs d3 loaded first.
window.Z = (function () {
  const tipEl = () => document.getElementById("tip");
  function tip(html, ev) {
    const t = tipEl();
    t.innerHTML = html;
    t.style.opacity = 1;
    t.style.left = Math.min(ev.clientX + 14, window.innerWidth - t.offsetWidth - 8) + "px";
    t.style.top = ev.clientY + 14 + "px";
  }
  function untip() { tipEl().style.opacity = 0; }

  const fmt = {
    int: d3.format(",.0f"),
    d1: d3.format(".1f"),
    d2: d3.format(".2f"),
    pct: d3.format(".0%"),
    pct1: d3.format(".1%"),
    pp: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + d3.format(".1f")(Math.abs(v)),
    month: d3.timeFormat("%b %Y"),
  };

  // An SVG sized to its container's width; redrawn by the caller on resize.
  function svg(el, height, minW = 300) {
    const W = Math.max(minW, el.clientWidth);
    el.innerHTML = "";
    const s = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${height}`)
      .style("width", "100%").style("height", "auto").style("display", "block");
    return { s, W, H: height };
  }

  function onResize(fn) {
    let w = window.innerWidth, t;
    window.addEventListener("resize", () => {
      if (window.innerWidth === w) return;
      w = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(fn, 150);
    });
  }

  function seg(el, options, value, onChange) {
    el.innerHTML = options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === value}">${l}</button>`).join("");
    el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      onChange(b.dataset.v);
    }));
  }

  function bind(key, html) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach((e) => (e.innerHTML = html));
  }

  return { tip, untip, fmt, svg, onResize, seg, bind };
})();
