"""Fetch public data and write the JSON each project page reads.

    uv run --project ../defense-supply-chain-ontology python _build/build_data.py

Sources: FRED (St. Louis Fed), the World Bank API, Our World in Data, and the
Census Bureau. Everything is public and needs no API key. Outputs land in
projects/data/. The underscore keeps this folder out of the published site.
"""

from __future__ import annotations

import io
import json
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import subprocess
from statsmodels.tsa.ar_model import AutoReg

warnings.filterwarnings("ignore")
OUT = Path(__file__).resolve().parents[1] / "projects" / "data"
OUT.mkdir(parents=True, exist_ok=True)
class _Resp:
    def __init__(self, content: bytes):
        self.content = content
        self.text = content.decode("utf-8", errors="replace")

    def json(self):
        return json.loads(self.text)


def get(url: str, tries: int = 4) -> _Resp:
    """Download with curl. Python's HTTP client stalls on FRED from this machine; curl doesn't."""
    for i in range(tries):
        res = subprocess.run(["curl", "-sSL", "--fail", "-m", "120", url], capture_output=True)
        if res.returncode == 0:
            return _Resp(res.stdout)
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"download failed: {url}: {res.stderr.decode(errors='replace')[:200]}")


def fred(series: str) -> pd.Series:
    df = pd.read_csv(io.StringIO(get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}").text))
    df.columns = ["date", "value"]
    df["date"] = pd.to_datetime(df.date)
    return pd.to_numeric(df.value, errors="coerce").set_axis(df.date).dropna()


def owid(slug: str) -> pd.DataFrame:
    return pd.read_csv(io.StringIO(get(f"https://ourworldindata.org/grapher/{slug}.csv?v=1&csvType=full").text))


def dump(name: str, obj) -> None:
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))
    print(f"{name:16s} {path.stat().st_size / 1024:6.0f} KB")


def r(x, d=4):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), d)


# ---------------------------------------------------------------------------
# 1. Forecasts that can be wrong: rolling-origin evaluation against naive
# ---------------------------------------------------------------------------
def forecasts() -> None:
    cpi = fred("CPIAUCSL")
    ip = fred("INDPRO")
    series = {
        "unrate": ("Unemployment rate", "%", fred("UNRATE")),
        "inflation": ("CPI inflation, 12-month", "%", (100 * (cpi / cpi.shift(12) - 1)).dropna()),
        "indpro": ("Industrial production, 12-month growth", "%", (100 * (ip / ip.shift(12) - 1)).dropna()),
        "fedfunds": ("Federal funds rate", "%", fred("FEDFUNDS")),
    }
    horizons = [1, 3, 6, 12]
    out = {"series": {}, "start": "2000-01"}
    for key, (label, unit, y) in series.items():
        y = y[y.index >= "1960-01-01"].asfreq("MS").interpolate()
        origins = y.index[(y.index >= "1999-12-01") & (y.index <= y.index[-1 - 1])]
        rows = []
        for t in origins:
            hist = y[y.index <= t]
            # Expanding-window AR on the level, refit at every origin with only the data available then.
            p = 13 if key != "fedfunds" else 4
            fit = AutoReg(hist.values, lags=p, trend="c").fit()
            path = fit.predict(start=len(hist), end=len(hist) + max(horizons) - 1)
            mean10 = hist.iloc[-120:].mean()
            for h in horizons:
                target = t + pd.DateOffset(months=h)
                if target not in y.index:
                    continue
                rows.append({"origin": t, "target": target, "h": h, "actual": y[target],
                             "ar": path[h - 1], "rw": hist.iloc[-1], "mean": mean10})
        f = pd.DataFrame(rows)

        def rmse(d, col):
            return float(np.sqrt(np.mean((d[col] - d.actual) ** 2)))

        table = []
        for h in horizons:
            d = f[f.h == h]
            calm = d[~d.target.between("2020-03-01", "2021-12-01")]
            table.append({
                "h": h,
                "rw": r(rmse(d, "rw")), "ar": r(rmse(d, "ar")), "mean": r(rmse(d, "mean")),
                "ar_calm": r(rmse(calm, "ar")), "rw_calm": r(rmse(calm, "rw")),
                # Share of forecasts where the model beat the naive guess.
                "ar_wins": r((abs(d.ar - d.actual) < abs(d.rw - d.actual)).mean(), 3),
            })
        f12 = f[f.h == 12]
        out["series"][key] = {
            "label": label, "unit": unit,
            "actual": [[d.strftime("%Y-%m"), r(v, 3)] for d, v in y[y.index >= "1995-01-01"].items()],
            "f12": [[o.strftime("%Y-%m"), t.strftime("%Y-%m"), r(a, 3), r(w, 3)]
                    for o, t, a, w in zip(f12.origin, f12.target, f12.ar, f12.rw)],
            "table": table,
        }
    dump("forecasts", out)


