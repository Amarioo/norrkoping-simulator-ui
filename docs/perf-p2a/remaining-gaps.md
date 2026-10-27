# Phase P2a — remaining gaps

1. **Slower machine than in P1, cause unknown.** `main` took 25 ms CPU in the overview today against
   15.8 ms in P1; P1's own build is just as slow today, so it is the machine or browser, not the code.
   Paired differences hold; absolute ms are not comparable with P1, and whether the 60 fps target is
   met can only be judged once the machine is back at P1's speed (or by re-measuring `main` then).
2. **One machine, headless.** As in P1: the user's computer, Edge headless uncapped. The real 164 Hz
   screen and weaker computers were not measured (P3).
3. **More off-screen triangles in street views.** 2 km cells cull less: Kungsgatan draws 278 k tree
   triangles instead of 94 k, Innerstaden 559 k instead of 395 k. No cost was measurable here (GPU
   not the bottleneck); on a weak GPU 1 km cells (−7.2 ms overview, Kungsgatan 207 k) may be the
   safer choice. Not measured on such a GPU.
4. **rAF p95 is quantised** around 17–19 ms frames (browser frame scheduling); CPU p95 is reported as
   the long-frame measure. Frame pacing on the real display was not measured.
5. **A3 Playwright test is flaky** on both `main` and the branch (picture after context restoration;
   `main` 2/5, branch 3/5 alone). Known since P0/P1; not investigated here.
6. **Source maps of hook builds are not reproducible** (`three.core-*.js.map` differs between two
   rebuilds of the same code). Code files are; production builds (no source maps) are byte-identical.
