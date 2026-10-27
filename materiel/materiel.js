// Figures for /materiel. Data: materiel.json, exported by the pipeline.
(async function () {
  const data = await (await fetch("materiel.json")).json();

  const fmt = {
    int: d3.format(",.0f"),
    pct: d3.format(".0%"),
    pct1: d3.format(".1%"),
    signed: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + d3.format(".0%")(Math.abs(v)),
    usd: (v) => (v >= 1e6 ? "$" + d3.format(".1f")(v / 1e6) + "M" : "$" + d3.format(",.0f")(v / 1e3) + "K"),
    month: d3.timeFormat("%b %Y"),
  };
  const parseMonth = d3.timeParse("%Y-%m");
  const productName = Object.fromEntries(data.products.map((p) => [p.id, p.name]));
  const supById = Object.fromEntries(data.suppliers.map((s) => [s.id, s]));
  const partById = Object.fromEntries(data.parts.map((p) => [p.id, p]));
  const fleetBy = Object.fromEntries(data.products.map((p) => [p.id, p.fleet]));

  // Shared tooltip -----------------------------------------------------------
  const tip = document.getElementById("tip");
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px";
    tip.style.top = ev.clientY + 14 + "px";
  }
  function hideTip() { tip.style.opacity = 0; }

  function bind(key, html) {
    document.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => (el.innerHTML = html));
  }

  // Derived facts --------------------------------------------------------------
  const partsInUse = new Set(data.bom.map((b) => b.part));
  const sourcesByPart = d3.group(data.sources, (d) => d.part);
  const sourcesBySup = d3.group(data.sources, (d) => d.sup);
  const bomByPart = d3.group(data.bom, (d) => d.part);
  const bomByProd = d3.group(data.bom, (d) => d.prod);
  const exposureBySup = d3.group(data.exposure, (d) => d.sup);

  function supplierImpact(supId) {
    const rows = exposureBySup.get(supId) || [];
    const products = [...new Set(rows.map((r) => r.prod))];
    return {
      builds: d3.sum(rows, (r) => r.builds),
      fleet: d3.sum(products, (p) => fleetBy[p]),
      products,
      parts: [...new Set(rows.map((r) => r.part))],
    };
  }
  const impacts = Object.fromEntries(data.suppliers.map((s) => [s.id, supplierImpact(s.id)]));

  // Stats strip
  const totalBuilds = d3.sum(data.builds, (d) => d.s);
  const fleet = d3.sum(data.products, (p) => p.fleet);
  document.getElementById("stats").innerHTML = [
    [data.suppliers.length, "suppliers"],
    [partsInUse.size, "parts in current designs"],
    [totalBuilds, "builds"],
    [fleet, "units in the field"],
    [data.builds.length ? new Set(data.builds.map((d) => d.m)).size : 0, "months of history"],
  ].map(([v, l]) => `<div><b>${fmt.int(v)}</b><span>${l}</span></div>`).join("");

  const soleCrit = data.suppliers.filter((s) =>
    (sourcesBySup.get(s.id) || []).some((src) => partById[src.part] && partById[src.part].sole && partById[src.part].crit));
  bind("soleCritSuppliers", d3.format(",")(soleCrit.length).replace(/^./, (c) => c.toUpperCase()));

  // ---------------------------------------------------------------------------
  // 1. Supply web
  // ---------------------------------------------------------------------------
  const web = (() => {
    const container = document.getElementById("web-canvas");
    const readout = document.getElementById("readout");
    const select = document.getElementById("sup-select");
    let selection = null; // {type, id}

    // Order parts by the products that use them, then category, so links to
    // each product leave from one region; order suppliers by the mean position
    // of the parts they make. Fewer crossings, same information.
    const prodOrder = data.products.map((p) => p.id);
    const parts = data.parts.filter((p) => partsInUse.has(p.id)).map((p) => ({
      ...p,
      prods: (bomByPart.get(p.id) || []).map((b) => b.prod),
    }));
    const prodKey = (p) => prodOrder.map((id) => (p.prods.includes(id) ? "1" : "0")).join("");
    parts.sort((a, b) => d3.descending(prodKey(a), prodKey(b)) || d3.ascending(a.cat, b.cat) || d3.descending(a.risk, b.risk));
    const partIndex = Object.fromEntries(parts.map((p, i) => [p.id, i]));
    const sups = data.suppliers
      .filter((s) => sourcesBySup.has(s.id))
      .map((s) => ({ ...s, pos: d3.mean(sourcesBySup.get(s.id), (src) => partIndex[src.part] ?? 0) }))
      .sort((a, b) => a.pos - b.pos);

    // Supplier dropdown, sorted by exposure.
    const bySeverity = [...data.suppliers].sort((a, b) => impacts[b.id].builds - impacts[a.id].builds);
    select.innerHTML = bySeverity.map((s) =>
      `<option value="${s.id}">${s.name} · ${fmt.int(impacts[s.id].builds)} builds at risk</option>`).join("");
    select.addEventListener("change", () => choose({ type: "sup", id: select.value }));

    let nodes, links;

    function draw() {
      const W = Math.max(560, container.clientWidth);
      const H = 760;
      const top = 26;
      const colSup = Math.min(210, W * 0.3);
      const colPart = W * 0.58;
      const colProd = W - 64;
      container.innerHTML = "";
      const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${W} ${H}`);

      const ySup = d3.scalePoint(sups.map((s) => s.id), [top + 6, H - 6]);
      const yPart = d3.scalePoint(parts.map((p) => p.id), [top + 6, H - 6]);
      const prodH = (H - top - 40) / prodOrder.length;
      const yProd = Object.fromEntries(prodOrder.map((id, i) => [id, top + 10 + i * (prodH + 20) / 1 + prodH / 2]));

      svg.append("text").attr("class", "col-label").attr("x", colSup).attr("y", 10).attr("text-anchor", "end").text("Suppliers");
      svg.append("text").attr("class", "col-label").attr("x", colPart).attr("y", 10).attr("text-anchor", "middle").text("Parts");
      svg.append("text").attr("class", "col-label").attr("x", colProd).attr("y", 10).text("Products");

      const curve = d3.linkHorizontal().x((d) => d[0]).y((d) => d[1]);
      const gLinks = svg.append("g");
      links = gLinks.selectAll("path")
        .data([
          ...data.sources.filter((s) => partIndex[s.part] !== undefined).map((s) => ({ kind: "sp", a: s.sup, b: s.part,
            d: curve({ source: [colSup + 6, ySup(s.sup)], target: [colPart - 4, yPart(s.part)] }) })),
          ...data.bom.map((b) => ({ kind: "pp", a: b.part, b: b.prod,
            d: curve({ source: [colPart + 4, yPart(b.part)], target: [colProd - 6, yProd[b.prod]] }) })),
        ])
        .join("path")
        .attr("class", "link")
        .attr("d", (d) => d.d);

      const g = svg.append("g");
      const supNodes = g.selectAll("g.sup").data(sups).join("g")
        .attr("class", "node sup")
        .attr("transform", (d) => `translate(${colSup},${ySup(d.id)})`);
      supNodes.append("rect").attr("x", 0).attr("y", -3).attr("width", 6).attr("height", 6).attr("rx", 1);
      supNodes.append("text").attr("x", -6).attr("dy", "0.35em").attr("text-anchor", "end").text((d) => d.name);

      const partNodes = g.selectAll("g.part").data(parts).join("g")
        .attr("class", (d) => "node part" + (d.crit ? " crit" : ""))
        .attr("transform", (d) => `translate(${colPart},${yPart(d.id)})`);
      partNodes.append("rect").attr("x", -4).attr("y", -2.5).attr("width", 8).attr("height", 5).attr("rx", 1);
      partNodes.append("text").attr("x", 8).attr("dy", "0.35em").style("display", "none")
        .text((d) => `${d.id} · ${d.cat}`);

      const prodNodes = g.selectAll("g.product").data(data.products).join("g")
        .attr("class", "node product")
        .attr("transform", (d) => `translate(${colProd},${yProd[d.id]})`);
      prodNodes.append("rect").attr("x", -6).attr("y", -prodH * 0.35).attr("width", 6).attr("height", prodH * 0.7).attr("rx", 1);
      prodNodes.append("text").attr("x", 8).attr("dy", "0.35em").text((d) => d.name);

      nodes = { sup: supNodes, part: partNodes, prod: prodNodes };

      for (const [type, sel] of Object.entries(nodes)) {
        sel.on("click", (ev, d) => choose({ type, id: d.id }))
          .on("mousemove", (ev, d) => showTip(nodeTip(type, d), ev))
          .on("mouseleave", hideTip);
      }
      paint();
    }

    function nodeTip(type, d) {
      if (type === "sup") {
        const im = impacts[d.id];
        return `<b>${d.name}</b><br>${(sourcesBySup.get(d.id) || []).length} parts · ${fmt.int(im.builds)} builds at risk`;
      }
      if (type === "part") {
        const ns = (sourcesByPart.get(d.id) || []).length;
        return `<b>${d.id}</b> · ${d.cat}<br>${ns === 1 ? "Sole-sourced" : ns + " suppliers"}${d.crit ? " · flight-critical" : ""}<br>Lead time ${fmt.int(d.lt)} days`;
      }
      return `<b>${d.name}</b><br>${d.fleet} fielded · ${d.bom_lines} parts`;
    }

    function related(sel) {
      const on = { sup: new Set(), part: new Set(), prod: new Set() };
      const alt = { sup: new Set() };
      const addPart = (pid) => {
        on.part.add(pid);
        (bomByPart.get(pid) || []).forEach((b) => on.prod.add(b.prod));
      };
      if (sel.type === "sup") {
        on.sup.add(sel.id);
        (sourcesBySup.get(sel.id) || []).forEach((s) => addPart(s.part));
        on.part.forEach((pid) => (sourcesByPart.get(pid) || []).forEach((s) => s.sup !== sel.id && alt.sup.add(s.sup)));
      } else if (sel.type === "part") {
        addPart(sel.id);
        (sourcesByPart.get(sel.id) || []).forEach((s) => on.sup.add(s.sup));
      } else {
        on.prod.add(sel.id);
        (bomByProd.get(sel.id) || []).forEach((b) => on.part.add(b.part));
        on.part.forEach((pid) => (sourcesByPart.get(pid) || []).forEach((s) => on.sup.add(s.sup)));
      }
      return { on, alt };
    }

    function paint() {
      if (!nodes || !selection) return;
      const { on, alt } = related(selection);
      nodes.sup.attr("class", (d) => "node sup" + (on.sup.has(d.id) ? " on" : alt.sup.has(d.id) ? " alt" : " dim"));
      nodes.part.attr("class", (d) => "node part" + (d.crit ? " crit" : "") + (on.part.has(d.id) ? " on" : " dim"))
        .select("text").style("display", (d) => (on.part.has(d.id) && on.part.size <= 14 ? null : "none"));
      nodes.prod.attr("class", (d) => "node product" + (on.prod.has(d.id) ? " on" : " dim"));
      links.attr("class", (d) => {
        if (d.kind === "sp") {
          if (on.sup.has(d.a) && on.part.has(d.b)) return "link on";
          if (selection.type === "sup" && alt.sup.has(d.a) && on.part.has(d.b)) return "link alt";
          return "link";
        }
        return on.part.has(d.a) && on.prod.has(d.b) ? "link on" : "link";
      });
      renderReadout();
    }

    function renderReadout() {
      const s = selection;
      if (s.type === "sup") {
        const sup = supById[s.id];
        const im = impacts[s.id];
        const srcs = (sourcesBySup.get(s.id) || []).filter((x) => partIndex[x.part] !== undefined)
          .map((x) => ({ ...x, part: partById[x.part], n: (sourcesByPart.get(x.part) || []).length }))
          .sort((a, b) => (a.n === 1 ? 0 : 1) - (b.n === 1 ? 0 : 1) || b.share - a.share);
        const sole = srcs.filter((x) => x.n === 1).length;
        readout.innerHTML = `
          <div class="label">Supplier · ${sup.state}${sup.enrolled ? " · in development program" : ""}</div>
          <h4>${sup.name}</h4>
          <div class="sub">On time ${fmt.pct(sup.otd)} · ${fmt.int(sup.ppm)} defects per million · ${fmt.usd(sup.spend || 0)} spend, last 12 months</div>
          <div class="big">
            <div><b class="hot">${fmt.int(im.builds)}</b><span>builds at risk</span></div>
            <div><b>${fmt.int(im.fleet)}</b><span>fielded units on its spares</span></div>
            <div><b>${srcs.length}</b><span>parts supplied</span></div>
            <div><b class="${sole ? "hot" : ""}">${sole}</b><span>sole-sourced</span></div>
          </div>
          <table>${srcs.map((x) => `<tr><td>${x.part.id} · ${x.part.cat}${x.n === 1 ? '<span class="tag">sole</span>' : ""}${x.part.crit ? '<span class="tag crit">critical</span>' : ""}</td><td>${x.n === 1 ? "100%" : fmt.pct(x.share) + " of " + x.n}</td></tr>`).join("")}</table>
          <div class="hint">Used in ${im.products.map((p) => productName[p]).join(", ") || "no current product"}. Blue marks the other suppliers of these parts.</div>`;
        select.value = s.id;
      } else if (s.type === "part") {
        const p = partById[s.id];
        const srcs = (sourcesByPart.get(s.id) || []).sort((a, b) => b.share - a.share);
        const prods = (bomByPart.get(s.id) || []).map((b) => `${productName[b.prod]} ×${b.qty}`);
        readout.innerHTML = `
          <div class="label">Part · ${p.cat}${p.crit ? " · flight-critical" : ""}</div>
          <h4>${p.id}</h4>
          <div class="sub">Lead time ${fmt.int(p.lt)} days · risk score ${p.risk}</div>
          <div class="big">
            <div><b class="${srcs.length === 1 ? "hot" : ""}">${srcs.length}</b><span>${srcs.length === 1 ? "supplier" : "suppliers"}</span></div>
            <div><b>${fmt.int(p.blocked)}</b><span>builds it has blocked</span></div>
          </div>
          <table>${srcs.map((x) => `<tr><td>${supById[x.sup].name}</td><td>${fmt.pct(x.share)}</td></tr>`).join("")}</table>
          <div class="hint">Used in ${prods.join(", ")}.</div>`;
      } else {
        const p = data.products.find((x) => x.id === s.id);
        readout.innerHTML = `
          <div class="label">Product</div>
          <h4>${p.name}</h4>
          <div class="sub">${p.description}</div>
          <div class="big">
            <div><b>${fmt.int(p.fleet)}</b><span>fielded</span></div>
            <div><b>${fmt.int(p.down_now)}</b><span>down today</span></div>
            <div><b>${p.bom_lines}</b><span>parts</span></div>
            <div><b class="${p.critical_sole_source_parts ? "hot" : ""}">${p.critical_sole_source_parts}</b><span>critical, sole-sourced</span></div>
          </div>
          <div class="hint">Select a supplier to see what it puts at risk.</div>`;
      }
    }

    function choose(sel) { selection = sel; paint(); }

    selection = { type: "sup", id: bySeverity[0].id };
    draw();
    return { draw };
  })();

  // ---------------------------------------------------------------------------
  // 2. Risk scatter
  // ---------------------------------------------------------------------------
  function drawRisk() {
    const el = document.getElementById("risk-canvas");
    const W = Math.max(320, el.clientWidth);
    const H = Math.min(460, Math.max(320, W * 0.48));
    const m = { t: 10, r: 24, b: 40, l: 48 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto");

    const pts = data.parts.map((p) => {
      const prods = (bomByPart.get(p.id) || []).length;
      return { ...p, prods };
    });
    const x = d3.scaleLinear().domain([0, d3.max(pts, (d) => d.lk) * 1.08]).range([m.l, W - m.r]).nice();
    const y = d3.scaleLinear().domain([0, d3.max(pts, (d) => d.im) * 1.08]).range([H - m.b, m.t]).nice();
    const r = d3.scaleSqrt().domain([0, d3.max(pts, (d) => d.spend || 0)]).range([2.5, 16]);

    svg.append("g").attr("class", "grid").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")).tickSizeOuter(0));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    svg.append("text").attr("x", W - m.r).attr("y", H - 6).attr("text-anchor", "end").text("Likelihood: chance a build is stopped →");
    svg.append("text").attr("x", m.l + 6).attr("y", m.t + 10).text("↑ Impact");

    // Iso-risk curves: likelihood × impact = c.
    const maxRisk = d3.max(pts, (d) => d.lk * d.im);
    [0.25, 0.5, 0.75].forEach((f) => {
      const c = maxRisk * f;
      const xs = d3.range(c / y.domain()[1], x.domain()[1], (x.domain()[1]) / 200);
      svg.append("path")
        .attr("d", d3.line().x((v) => x(v)).y((v) => y(c / v))(xs))
        .attr("fill", "none").style("stroke", "var(--rule)").style("stroke-width", 1);
    });

    const g = svg.append("g");
    g.selectAll("circle").data([...pts].sort((a, b) => (b.spend || 0) - (a.spend || 0))).join("circle")
      .attr("cx", (d) => x(d.lk)).attr("cy", (d) => y(d.im)).attr("r", (d) => r(d.spend || 0))
      .style("fill", (d) => (d.sole ? "var(--accent)" : "transparent"))
      .style("fill-opacity", (d) => (d.sole ? 0.75 : 0))
      .style("stroke", (d) => (d.sole ? "var(--accent)" : "var(--faint)"))
      .style("stroke-width", 1.25)
      .style("cursor", "pointer")
      .on("mousemove", (ev, d) => showTip(
        `<b>${d.id}</b> · ${d.cat}${d.crit ? " · flight-critical" : ""}<br>` +
        `${d.sole ? "Sole-sourced" : d.ns + " suppliers"} · lead time ${fmt.int(d.lt)} days<br>` +
        `Blocked ${fmt.int(d.blocked)} builds · risk ${d.risk}`, ev))
      .on("mouseleave", hideTip);

    const top = [...pts].sort((a, b) => b.risk - a.risk).slice(0, 5);
    g.selectAll("text.lbl").data(top).join("text")
      .attr("x", (d) => x(d.lk) + r(d.spend || 0) + 4).attr("y", (d) => y(d.im) + 4)
      .style("fill", "var(--ink)").style("font-size", "11px")
      .text((d) => `${d.id} · ${d.cat}`);
  }

  // ---------------------------------------------------------------------------
  // 3. Fleet small multiples
  // ---------------------------------------------------------------------------
  function drawFleet() {
    const el = document.getElementById("multiples");
    el.innerHTML = "";
    const order = ["P-KES", "P-HAL", "P-PET"];
    const readiness = d3.group(data.readiness, (d) => d.p);
    const builds = d3.group(data.builds, (d) => d.p);
    const allMonths = d3.extent(data.builds, (d) => parseMonth(d.m));

    for (const pid of order) {
      const p = data.products.find((d) => d.id === pid);
      const cell = document.createElement("div");
      // Start once ~10 units are fielded (300 unit-days); before that one repair swings the line.
      const rd = (readiness.get(pid) || []).filter((d) => d.n >= 300).map((d) => ({ m: parseMonth(d.m), v: d.a }));
      const bd = (builds.get(pid) || []).map((d) => ({ m: parseMonth(d.m), s: d.s, blocked: d.b / d.s }));
      const last6 = d3.mean(rd.slice(-6), (d) => d.v);
      cell.innerHTML = `<div class="mult-title">${p.name}</div><div class="mult-sub">${p.description} · ${fmt.int(p.fleet)} fielded · ${fmt.pct1(last6)} available, last 6 months</div>`;
      el.appendChild(cell);

      const W = 320, H = 230, m = { t: 14, r: 8, b: 22, l: 34 };
      const stripH = 34, gap = 14, lineBottom = H - m.b - stripH - gap;
      const svg = d3.select(cell).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
      const x = d3.scaleTime().domain(allMonths).range([m.l, W - m.r]);
      const y = d3.scaleLinear().domain([0.8, 1]).range([lineBottom, m.t]);
      const yb = d3.scaleLinear().domain([0, 0.5]).range([H - m.b, H - m.b - stripH]);
      const bw = (W - m.l - m.r) / 33 - 1.5;

      svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
        .call(d3.axisLeft(y).tickValues([0.8, 0.9, 1]).tickSize(-(W - m.l - m.r)).tickFormat(""));
      svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
        .call(d3.axisLeft(y).tickValues([0.8, 0.9, 1]).tickFormat(d3.format(".0%")).tickSize(0)).select(".domain").remove();
      svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")).tickSizeOuter(0));

      const line = d3.line().x((d) => x(d.m)).y((d) => y(Math.max(0.8, d.v))).curve(d3.curveMonotoneX);
      svg.append("path").datum(rd).attr("d", line)
        .attr("fill", "none").style("stroke", "var(--ink)").style("stroke-width", 1.75);

      // Strip: share of build starts stopped by a part shortage.
      svg.append("g").selectAll("rect").data(bd).join("rect")
        .attr("x", (d) => x(d.m) - bw / 2).attr("width", bw)
        .attr("y", (d) => yb(Math.min(0.5, d.blocked))).attr("height", (d) => yb(0) - yb(Math.min(0.5, d.blocked)))
        .style("fill", "var(--accent)").style("opacity", 0.7);
      svg.append("text").attr("x", m.l + 2).attr("y", H - m.b - stripH - 3).style("font-size", "10px").text("starts stopped by shortage");

      // Hover: month readout.
      const focus = svg.append("line").attr("y1", m.t).attr("y2", H - m.b).style("stroke", "var(--faint)").style("opacity", 0);
      svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b)
        .style("fill", "transparent")
        .on("mousemove", function (ev) {
          const [mx] = d3.pointer(ev, this);
          const i = d3.bisector((d) => d.m).center(rd, x.invert(mx));
          const r = rd[i], b = bd.find((d) => +d.m === +r.m);
          focus.attr("x1", x(r.m)).attr("x2", x(r.m)).style("opacity", 1);
          showTip(`<b>${p.name}, ${fmt.month(r.m)}</b><br>Available ${fmt.pct1(r.v)}` +
            (b ? `<br>${fmt.int(b.s)} builds started, ${fmt.pct(b.blocked)} stopped by a shortage` : ""), ev);
        })
        .on("mouseleave", () => { focus.style("opacity", 0); hideTip(); });
    }

    const pet = data.products.find((d) => d.id === "P-PET");
    const rdAll = d3.rollup(data.readiness, (v) => d3.mean(v.slice(-6), (d) => d.a), (d) => d.p);
    bind("fleetSentence", `${pet.name}, the surface vessel, runs lowest at ${fmt.pct1(rdAll.get("P-PET"))} available over the last six months. ` +
      `It has the most flight-critical parts with a single source (${pet.critical_sole_source_parts} of ${pet.critical_parts}), it fails more often than the other two, and its repairs wait longest for spares. ` +
      `${data.products.find((d) => d.id === "P-KES").name}, built in far larger numbers from simpler parts, stays above ${fmt.pct(Math.floor(rdAll.get("P-KES") * 100) / 100)}.`);
  }

  // ---------------------------------------------------------------------------
  // 4. Supplier program
  // ---------------------------------------------------------------------------
  const program = data.program;
  const launch = parseMonth("2025-07");

  function drawTrend() {
    const el = document.getElementById("trend-canvas");
    const W = Math.max(320, el.clientWidth), H = 280, m = { t: 12, r: 90, b: 26, l: 52 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto");
    const rows = program.trend.map((d) => ({ m: parseMonth(d.month), a: d.enrolled, b: d.others }));
    const x = d3.scaleTime().domain(d3.extent(rows, (d) => d.m)).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(rows, (d) => Math.max(d.a, d.b)) * 1.1]).range([H - m.b, m.t]).nice();

    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(",.0f")).tickSize(0)).select(".domain").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));

    svg.append("rect").attr("x", x(launch)).attr("y", m.t).attr("width", W - m.r - x(launch)).attr("height", H - m.t - m.b)
      .style("fill", "var(--wash)");
    svg.append("line").attr("x1", x(launch)).attr("x2", x(launch)).attr("y1", m.t).attr("y2", H - m.b)
      .style("stroke", "var(--faint)").style("stroke-dasharray", "3 3");
    svg.append("text").attr("x", x(launch) + 6).attr("y", m.t + 12).text("Program launches, July 2025");

    const line = (k) => d3.line().x((d) => x(d.m)).y((d) => y(d[k])).curve(d3.curveMonotoneX);
    svg.append("path").datum(rows).attr("d", line("a")).attr("fill", "none").style("stroke", "var(--accent)").style("stroke-width", 2);
    svg.append("path").datum(rows).attr("d", line("b")).attr("fill", "none").style("stroke", "var(--faint)").style("stroke-width", 2);
    const last = rows[rows.length - 1];
    svg.append("text").attr("x", W - m.r + 6).attr("y", y(last.a) + 4).style("fill", "var(--accent)").text("Enrolled (20)");
    svg.append("text").attr("x", W - m.r + 6).attr("y", y(last.b) + 4).text("Others (40)");
  }

  function drawEstimates() {
    const el = document.getElementById("est-canvas");
    const W = Math.max(300, el.clientWidth), H = 250, m = { t: 8, r: 16, b: 30, l: 16 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const est = program.estimates;
    const x = d3.scaleLinear().domain([-0.6, 1.1]).range([m.l, W - m.r]);
    const rowH = (H - m.t - m.b) / est.length;

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues([-0.5, 0, 0.5, 1]).tickFormat(fmt.signed).tickSizeOuter(0));
    // Planted effect: phases in to -35%.
    svg.append("rect").attr("x", x(-0.35)).attr("width", x(-0.28) - x(-0.35)).attr("y", m.t).attr("height", H - m.t - m.b)
      .style("fill", "var(--blue-soft)");
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b).style("stroke", "var(--faint)");

    est.forEach((e, i) => {
      const cy = m.t + rowH * i + rowH * 0.62;
      const good = e.label.startsWith("Difference");
      const g = svg.append("g");
      g.append("text").attr("x", m.l).attr("y", m.t + rowH * i + 13)
        .style("fill", good ? "var(--ink)" : "var(--muted)").style("font-weight", good ? 600 : 400).text(e.label);
      if (e.ci_low != null) {
        g.append("line").attr("x1", x(e.ci_low)).attr("x2", x(e.ci_high)).attr("y1", cy).attr("y2", cy)
          .style("stroke", good ? "var(--ink)" : "var(--faint)").style("stroke-width", 1.5);
      }
      g.append("circle").attr("cx", x(e.effect)).attr("cy", cy).attr("r", 4.5)
        .style("fill", good ? "var(--ink)" : e.effect > 0 ? "var(--accent)" : "var(--paper)")
        .style("stroke", good ? "var(--ink)" : e.effect > 0 ? "var(--accent)" : "var(--faint)").style("stroke-width", 1.5);
      g.append("text").attr("x", x(e.effect) + (e.effect > 0.8 ? -8 : 8)).attr("y", cy + 4)
        .attr("text-anchor", e.effect > 0.8 ? "end" : "start")
        .style("fill", "var(--ink)").text(fmt.signed(e.effect));
      g.append("rect").attr("x", 0).attr("y", m.t + rowH * i).attr("width", W).attr("height", rowH).style("fill", "transparent")
        .on("mousemove", (ev) => showTip(`<b>${e.label}</b><br>${e.note}`, ev)).on("mouseleave", hideTip);
    });
    svg.append("text").attr("x", x(-0.315)).attr("y", H - m.b - 4).attr("text-anchor", "middle")
      .style("fill", "var(--blue)").style("font-size", "10px").text("planted");
  }

  function drawEvent() {
    const el = document.getElementById("event-canvas");
    const W = Math.max(300, el.clientWidth), H = 250, m = { t: 12, r: 10, b: 30, l: 40 };
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const es = program.event_study;
    const x = d3.scaleLinear().domain([-12.5, 14.5]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([-0.6, 0.5]).range([H - m.b, m.t]);

    svg.append("rect").attr("x", x(-0.5)).attr("y", m.t).attr("width", x(14.5) - x(-0.5)).attr("height", H - m.t - m.b).style("fill", "var(--wash)");
    // Planted path: 0 at enrollment, -35% by month 3.
    const planted = d3.range(-0.5, 14.6, 0.25).map((k) => [k, k <= 0 ? 0 : -0.35 * Math.min(1, k / 3)]);
    svg.append("path").attr("d", d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(planted))
      .attr("fill", "none").style("stroke", "var(--blue)").style("stroke-width", 6).style("stroke-opacity", 0.18);
    svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).tickValues([-0.5, -0.25, 0, 0.25]).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).tickValues([-0.5, -0.25, 0, 0.25]).tickFormat(fmt.signed).tickSize(0)).select(".domain").remove();
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues([-12, -6, 0, 6, 12]).tickFormat((d) => (d > 0 ? "+" + d : d)).tickSizeOuter(0));
    svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0)).attr("y2", y(0)).style("stroke", "var(--faint)");
    svg.append("text").attr("x", x(0.2)).attr("y", m.t + 11).text("enrolled →");

    const g = svg.append("g");
    g.selectAll("line.ci").data(es.filter((d) => d.k !== -1)).join("line")
      .attr("x1", (d) => x(d.k)).attr("x2", (d) => x(d.k)).attr("y1", (d) => y(d.low)).attr("y2", (d) => y(d.high))
      .style("stroke", (d) => (d.k >= 0 ? "var(--ink)" : "var(--faint)"));
    g.selectAll("circle").data(es).join("circle")
      .attr("cx", (d) => x(d.k)).attr("cy", (d) => y(d.effect)).attr("r", 3)
      .style("fill", (d) => (d.k >= 0 ? "var(--ink)" : "var(--paper)"))
      .style("stroke", (d) => (d.k >= 0 ? "var(--ink)" : "var(--faint)"))
      .on("mousemove", (ev, d) => showTip(`<b>Month ${d.k > 0 ? "+" + d.k : d.k}</b><br>${d.k === -1 ? "Reference month" :
        `${fmt.signed(d.effect)} (95% CI ${fmt.signed(d.low)} to ${fmt.signed(d.high)})`}`, ev))
      .on("mouseleave", hideTip);
  }

  // Bound numbers --------------------------------------------------------------
  const est = Object.fromEntries(program.estimates.map((e) => [e.label, e]));
  const did = est["Difference-in-differences"];
  const naive = est["Enrolled vs. not enrolled, after launch"];
  bind("didEffect", `a ${fmt.pct(-did.effect)} reduction`);
  bind("didCI", `${fmt.pct(-did.ci_high)} to ${fmt.pct(-did.ci_low)}`);
  const ratio = 1 + naive.effect;
  bind("naiveCross", Math.abs(ratio - 2) < 0.15 ? "twice as many" : `${d3.format(".1f")(ratio)} times as many`);

  const topPart = [...data.parts].sort((a, b) => b.risk - a.risk)[0];
  const topSups = (sourcesByPart.get(topPart.id) || []).length;
  bind("topPartSentence",
    `The riskiest, ${topPart.id}, is ${topPart.crit ? "a flight-critical " : "an "}${topPart.cat.toLowerCase()} part ` +
    `${topSups === 1 ? "with a single supplier" : `split across ${topSups} suppliers`}, a ${fmt.int(topPart.lt)}-day lead time, ` +
    `and ${fmt.int(topPart.blocked)} builds already stopped waiting for it.`);

  // Draw, and redraw on resize ---------------------------------------------------
  function drawAll() { web.draw(); drawRisk(); drawFleet(); drawTrend(); drawEstimates(); drawEvent(); }
  drawAll();
  let w = window.innerWidth, timer;
  window.addEventListener("resize", () => {
    if (window.innerWidth === w) return;
    w = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(drawAll, 150);
  });
})();