# ---------------------------------------------------------------------------
# 2. Where Americans went: state populations 1900-2025 and the center
# ---------------------------------------------------------------------------
STATES = {"AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10",
          "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19",
          "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
          "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35",
          "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
          "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
          "WV": "54", "WI": "55", "WY": "56"}


def migration() -> None:
    centers = pd.read_csv(io.StringIO(get(
        "https://www2.census.gov/geo/docs/reference/cenpop2020/CenPop2020_Mean_ST.txt").content.decode("utf-8-sig")),
        dtype={"STATEFP": str})
    centers = centers.set_index("STATEFP")
    pops = {}
    for ab, fips in STATES.items():
        s = fred(f"{ab}POP")
        pops[ab] = s.groupby(s.index.year).last()  # thousands
        time.sleep(0.15)
    df = pd.DataFrame(pops).sort_index()
    years = [y for y in df.index if y >= 1900]
    states = []
    for ab, fips in STATES.items():
        c = centers.loc[fips]
        states.append({"id": ab, "fips": fips, "name": c.STNAME, "lat": r(c.LATITUDE, 3), "lon": r(c.LONGITUDE, 3),
                       "pop": [r(df.loc[y, ab], 0) if pd.notna(df.loc[y, ab]) else None for y in years]})
    # Center of population: population-weighted mean of each state's 2020 center
    # (a sphere-correct mean would barely differ at this scale). Alaska and
    # Hawaii join the series when FRED does (1950); the Census center includes them.
    track = []
    for i, y in enumerate(years):
        w = np.array([s["pop"][i] or 0 for s in states], float)
        lat = np.array([s["lat"] for s in states]); lon = np.array([s["lon"] for s in states])
        track.append({"year": y, "lat": r((w * lat).sum() / w.sum(), 3), "lon": r((w * lon).sum() / w.sum(), 3),
                      "total": r(w.sum(), 0)})
    dump("migration", {"years": years, "states": states, "track": track})


# ---------------------------------------------------------------------------
# 3. Money and prices: World Bank, every country, by decade
# ---------------------------------------------------------------------------
def worldbank(ind: str) -> pd.DataFrame:
    rows, page = [], 1
    while True:
        js = get(f"https://api.worldbank.org/v2/country/all/indicator/{ind}?format=json&per_page=20000&page={page}"
                 "&date=1960:2025").json()
        rows += js[1] or []
        if page >= js[0]["pages"]:
            break
        page += 1
    df = pd.DataFrame([{"iso": x["countryiso3code"], "name": x["country"]["value"], "year": int(x["date"]),
                        "v": x["value"]} for x in rows])
    return df.dropna(subset=["v"])


def money() -> None:
    meta = get("https://api.worldbank.org/v2/country?format=json&per_page=400").json()[1]
    countries = {m["id"]: (m["name"], m["region"]["value"], m["incomeLevel"]["value"]) for m in meta
                 if m["region"]["value"] != "Aggregates"}
    m = worldbank("FM.LBL.BMNY.ZG").rename(columns={"v": "m"})
    p = worldbank("FP.CPI.TOTL.ZG").rename(columns={"v": "p"})
    g = worldbank("NY.GDP.MKTP.KD.ZG").rename(columns={"v": "g"})
    df = m.merge(p[["iso", "year", "p"]], on=["iso", "year"]).merge(g[["iso", "year", "g"]], on=["iso", "year"])
    df = df[df.iso.isin(countries)]
    # Average in logs so 1,000% one year and -50% the next don't average to 475%.
    for c in ("m", "p", "g"):
        df = df[df[c] > -99]
        df["l" + c] = np.log1p(df[c] / 100)
    df["decade"] = df.year // 10 * 10
    dec = df.groupby(["iso", "decade"]).agg(n=("year", "size"), lm=("lm", "mean"), lp=("lp", "mean"),
                                            lg=("lg", "mean")).reset_index()
    dec = dec[dec.n >= 5]
    pts = []
    for d in dec.itertuples():
        name, region, income = countries[d.iso]
        pts.append({"iso": d.iso, "name": name, "region": region, "decade": int(d.decade), "n": int(d.n),
                    "m": r(100 * np.expm1(d.lm), 2), "p": r(100 * np.expm1(d.lp), 2), "g": r(100 * np.expm1(d.lg), 2),
                    "x": r(100 * np.expm1(d.lm - d.lg), 2)})
    # Slopes of inflation on (money - output) growth, in logs, by band.
    dd = dec.assign(x=dec.lm - dec.lg)
    bands = []
    for lo, hi, label in [(-1, np.log1p(0.10), "under 10%"), (np.log1p(0.10), np.log1p(0.40), "10% to 40%"),
                          (np.log1p(0.40), 99, "over 40%"), (-1, 99, "all")]:
        s = dd[(dd.x > lo) & (dd.x <= hi)]
        b, a = np.polyfit(s.x, s.lp, 1)
        bands.append({"band": label, "n": len(s), "slope": r(b, 3), "corr": r(np.corrcoef(s.x, s.lp)[0, 1], 3)})
    annual = df[["iso", "year", "m", "p", "g"]].round(2)
    keep = {"USA", "ARG", "BRA", "TUR", "ZWE", "JPN", "CHE", "DEU", "GBR", "CHL", "ISR", "MEX", "VEN", "IDN",
            "KOR", "IND", "CHN", "NGA", "ZAF", "RUS", "PER", "BOL", "POL", "EGY"}
    series = {iso: annual[annual.iso == iso][["year", "m", "p", "g"]].values.tolist() for iso in keep}
    dump("money", {"points": pts, "bands": bands, "series": series,
                   "names": {k: v[0] for k, v in countries.items() if k in keep}})


