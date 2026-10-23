// Read-only source discovery. Raw responses stay in ignored work/step62.
import fs from 'node:fs/promises';
const dir = new URL('../../work/step62/', import.meta.url);
await fs.mkdir(dir, { recursive: true });
const jobs = {
  trails: 'https://norrkoping.se/se-och-gora/motion-och-idrott/motionsspar',
  municipal: 'https://norrkoping.se/boende-trafik-och-miljo/lantmateri-och-kartor/oppna-kartdata-och-tjanster',
  noka: 'https://norrkoping.se/boende-trafik-och-miljo/lantmateri-och-kartor/norrkopingskartan-noka',
  aip: 'https://aro.lfv.se/Editorial/View/ZIP',
};
if (process.argv[2]) {
  jobs.custom = process.argv[2];
  for (const k of Object.keys(jobs)) if (k !== 'custom') delete jobs[k];
}
for (const [name, url] of Object.entries(jobs)) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    await fs.writeFile(new URL(name + '.html', dir), t);
    console.log(name, r.status, url);
    console.log([...t.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g)]
      .map(m => [m[1], m[2].replace(/<[^>]+>/g, '').trim()])
      .filter(m => /ESSP|Vrinnevi|\.zip|2026|licen|öppna|belys|elljus|kartor|AIP|copyright|CC /i.test(m.join(' '))));
  } catch (e) { console.log(name, e.message); }
}
