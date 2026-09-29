# Research & Dashboard Improvement Backlog

Internal project planning, not part of the public dashboard. Created during the Step 7 public-content cleanup. Items below are future work, not corrections implemented or validated in this step. CSVs and research results remain unchanged.

This file is outside `docs/` and must not be linked from public pages. It is not access-controlled: a public repository may still expose the file.

## Priority 1 — Data / Methodology

### Segmentation

| Item | Status | Impact |
|---|---|---|
| Investigate country-level aggregation missingness / NaN propagation. | Open | Data |
| Review missing cost and food-gap dimensions. | Open | Data |
| Correct quadrant assignment when one dimension is unavailable; agree an explicit unclassified category before changing outputs. | Needs Decision | Methodology |
| Rebuild segmentation CSV after ETL correction and validation. | Deferred | Data |

Public coverage notes must continue to distinguish plottable countries from reported segment counts. Do not interpret missing dimensions as evidence of low risk. No aggregation bug hypothesis is treated as a confirmed cause by this backlog.

### Transport Cost Model

| Item | Status | Impact |
|---|---|---|
| Establish a true chronological/out-of-sample ANN evaluation. | Open | Methodology |
| Standardize evaluation scales across econometric and ML models, or explicitly preserve their noncomparability. | Needs Decision | Methodology |
| Correct/clarify internal target naming: `ln_cost_tonkm` is implemented from transport expenditure per ton. | Open | Methodology |
| Review absorbed-pair FE implementation. | Open | Methodology |
| Review collinearity of connectivity-related predictors. | Open | Methodology |
| Build fully reproducible pooled OLS/GLM result exports from fitted objects. | Open | Reproducibility |

Pooled values reproduce the defended thesis; original current-specification fitted coefficient objects were not recovered. The thesis displays identical OLS/GLM coefficient values; this cleanup does not correct or reinterpret them. Ridge uses a held-out random test, whereas the ANN results are in-sample/all-data fitted results. Public labels must retain this distinction and the log-versus-level metric scales.

### Trade Flow Model

| Item | Status | Impact |
|---|---|---|
| Recover or regenerate a fully reproducible held-out ANN evaluation under a separately approved research workflow. | Open | Reproducibility |
| Preserve row-level test membership and prediction artifacts. | Open | Reproducibility |
| Standardize metric definitions/scales across OLS, PPML and ANN. | Needs Decision | Methodology |
| Review terminology for origin/destination FE versus bilateral-pair FE. | Open | Methodology |
| Validate SHAP feature-name dependencies. | Open | Reproducibility |

ANN metrics are thesis-reported; exact historical test membership and row-level prediction artifacts were not recovered. Do not add a substitute prediction scatter claiming the same evaluation. Econometric metrics include rounded saved notebook outputs, rather than universally recovered full-precision fitted objects. Complete historical OLS error metrics were not recovered. Keep the public reported-precision and evaluation-scope qualifications.

### Forecast Simulation

| Item | Status | Impact |
|---|---|---|
| Reconcile the approximately 68.7–68.8 Mt scenario baseline with the approximately 107–109 Mt absolute baseline narrative in the defended thesis. | Needs Decision | Methodology |
| Review null/missing country identities in the forward panel. | Open | Data |
| Correct the historical many-to-many scenario comparison merge. | Open | Data |
| Reconcile El Niño methodology narrative versus results-table assumptions. | Needs Decision | Methodology |
| Reconcile EU ETS intended/configured/implemented product scope. | Needs Decision | Methodology |
| Validate importer cost-to-FOB burden denominators before publication. | Deferred | Data |
| Recover/reproduce exact defended figure-generation lineage if needed for journal publication. | Deferred | Publication |
| Review country-code/label consistency, including the audited COG mapping. | Open | Data |
| Confirm the intended interpretation of the EGY parameter, implemented as destination production rather than calorific demand. | Needs Decision | Methodology |

Current canonical cases: external 16-pair `black_sea`, external `el_nino`, and repository `EU ETS Maritime Regulation`. Do not substitute the repository two-pair Black Sea case or no-op bundles. Each case is compared against its own matching baseline.

Historical `compare.parquet` tables have a many-to-many expansion and must not be used for dashboard analytics. Step 6B derived the package directly from baseline/scenario predictions. Each 76,464-row source has 65,850 complete unique keys and 10,614 incomplete-key rows excluded from observation-level pairing. Global/product sums retain saved row multiplicity; independent summation does not repair upstream identity defects.

The product ratio-of-sums metric differs from the historical mean of row-level indices. Corridors retain both equal-observation percentage means and separate tonnes-based deltas. Cost indices are unweighted and restricted to configured pairs and the declared product scope. The corridor file cannot support product-specific recomputation. Do not silently change these definitions during future cleanup.

El Niño includes nonzero logistics shocks in the results-table case, despite the logistics-intact methodology narrative. EU ETS intended wheat/maize/rice, selection used wheat/maize, the repository configuration has an empty product list, and the implemented pair-level transport shock affects all eight cereal products. These scientific scope differences remain public; file-recovery history does not.

## Priority 2 — Reproducibility

| Item | Status | Impact |
|---|---|---|
| Convert notebook-dependent workflow into deterministic pipeline scripts. | Open | Reproducibility |
| Freeze model configuration and environment versions. | Open | Reproducibility |
| Create explicit model/result manifests. | Open | Reproducibility |
| Save train/test membership with prediction artifacts. | Open | Reproducibility |
| Save provenance metadata alongside future result exports. | Open | Reproducibility |
| Avoid mutable global state in scenario exporters. | Open | Reproducibility |
| Remove stale/no-op scenario directories only after review, archival and explicit approval. | Needs Decision | Reproducibility |

Internal provenance terminology removed from the public presentation includes artifact validation, saved notebook output, missing fitted objects, historical test-membership recovery, ETL reconstruction and source reconciliation. Raw provenance fields remain in the unchanged CSVs. Cleanup is editorial, not evidence that these reproducibility issues have been solved.

## Priority 3 — Dashboard Engineering

| Item | Status | Impact |
|---|---|---|
| Consider partitioning or compressing the approximately 32 MB corridor CSV. | Deferred | Dashboard |
| Benchmark GitHub Pages corridor-loading performance over normal internet connections. | Open | Dashboard |
| Consider scenario/year-partitioned corridor files if performance becomes problematic. | Deferred | Dashboard |
| Add automated browser smoke tests to the repository/CI. | Open | Dashboard |
| Add reusable lightweight schema validation for dashboard CSVs. | Open | Dashboard |
| Review accessibility more fully after MVP publication. | Open | Dashboard |
| Establish a public export/provenance policy if downloadable CSV metadata should also be simplified; retain full internal provenance separately. | Needs Decision | Dashboard |

Corridor data currently loads on explicit request and is cached in memory. One-off browser checks and inline validation are not a substitute for maintained automated tests. The backlog is not linked from the site, but root placement is not a privacy boundary for a public Git repository.

## Priority 4 — Publication / Journal Version

| Item | Status | Impact |
|---|---|---|
| Harmonize manuscript terminology with implemented variables. | Open | Publication |
| Re-run final models only under a frozen reproducible environment and explicit research approval if preparing journal results. | Deferred | Publication |
| Produce publication-quality coefficient and performance tables directly from model objects. | Deferred | Publication |
| Review scenario assumptions against latest literature. | Deferred | Publication |
| Add sensitivity / robustness analysis where appropriate. | Needs Decision | Methodology |

No item in this backlog is authorized for implementation merely by being listed. Step 7 performs public wording cleanup only; it does not execute notebooks, refit models, rerun scenarios, repair ETL or revise source data.