# ---------------------------------------------------------------------------
# 4. The great stagnation, measured
# ---------------------------------------------------------------------------
def stagnation() -> None:
    lp = fred("OPHNFB")  # output per hour, nonfarm business, index 2017=100, quarterly
    tfp = fred("RTFPNAUSA632NRUG")  # TFP at constant national prices, 2017=1 (Penn World Table)
    gdppc = fred("A939RX0Q048SBEA")  # real GDP per capita, chained dollars
    eras = [(1948, 1973), (1973, 1995), (1995, 2005), (2005, 2019), (2019, int(lp.index[-1].year))]

    def cagr(s, a, b):
        s = s.groupby(s.index.year).mean()
        a, b = max(a, s.index.min()), min(b, s.index.max())
        return r(100 * ((s[b] / s[a]) ** (1 / (b - a)) - 1), 2), a, b

    era_rows = []
    for a, b in eras:
        g_lp, a1, b1 = cagr(lp, a, b)
        g_tfp = cagr(tfp, a, b)[0] if a < tfp.index.max().year else None
        era_rows.append({"from": a1, "to": b1, "lp": g_lp, "tfp": g_tfp})
    q = lp[lp.index >= "1948-01-01"]
    # Counterfactual: keep 1948-73 trend going.
    g0 = (1 + era_rows[0]["lp"] / 100) ** 0.25 - 1
    base = q[q.index.year == 1973].iloc[0]
    cf = [r(base * (1 + g0) ** i, 2) for i in range(len(q[q.index >= "1973-01-01"]))]
    dump("stagnation", {
        "lp": [[d.strftime("%Y-%m"), r(v, 2)] for d, v in q.items()],
        "cf_from": "1973-01", "cf": cf,
        "tfp": [[d.year, r(v, 4)] for d, v in tfp.items()],
        "gdppc": [[d.strftime("%Y-%m"), r(v, 0)] for d, v in gdppc.items()],
        "eras": era_rows,
    })


# ---------------------------------------------------------------------------
# 5. Learning curves: solar modules (Wright's law)
# ---------------------------------------------------------------------------
def learning() -> None:
    df = owid("solar-pv-prices-vs-cumulative-capacity")
    df = df[df.Entity == "World"].dropna(subset=["Solar PV module cost", "Cumulative installed solar PV capacity"])
    df = df.rename(columns={"Solar PV module cost": "price", "Cumulative installed solar PV capacity": "cap"})
    df = df[df.cap > 0].sort_values("Year")
    lx, ly = np.log2(df.cap.values), np.log2(df.price.values)
    b, a = np.polyfit(lx, ly, 1)
    learning_rate = 1 - 2 ** b
    # Out-of-sample test: fit through year Y, predict later prices from later capacity.
    tests = []
    for cut in (1990, 2000, 2010):
        tr = df[df.Year <= cut]
        bb, aa = np.polyfit(np.log2(tr.cap), np.log2(tr.price), 1)
        te = df[df.Year > cut]
        pred = 2 ** (aa + bb * np.log2(te.cap))
        tests.append({"cut": cut, "lr": r(1 - 2 ** bb, 3),
                      "pred": [[int(y), r(p, 3)] for y, p in zip(te.Year, pred)],
                      "mape": r(float(np.mean(np.abs(pred / te.price - 1))), 3)})
    # Moore's law, for contrast: time, not experience.
    try:
        tr = owid("transistors-per-microprocessor")
        tr = tr[tr.Entity == "World"].iloc[:, [2, 3]].dropna()
        trans = [[int(y), r(v, 0)] for y, v in tr.values]
    except Exception:
        trans = []
    dump("learning", {
        "solar": [[int(y), r(p, 3), r(c, 3)] for y, p, c in zip(df.Year, df.price, df.cap)],
        "fit": {"slope": r(b, 4), "intercept": r(a, 4), "lr": r(learning_rate, 3)},
        "tests": tests, "transistors": trans,
        "units": {"price": "2023 US$ per watt", "cap": "megawatts, cumulative"},
    })


if __name__ == "__main__":
    import sys

    jobs = {"forecasts": forecasts, "migration": migration, "money": money, "stagnation": stagnation,
            "learning": learning}
    for name in (sys.argv[1:] or jobs):
        jobs[name]()
