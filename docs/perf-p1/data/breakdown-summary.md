# Phase P1 — draw calls and triangles per part

Phase P1 breakdown: one frame's draw calls attributed to parts (renderer.renderBufferDirect wrapped for that frame, renderer.info read before and after each call), fullscreen 2560x1440, production build with VITE_LIGHTING_HOOK=1, Edge headless uncapped, DPR 1, Europe/Stockholm 2026-10-21, stadium off. Traffic "off" = every /api request aborted (no simulator stream).

Host: AMD Ryzen 7 9800X3D 8-Core Processor           , 16 threads. GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11).
Columns: draw calls, triangles, drawn objects / visible objects of the part, materials and shader programs used, material switches (draw-order changes of material, each one makes three.js re-upload that material's uniforms), scene nodes under the part (all of them go through the matrix update every frame). Median capture of three (by draw calls).

## day/overview, traffic on — 7,915 calls, 10,188,762 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 1,246 | 15.7 % | 408,632 | 1,246 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 283 | 3.6 % | 86,941 | 278 / 278 | 278 | 4 | 278 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 1,992 | 25.2 % | 4,202,668 | 1,992 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 1,877 | 23.7 % | 3,725,824 | 1,877 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 0.6 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 310 | 3.9 % | 135,820 | 310 / 324 | 1 | 1 | 1 | 325 |
| Träd | 784 | 9.9 % | 712,152 | 784 / 810 | 784 | 2 | 784 | 810 |
| Lyktstolpar och halos | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 24 |
| Fordon (bilar, lastbilar) | 125 | 1.6 % | 327,520 | 125 / 125 | 9 | 2 | 4 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 2.4 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.0 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 52 | 0.7 % | 3,740 | 52 / 52 | 9 | 2 | 9 | 56 |
| Etiketter | 10 | 0.1 % | 20 | 10 / 10 | 10 | 1 | 10 | 24 |
| Landmärke: rådhuset | 5 | 0.1 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.1 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.1 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 975 | 12.3 % | 28,648 | 975 / 975 | 25 | 3 | 25 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/city, traffic on — 3,372 calls, 5,776,356 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 496 | 14.7 % | 269,531 | 496 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 222 | 6.6 % | 83,853 | 217 / 278 | 217 | 4 | 217 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 788 | 23.4 % | 1,842,628 | 788 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 947 | 28.1 % | 2,255,317 | 947 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.4 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 103 | 3.1 % | 23,355 | 103 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 7.2 % | 395,172 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 24 |
| Fordon (bilar, lastbilar) | 125 | 3.7 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 5.7 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 52 | 0 | 0 | 0 | 56 |
| Etiketter | 21 | 0.6 % | 42 | 21 / 23 | 21 | 1 | 21 | 24 |
| Landmärke: rådhuset | 5 | 0.1 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.2 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.2 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 165 | 4.9 % | 22,141 | 165 / 975 | 24 | 3 | 24 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/kungsgatan, traffic on — 628 calls, 1,504,193 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 43 | 6.8 % | 43,888 | 43 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 52 | 8.3 % | 64,398 | 50 / 278 | 50 | 4 | 50 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 59 | 9.4 % | 153,416 | 59 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 94 | 15.0 % | 253,857 | 94 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 2.4 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 5 | 0.8 % | 1,977 | 5 / 324 | 1 | 1 | 1 | 325 |
| Träd | 10 | 1.6 % | 94,068 | 10 / 810 | 10 | 2 | 10 | 810 |
| Lyktstolpar och halos | 9 | 1.4 % | 33,742 | 9 / 10 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 125 | 19.9 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 30.4 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.5 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 52 | 0 | 0 | 0 | 56 |
| Etiketter | 2 | 0.3 % | 4 | 2 / 23 | 2 | 1 | 2 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 1.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 11 | 1.8 % | 17,852 | 11 / 975 | 8 | 2 | 8 | 976 |
| Himmel | 1 | 0.2 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/stromparken, traffic on — 2,504 calls, 3,964,136 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 379 | 15.1 % | 116,337 | 379 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 132 | 5.3 % | 83,659 | 127 / 278 | 127 | 4 | 127 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 600 | 24.0 % | 1,247,347 | 600 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 633 | 25.3 % | 1,297,638 | 633 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 35 | 1.4 % | 270,456 | 35 / 47 | 35 | 2 | 35 | 48 |
| Vatten | 97 | 3.9 % | 53,095 | 97 / 324 | 1 | 1 | 1 | 325 |
| Träd | 246 | 9.8 % | 244,512 | 246 / 810 | 246 | 2 | 246 | 810 |
| Lyktstolpar och halos | 11 | 0.4 % | 55,968 | 11 / 12 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 125 | 5.0 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 7.6 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 52 | 0 | 0 | 0 | 56 |
| Etiketter | 4 | 0.2 % | 8 | 4 / 23 | 4 | 1 | 4 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 39 | 1.6 % | 19,661 | 39 / 975 | 7 | 3 | 7 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/police, traffic on — 540 calls, 1,369,633 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 35 | 6.5 % | 34,083 | 35 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 22 | 4.1 % | 54,636 | 21 / 278 | 21 | 3 | 21 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 37 | 6.9 % | 95,144 | 37 / 2,034 | 1 | 1 | 1 | 2,036 |
| Vägar, vägmarkeringar och räls | 76 | 14.1 % | 201,641 | 76 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 2.8 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 4 | 0.7 % | 534 | 4 / 324 | 1 | 1 | 1 | 325 |
| Träd | 8 | 1.5 % | 88,128 | 8 / 810 | 8 | 2 | 8 | 810 |
| Lyktstolpar och halos | 12 | 2.2 % | 36,942 | 12 / 13 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 125 | 23.1 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 35.4 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.6 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 52 | 0 | 0 | 0 | 56 |
| Etiketter | 1 | 0.2 % | 2 | 1 / 23 | 1 | 1 | 1 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 1.5 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 2 | 0.4 % | 17,532 | 2 / 975 | 2 | 1 | 2 | 976 |
| Himmel | 1 | 0.2 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/idrottsparkenPitch, traffic on — 2,832 calls, 4,483,864 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 435 | 15.4 % | 133,817 | 435 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 140 | 4.9 % | 83,685 | 135 / 278 | 135 | 4 | 135 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 729 | 25.7 % | 1,508,024 | 729 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 688 | 24.3 % | 1,441,450 | 688 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.7 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 139 | 4.9 % | 48,583 | 139 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 8.6 % | 276,912 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 13 | 0.5 % | 52,364 | 13 / 14 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 125 | 4.4 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 6.7 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 52 | 0 | 0 | 0 | 56 |
| Etiketter | 9 | 0.3 % | 18 | 9 / 23 | 9 | 1 | 9 | 24 |
| Landmärke: rådhuset | 5 | 0.2 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 10 | 0.4 % | 55,822 | 10 / 10 | 10 | 4 | 10 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 45 | 1.6 % | 19,820 | 45 / 975 | 11 | 2 | 11 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/overview, traffic on — 7,916 calls, 10,240,460 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 1,246 | 15.7 % | 408,632 | 1,246 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 283 | 3.6 % | 86,941 | 278 / 278 | 278 | 4 | 278 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 1,992 | 25.2 % | 4,202,668 | 1,992 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 1,877 | 23.7 % | 3,725,824 | 1,877 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 0.6 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 310 | 3.9 % | 135,820 | 310 / 324 | 1 | 1 | 1 | 325 |
| Träd | 784 | 9.9 % | 712,152 | 784 / 810 | 784 | 2 | 784 | 810 |
| Lyktstolpar och halos | 1 | 0.0 % | 51,698 | 1 / 1 | 1 | 1 | 1 | 24 |
| Fordon (bilar, lastbilar) | 125 | 1.6 % | 327,520 | 125 / 125 | 9 | 2 | 4 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 2.4 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.0 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 52 | 0.7 % | 3,740 | 52 / 52 | 9 | 2 | 9 | 56 |
| Etiketter | 10 | 0.1 % | 20 | 10 / 10 | 10 | 1 | 10 | 24 |
| Landmärke: rådhuset | 5 | 0.1 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.1 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.1 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 975 | 12.3 % | 28,648 | 975 / 975 | 25 | 3 | 25 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/city, traffic on — 3,373 calls, 5,828,054 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 496 | 14.7 % | 269,531 | 496 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 222 | 6.6 % | 83,853 | 217 / 278 | 217 | 4 | 217 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 788 | 23.4 % | 1,842,628 | 788 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 947 | 28.1 % | 2,255,317 | 947 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.4 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 103 | 3.1 % | 23,355 | 103 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 7.2 % | 395,172 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 1 | 0.0 % | 51,698 | 1 / 1 | 1 | 1 | 1 | 24 |
| Fordon (bilar, lastbilar) | 125 | 3.7 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 5.7 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 43 | 0 | 0 | 0 | 56 |
| Etiketter | 21 | 0.6 % | 42 | 21 / 23 | 21 | 1 | 21 | 24 |
| Landmärke: rådhuset | 5 | 0.1 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.2 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.2 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 165 | 4.9 % | 22,141 | 165 / 975 | 24 | 3 | 24 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/kungsgatan, traffic on — 629 calls, 1,555,891 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 43 | 6.8 % | 43,888 | 43 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 52 | 8.3 % | 64,398 | 50 / 278 | 50 | 4 | 50 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 59 | 9.4 % | 153,416 | 59 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 94 | 14.9 % | 253,857 | 94 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 2.4 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 5 | 0.8 % | 1,977 | 5 / 324 | 1 | 1 | 1 | 325 |
| Träd | 10 | 1.6 % | 94,068 | 10 / 810 | 10 | 2 | 10 | 810 |
| Lyktstolpar och halos | 10 | 1.6 % | 85,440 | 10 / 11 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 125 | 19.9 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 30.4 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.5 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 43 | 0 | 0 | 0 | 56 |
| Etiketter | 2 | 0.3 % | 4 | 2 / 23 | 2 | 1 | 2 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 1.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 11 | 1.7 % | 17,852 | 11 / 975 | 8 | 2 | 8 | 976 |
| Himmel | 1 | 0.2 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/stromparken, traffic on — 2,548 calls, 4,019,190 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 379 | 14.9 % | 116,337 | 379 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 132 | 5.2 % | 83,659 | 127 / 278 | 127 | 4 | 127 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 600 | 23.5 % | 1,247,347 | 600 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 633 | 24.8 % | 1,297,638 | 633 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 35 | 1.4 % | 270,456 | 35 / 47 | 35 | 2 | 35 | 48 |
| Vatten | 97 | 3.8 % | 53,095 | 97 / 324 | 1 | 1 | 1 | 325 |
| Träd | 246 | 9.7 % | 244,512 | 246 / 810 | 246 | 2 | 246 | 810 |
| Lyktstolpar och halos | 12 | 0.5 % | 107,666 | 12 / 13 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 125 | 4.9 % | 327,520 | 125 / 125 | 9 | 2 | 6 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 7.5 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 43 | 1.7 % | 3,356 | 43 / 43 | 7 | 2 | 7 | 56 |
| Etiketter | 4 | 0.2 % | 8 | 4 / 23 | 4 | 1 | 4 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 39 | 1.5 % | 19,661 | 39 / 975 | 7 | 3 | 7 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/police, traffic on — 541 calls, 1,421,331 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 35 | 6.5 % | 34,083 | 35 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 22 | 4.1 % | 54,636 | 21 / 278 | 21 | 3 | 21 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 37 | 6.8 % | 95,144 | 37 / 2,034 | 1 | 1 | 1 | 2,036 |
| Vägar, vägmarkeringar och räls | 76 | 14.0 % | 201,641 | 76 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 2.8 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 4 | 0.7 % | 534 | 4 / 324 | 1 | 1 | 1 | 325 |
| Träd | 8 | 1.5 % | 88,128 | 8 / 810 | 8 | 2 | 8 | 810 |
| Lyktstolpar och halos | 13 | 2.4 % | 88,640 | 13 / 14 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 125 | 23.1 % | 327,520 | 125 / 125 | 9 | 2 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 35.3 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.6 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 43 | 0 | 0 | 0 | 56 |
| Etiketter | 1 | 0.2 % | 2 | 1 / 23 | 1 | 1 | 1 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 1.5 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 2 | 0.4 % | 17,532 | 2 / 975 | 2 | 1 | 2 | 976 |
| Himmel | 1 | 0.2 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/idrottsparkenPitch, traffic on — 2,876 calls, 4,538,918 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 435 | 15.1 % | 133,817 | 435 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 140 | 4.9 % | 83,685 | 135 / 278 | 135 | 4 | 135 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 729 | 25.3 % | 1,508,024 | 729 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 688 | 23.9 % | 1,441,450 | 688 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.6 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 139 | 4.8 % | 48,583 | 139 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 8.5 % | 276,912 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 14 | 0.5 % | 104,062 | 14 / 15 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 125 | 4.3 % | 327,520 | 125 / 125 | 9 | 2 | 6 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 191 | 6.6 % | 208,816 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 43 | 1.5 % | 3,356 | 43 / 43 | 7 | 2 | 7 | 56 |
| Etiketter | 9 | 0.3 % | 18 | 9 / 23 | 9 | 1 | 9 | 24 |
| Landmärke: rådhuset | 5 | 0.2 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 10 | 0.3 % | 55,822 | 10 / 10 | 10 | 4 | 10 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 45 | 1.6 % | 19,820 | 45 / 975 | 11 | 2 | 11 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/overview, traffic off — 7,547 calls, 9,648,686 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 1,246 | 16.5 % | 408,632 | 1,246 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 283 | 3.7 % | 86,941 | 278 / 278 | 278 | 4 | 278 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 1,992 | 26.4 % | 4,202,668 | 1,992 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 1,877 | 24.9 % | 3,725,824 | 1,877 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 0.6 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 310 | 4.1 % | 135,820 | 310 / 324 | 1 | 1 | 1 | 325 |
| Träd | 784 | 10.4 % | 712,152 | 784 / 810 | 784 | 2 | 784 | 810 |
| Lyktstolpar och halos | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.0 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 10 | 0.1 % | 20 | 10 / 10 | 10 | 1 | 10 | 24 |
| Landmärke: rådhuset | 5 | 0.1 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.1 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.1 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 975 | 12.9 % | 28,648 | 975 / 975 | 25 | 3 | 25 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/city, traffic off — 3,056 calls, 5,240,020 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 496 | 16.2 % | 269,531 | 496 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 222 | 7.3 % | 83,853 | 217 / 278 | 217 | 4 | 217 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 788 | 25.8 % | 1,842,628 | 788 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 947 | 31.0 % | 2,255,317 | 947 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.5 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 103 | 3.4 % | 23,355 | 103 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 8.0 % | 395,172 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 21 | 0.7 % | 42 | 21 / 23 | 21 | 1 | 21 | 24 |
| Landmärke: rådhuset | 5 | 0.2 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.2 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 165 | 5.4 % | 22,141 | 165 / 975 | 24 | 3 | 24 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/kungsgatan, traffic off — 312 calls, 967,857 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 43 | 13.8 % | 43,888 | 43 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 52 | 16.7 % | 64,398 | 50 / 278 | 50 | 4 | 50 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 59 | 18.9 % | 153,416 | 59 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 94 | 30.1 % | 253,857 | 94 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 4.8 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 5 | 1.6 % | 1,977 | 5 / 324 | 1 | 1 | 1 | 325 |
| Träd | 10 | 3.2 % | 94,068 | 10 / 810 | 10 | 2 | 10 | 810 |
| Lyktstolpar och halos | 9 | 2.9 % | 33,742 | 9 / 10 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 1.0 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 2 | 0.6 % | 4 | 2 / 23 | 2 | 1 | 2 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 2.6 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 11 | 3.5 % | 17,852 | 11 / 975 | 8 | 2 | 8 | 976 |
| Himmel | 1 | 0.3 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/stromparken, traffic off — 2,188 calls, 3,427,800 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 379 | 17.3 % | 116,337 | 379 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 132 | 6.0 % | 83,659 | 127 / 278 | 127 | 4 | 127 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 600 | 27.4 % | 1,247,347 | 600 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 633 | 28.9 % | 1,297,638 | 633 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 35 | 1.6 % | 270,456 | 35 / 47 | 35 | 2 | 35 | 48 |
| Vatten | 97 | 4.4 % | 53,095 | 97 / 324 | 1 | 1 | 1 | 325 |
| Träd | 246 | 11.2 % | 244,512 | 246 / 810 | 246 | 2 | 246 | 810 |
| Lyktstolpar och halos | 11 | 0.5 % | 55,968 | 11 / 12 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 4 | 0.2 % | 8 | 4 / 23 | 4 | 1 | 4 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 0.4 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 39 | 1.8 % | 19,661 | 39 / 975 | 7 | 3 | 7 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/police, traffic off — 224 calls, 833,297 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 35 | 15.6 % | 34,083 | 35 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 22 | 9.8 % | 54,636 | 21 / 278 | 21 | 3 | 21 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 37 | 16.5 % | 95,144 | 37 / 2,034 | 1 | 1 | 1 | 2,036 |
| Vägar, vägmarkeringar och räls | 76 | 33.9 % | 201,641 | 76 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 6.7 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 4 | 1.8 % | 534 | 4 / 324 | 1 | 1 | 1 | 325 |
| Träd | 8 | 3.6 % | 88,128 | 8 / 810 | 8 | 2 | 8 | 810 |
| Lyktstolpar och halos | 12 | 5.4 % | 36,942 | 12 / 13 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 1.3 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 1 | 0.4 % | 2 | 1 / 23 | 1 | 1 | 1 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 3.6 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 2 | 0.9 % | 17,532 | 2 / 975 | 2 | 1 | 2 | 976 |
| Himmel | 1 | 0.4 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## day/idrottsparkenPitch, traffic off — 2,516 calls, 3,947,528 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 435 | 17.3 % | 133,817 | 435 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 140 | 5.6 % | 83,685 | 135 / 278 | 135 | 4 | 135 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 729 | 29.0 % | 1,508,024 | 729 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 688 | 27.3 % | 1,441,450 | 688 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.9 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 139 | 5.5 % | 48,583 | 139 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 9.7 % | 276,912 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 13 | 0.5 % | 52,364 | 13 / 14 | 4 | 2 | 4 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 9 | 0.4 % | 18 | 9 / 23 | 9 | 1 | 9 | 24 |
| Landmärke: rådhuset | 5 | 0.2 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 10 | 0.4 % | 55,822 | 10 / 10 | 10 | 4 | 10 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 45 | 1.8 % | 19,820 | 45 / 975 | 11 | 2 | 11 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/overview, traffic off — 7,548 calls, 9,700,384 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 1,246 | 16.5 % | 408,632 | 1,246 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 283 | 3.7 % | 86,941 | 278 / 278 | 278 | 4 | 278 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 1,992 | 26.4 % | 4,202,668 | 1,992 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 1,877 | 24.9 % | 3,725,824 | 1,877 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 0.6 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 310 | 4.1 % | 135,820 | 310 / 324 | 1 | 1 | 1 | 325 |
| Träd | 784 | 10.4 % | 712,152 | 784 / 810 | 784 | 2 | 784 | 810 |
| Lyktstolpar och halos | 1 | 0.0 % | 51,698 | 1 / 1 | 1 | 1 | 1 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.0 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 10 | 0.1 % | 20 | 10 / 10 | 10 | 1 | 10 | 24 |
| Landmärke: rådhuset | 5 | 0.1 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.1 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.1 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 975 | 12.9 % | 28,648 | 975 / 975 | 25 | 3 | 25 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/city, traffic off — 3,057 calls, 5,291,718 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 496 | 16.2 % | 269,531 | 496 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 222 | 7.3 % | 83,853 | 217 / 278 | 217 | 4 | 217 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 788 | 25.8 % | 1,842,628 | 788 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 947 | 31.0 % | 2,255,317 | 947 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.5 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 103 | 3.4 % | 23,355 | 103 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 8.0 % | 395,172 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 1 | 0.0 % | 51,698 | 1 / 1 | 1 | 1 | 1 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 21 | 0.7 % | 42 | 21 / 23 | 21 | 1 | 21 | 24 |
| Landmärke: rådhuset | 5 | 0.2 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 6 | 0.2 % | 20,948 | 6 / 6 | 6 | 2 | 6 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 165 | 5.4 % | 22,141 | 165 / 975 | 24 | 3 | 24 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/kungsgatan, traffic off — 313 calls, 1,019,555 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 43 | 13.7 % | 43,888 | 43 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 52 | 16.6 % | 64,398 | 50 / 278 | 50 | 4 | 50 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 59 | 18.8 % | 153,416 | 59 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 94 | 30.0 % | 253,857 | 94 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 4.8 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 5 | 1.6 % | 1,977 | 5 / 324 | 1 | 1 | 1 | 325 |
| Träd | 10 | 3.2 % | 94,068 | 10 / 810 | 10 | 2 | 10 | 810 |
| Lyktstolpar och halos | 10 | 3.2 % | 85,440 | 10 / 11 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 1.0 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 2 | 0.6 % | 4 | 2 / 23 | 2 | 1 | 2 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 2.6 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 11 | 3.5 % | 17,852 | 11 / 975 | 8 | 2 | 8 | 976 |
| Himmel | 1 | 0.3 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/stromparken, traffic off — 2,189 calls, 3,479,498 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 379 | 17.3 % | 116,337 | 379 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 132 | 6.0 % | 83,659 | 127 / 278 | 127 | 4 | 127 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 600 | 27.4 % | 1,247,347 | 600 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 633 | 28.9 % | 1,297,638 | 633 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 35 | 1.6 % | 270,456 | 35 / 47 | 35 | 2 | 35 | 48 |
| Vatten | 97 | 4.4 % | 53,095 | 97 / 324 | 1 | 1 | 1 | 325 |
| Träd | 246 | 11.2 % | 244,512 | 246 / 810 | 246 | 2 | 246 | 810 |
| Lyktstolpar och halos | 12 | 0.5 % | 107,666 | 12 / 13 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 4 | 0.2 % | 8 | 4 / 23 | 4 | 1 | 4 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 0.4 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 39 | 1.8 % | 19,661 | 39 / 975 | 7 | 3 | 7 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/police, traffic off — 225 calls, 884,995 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 35 | 15.6 % | 34,083 | 35 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 22 | 9.8 % | 54,636 | 21 / 278 | 21 | 3 | 21 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 37 | 16.4 % | 95,144 | 37 / 2,034 | 1 | 1 | 1 | 2,036 |
| Vägar, vägmarkeringar och räls | 76 | 33.8 % | 201,641 | 76 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 15 | 6.7 % | 265,536 | 15 / 47 | 15 | 1 | 15 | 48 |
| Vatten | 4 | 1.8 % | 534 | 4 / 324 | 1 | 1 | 1 | 325 |
| Träd | 8 | 3.6 % | 88,128 | 8 / 810 | 8 | 2 | 8 | 810 |
| Lyktstolpar och halos | 13 | 5.8 % | 88,640 | 13 / 14 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 1.3 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 1 | 0.4 % | 2 | 1 / 23 | 1 | 1 | 1 | 24 |
| Landmärke: rådhuset | 0 | 0.0 % | 0 | 0 / 5 | 0 | 0 | 0 | 6 |
| Landmärke: polistornet | 8 | 3.6 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 0 | 0.0 % | 0 | 0 / 10 | 0 | 0 | 0 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 2 | 0.9 % | 17,532 | 2 / 975 | 2 | 1 | 2 | 976 |
| Himmel | 1 | 0.4 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |

## night/idrottsparkenPitch, traffic off — 2,517 calls, 3,999,226 triangles, 20 programs

| Part | Calls | Share | Triangles | Drawn / visible | Materials | Programs | Material switches | Scene nodes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Byggnader (OSM-väggar, tak, gesimser) | 435 | 17.3 % | 133,817 | 435 / 1,273 | 3 | 2 | 3 | 1,277 |
| Byggnader, detaljmodeller (kajfasader, stationen, hallar) | 140 | 5.6 % | 83,685 | 135 / 278 | 135 | 4 | 135 | 280 |
| Mark/terräng (mark, gräs, strandkanter) | 729 | 29.0 % | 1,508,024 | 729 / 2,034 | 2 | 2 | 2 | 2,036 |
| Vägar, vägmarkeringar och räls | 688 | 27.3 % | 1,441,450 | 688 / 1,906 | 2 | 1 | 2 | 1,908 |
| Broar | 47 | 1.9 % | 286,152 | 47 / 47 | 47 | 2 | 47 | 48 |
| Vatten | 139 | 5.5 % | 48,583 | 139 / 324 | 1 | 1 | 1 | 325 |
| Träd | 244 | 9.7 % | 276,912 | 244 / 810 | 244 | 2 | 244 | 810 |
| Lyktstolpar och halos | 14 | 0.6 % | 104,062 | 14 / 15 | 5 | 3 | 5 | 24 |
| Fordon (bilar, lastbilar) | 0 | 0.0 % | 0 | 125 / 125 | 9 | 1 | 9 | 126 |
| Kollektivtrafik (bussar, spårvagnar, tåg) | 0 | 0.0 % | 0 | 191 / 191 | 22 | 3 | 22 | 192 |
| Trafiksignaler | 3 | 0.1 % | 37,584 | 3 / 3 | 3 | 2 | 3 | 4 |
| Flygtrafik | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 56 |
| Etiketter | 9 | 0.4 % | 18 | 9 / 23 | 9 | 1 | 9 | 24 |
| Landmärke: rådhuset | 5 | 0.2 % | 1,762 | 5 / 5 | 5 | 2 | 5 | 6 |
| Landmärke: polistornet | 8 | 0.3 % | 575 | 7 / 7 | 8 | 2 | 8 | 8 |
| Landmärke: stadion | 10 | 0.4 % | 55,822 | 10 / 10 | 10 | 4 | 10 | 12 |
| Kartdetaljer (flygfältet, polishusets flyglar, solpaneler m.m.) | 45 | 1.8 % | 19,820 | 45 / 975 | 11 | 2 | 11 | 976 |
| Himmel | 1 | 0.0 % | 960 | 1 / 1 | 1 | 1 | 1 | 1 |
| Övrigt | 0 | 0.0 % | 0 | 0 / 0 | 0 | 0 | 0 | 5 |
