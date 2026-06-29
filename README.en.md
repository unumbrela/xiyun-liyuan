<div align="center">

# Xiyun · Liyuan Genealogy

**A Visual Analytics System for Peking Opera Scripts**

[简体中文](README.md) · **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-c0392b.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=white)
![ECharts](https://img.shields.io/badge/ECharts-charts-AA344D)
![Electron](https://img.shields.io/badge/Electron-desktop-47848F?logo=electron&logoColor=white)

An end-to-end visual analytics system over **1,473 Peking Opera scripts**. A Python backend parses the script PDFs and runs five analysis tasks; a React + ECharts frontend presents the results as interactive modules. The prototype targets the ChinaVis 2026 Challenge 1-I Peking Opera dataset.

</div>

<div align="center">
  <img src="docs/screenshots/overview.jpg" alt="Overview dashboard" width="92%">
  <br><sub>Overview dashboard: role-type composition, genre and period distribution, data sources, task progress</sub>
</div>

---

## Download · desktop app (Windows, no install)

No Python / Node needed — [**get it from Releases**](https://github.com/unumbrela/xiyun-liyuan/releases/latest)

| File | Notes |
| --- | --- |
| `XiyunLiyuan-1.0.1-x64-portable.exe` | Portable, double-click to run |

The backend starts and stops with the app. A limited demo key is bundled so the AI assistant works out of the box; you can switch to your own DeepSeek API key in settings.

> The exe is not code-signed, so Windows SmartScreen may warn about an "unknown publisher" on first run — choose "Run anyway".
> To run from source instead, see "Quick start" below.

---

## What this project is

The input is 1,473 Peking Opera script PDFs. The system parses them into a unified corpus, then runs five analyses — role types, character relationships, plot topics, narrative structure, and cross-dimension correlation — and turns each result into an interactive visualization.

- **One shared corpus**: all 1,473 scripts parsed into 7,656 annotated role instances and 360,223 dialogue lines, stored as `corpus.jsonl` + `plays.sqlite` and reused by every task.
- **Five analysis tasks**: role classification, relationship network, topic extraction, narrative structure, and cross-dimension correlation — each with its own frontend module.
- **A guided interface**: from "Introduction (cultural context)" to "five analysis tasks" to "Conclusion (summary)", with a left-side navigation across nine modules.
- **Global play linkage**: search any play in the sidebar to set it as the "current play"; the five task modules then show that play's profile (single source of truth, persisted locally).
- **A data-grounded AI assistant**: a built-in tool-calling agent that answers from the metrics the system has already computed, without making up data.

---

## Modules

The system is organized as nine modules following "context → analysis → conclusion":

| Module | Content |
| --- | --- |
| Introduction | Peking Opera timeline, map of Chinese opera genres and origins, role types and makeup, facial-paint colors, the four skills |
| Overview | Role-type composition, genre distribution, period distribution, data sources, task progress (`/api/overview`) |
| Task 1 · Role classification | Role-type classification and inference, confidence audit, confusion analysis, sub-types, period evolution |
| Task 2 · Relationship network | Co-occurrence + dialogue-adjacency graph, network structure compared across genres, force-directed single-play graph |
| Task 3 · Topic extraction | LDA topic modeling, topic co-occurrence, archetype clustering, cross-genre/period comparison, similar-play recommendation |
| Task 4 · Narrative structure | Per-scene dramatic-intensity curve, key-stage detection, typical narrative-arc clustering |
| Task 5 · Cross-dimension correlation | Correlation across network × topic × narrative × role type, synergy links, composite archetypes |
| Two-play comparison | Side-by-side four-dimension comparison of any two plays |
| Conclusion | Summary of findings, statement of method limits, data-source acknowledgments |

---

## Interface preview

<table>
<tr>
<td width="50%"><img src="docs/screenshots/intro.jpg" alt="Introduction"><br><sub><b>Introduction</b> · origin timeline and opera-genre map</sub></td>
<td width="50%"><img src="docs/screenshots/task1-roles.jpg" alt="Task 1 role classification"><br><sub><b>Task 1</b> · confusion matrix, role distribution, confidence audit</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/task2-network.jpg" alt="Task 2 relationship network"><br><sub><b>Task 2</b> · structural roles, genre-difference significance, period evolution</sub></td>
<td width="50%"><img src="docs/screenshots/task3-topics.jpg" alt="Task 3 topic extraction"><br><sub><b>Task 3</b> · topic shift over time, per-play topic composition and similar plays</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/task4-narrative.jpg" alt="Task 4 narrative structure"><br><sub><b>Task 4</b> · rhythm-difference tests, arc-count selection, intensity sensitivity</sub></td>
<td width="50%"><img src="docs/screenshots/task5-synthesis.jpg" alt="Task 5 cross-dimension correlation"><br><sub><b>Task 5</b> · cross-dimension correlation, synergy links, composite archetypes</sub></td>
</tr>
</table>

---

## Key findings

Each task reports both its conclusion and its method limits, without overstating what the model can do.

- **Task 1 · Role classification**: logistic regression over role instances (performance/structural/profile features + line TF-IDF) reaches instance-level 5-fold macro-F1 **0.704**, **0.696** under play-grouped validation, and **0.753** on the four official classes; 15,034 unannotated roles are inferred and flagged by high/medium/low confidence. Confusion analysis shows the largest error between "sheng ↔ jing", consistent with both being speech-dominant with similar stage presence — i.e., the ceiling comes from genuinely blurred role boundaries, not a model defect.
- **Task 2 · Relationship network**: court-case plays have the largest networks and highest centralization (a star structure around the judge); historical plays have the highest modularity (clear opposing camps); domestic plays are the smallest but densest. Role assortativity is negative across all genres (**−0.16** overall), so communities reflect "opposing camps", not "same role type clustering together".
- **Task 3 · Topic extraction**: after removing entities (names/props), LDA yields **10 action topics** (campaign, loyalty/revenge, marriage/family, trial, etc.) chosen data-driven. Campaign topics decline over time while family-ethics topics rise (all significant under Kruskal–Wallis + BH-FDR). Matched-cosine comparison against NMF and multi-seed LDA shows the core topics reproduce well.
- **Task 4 · Narrative structure**: per-scene dramatic-intensity curves are synthesized from the four-skills markup, and KMeans clusters **5 typical narrative arcs**. Climaxes tend to fall in the later half. Historical plays have significantly more action than domestic and supernatural plays, but the difference from court-case plays is not significant (pairwise Mann–Whitney U).
- **Task 5 · Cross-dimension correlation**: correlations and synergy links are computed across the four dimensions. After controlling for play size with partial correlation, the **role-type synergy is real** (modularity ↔ jing/dan share stays robust), whereas "modularity ↔ action" turns out to be a size artifact (decays to near zero once controlled). A lightweight prediction check — predicting the narrative arc from non-narrative dimensions only — reaches about 2.5× the majority-class baseline macro-F1.

---

## Architecture

```
pipeline/        Data parsing + five analyses (Python)
   └── extract → build_corpus → task1..task5 → verify_numbers
data/processed/  Artifacts: corpus.jsonl / plays.sqlite / *.parquet / task*_*.json
backend/         FastAPI; reads data/processed/* and serves JSON (network_lib shared)
frontend/        React + Vite + ECharts; one module per task under src/modules/
desktop/         Electron shell packaging backend + frontend into a desktop app
```

The data flow is one-directional: `pipeline` computes all results offline into `data/processed/`, `backend` only reads and aggregates on demand, and `frontend` fetches via the API and renders. The frontend never recomputes, so the system is ready to use on startup.

**Tech stack**: PyMuPDF (PDF parsing), scikit-learn (logistic regression / LDA / KMeans / MDS), networkx (relationship network), jieba (Chinese segmentation), scipy (statistical tests), FastAPI (backend), React + Vite + ECharts (frontend), Electron (desktop packaging).

### AI analysis assistant

A floating button at the bottom-right opens the AI assistant drawer for natural-language questions about the system's findings. The assistant is a tool-calling agent: the backend assembles the computed corpus-wide metrics and the current play's four-dimension profile as context, the agent retrieves the real data it needs, and the retrieval trace is shown in the UI. It connects to DeepSeek (OpenAI-compatible endpoint, model `deepseek-chat`); without a key it shows a notice and the rest of the system is unaffected.

<div align="center">
  <img src="docs/screenshots/ai-architecture.jpg" alt="AI assistant architecture" width="80%">
</div>

---

## Quick start

### 1. Environment

```bash
conda create -n llm python=3.11 && conda activate llm
pip install -r requirements.txt
```

The repository ships the `data/processed/` artifacts, so the service can start directly. To recompute from raw data, see "Reproduce the data pipeline" below.

### 2. Run (Linux / WSL / macOS)

```bash
./run.sh        # backend :8000 + frontend :5173
```

Open http://localhost:5173 . You can also start them separately:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000   # from the project root
cd frontend && npm install && npm run dev
```

### 3. Run (Windows)

Install Python 3.11+ and Node.js 20+, then double-click `run_windows.bat`, or run in PowerShell:

```powershell
.\run_windows.ps1
```

The script creates `.venv`, installs dependencies, and starts the backend and frontend.

### 4. Configure the AI assistant (optional)

```bash
export DEEPSEEK_API_KEY=sk-xxxx        # or copy backend/.env.example -> backend/.env
./run.sh
```

---

## Reproduce the data pipeline

Regenerate all artifacts from the raw scripts (stops on the first failure):

```bash
conda activate llm
cd pipeline && ./run_all.sh
```

Equivalent to running, in order:

```bash
python extract.py          # unzip nested archives -> data/raw (fix Chinese filename encoding)
python build_corpus.py     # parse all PDFs -> corpus.jsonl + plays.sqlite + quality report
python task1_features.py   # role-instance feature table instances.parquet
python task1_classify.py   # train / cross-validate / infer -> predictions, metrics, patterns
python task1_subrole.py    # hierarchical sub-type classification -> task1_subroles.json
python task1_temporal.py   # collection-to-period mapping, role evolution -> task1_temporal.json
python task2_network.py    # network metrics + genre statistics -> task2_*
python task3_topics.py     # LDA topics + combination patterns + cross-genre/period -> task3_*
python task4_narrative.py  # intensity curves + key stages + arc clustering -> task4_*
python task5_synthesis.py  # four-dimension correlation + synergy links + archetypes -> task5_*
python verify_numbers.py   # check that UI-cited numbers match the artifacts (pre-submit check)
```

---

## Desktop app

The Electron shell packages the backend and frontend into a standalone desktop app; the backend starts and stops with the app, and no Python / Node install is required. For dev runs and packaging, see [`desktop/README.md`](desktop/README.md):

```bash
cd desktop && npm install && npm run dev   # launch a standalone app window
```

---

## Repository layout

```
pipeline/        Data-parsing and five-task analysis scripts
backend/         FastAPI service (main.py / llm.py / agent.py / network_lib.py)
frontend/        React + Vite frontend (one module per task under src/modules/)
desktop/         Electron desktop wrapper
data/processed/  Analysis artifacts (corpus, database, per-task JSON)
docs/            Screenshots and figure-generation scripts (make_figures.py / make_diagrams.py)
requirements.txt Python dependencies (pinned)
run.sh           One-command start for Linux/WSL/macOS
run_windows.*    Windows start scripts
```

> The raw dataset `1-I_opera_dataset.zip` and `data/raw/` are large and not included in the repository; the bundled `data/processed/` is enough to run the system.

---

## License

Released under the [MIT License](LICENSE).
