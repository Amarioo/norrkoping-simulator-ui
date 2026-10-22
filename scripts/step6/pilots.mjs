// Step 6 pilot areas, shared by the lighting importer, tests and docs. Scene units (1 = 25 m),
// SWEREF 99 TM scene frame (README "Koordinatsystem").
export const PILOTS = [
  {
    id: 'kungsgatan',
    name: 'Kungsgatan (Kungsbron – Skvallertorget – Vattengatan)',
    kind: 'street',
    // Kungsgatan ways 26154805 (bridge) … 297613952 and the side streets inside the box.
    bounds: { x0: -25.0, x1: -19.6, z0: -14.6, z1: 3.1 },
  },
  {
    id: 'stromparken',
    name: 'Strömparken (footways 92429395 / 243821537 along Motala ström)',
    kind: 'park',
    bounds: { x0: -10.2, x1: -5.8, z0: -9.3, z1: 0.6 },
  },
  {
    id: 'idrottsparken',
    name: 'Idrottsparken (Norrköpings Idrottspark) and Ektorpsgatan / Matchgatan',
    kind: 'stadium',
    bounds: { x0: -39.6, x1: -27.0, z0: 18.4, z1: 32.4 },
  },
];
