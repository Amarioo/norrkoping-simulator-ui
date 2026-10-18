"""SWEREF 99 TM (EPSG:3006) Gauss-Krüger projection, Lantmäteriet's Krüger series (GRS80).
Mirrors src/lib/geo/sweref99tm.js and TerrainService.kt; kept dependency-free for cross-checks."""
import math

A = 6378137.0
F = 1 / 298.257222101
LON0 = 15.0
K0 = 0.9996
FN = 0.0
FE = 500000.0
E2 = F * (2 - F)
N_ = F / (2 - F)
AROOF = A / (1 + N_) * (1 + N_ ** 2 / 4 + N_ ** 4 / 64)
_A = E2
_B = (5 * E2 ** 2 - E2 ** 3) / 6
_C = (104 * E2 ** 3 - 45 * E2 ** 4) / 120
_D = 1237 * E2 ** 4 / 1260
BETA = [N_ / 2 - 2 * N_ ** 2 / 3 + 5 * N_ ** 3 / 16 + 41 * N_ ** 4 / 180,
        13 * N_ ** 2 / 48 - 3 * N_ ** 3 / 5 + 557 * N_ ** 4 / 1440,
        61 * N_ ** 3 / 240 - 103 * N_ ** 4 / 140,
        49561 * N_ ** 4 / 161280]
DELTA = [N_ / 2 - 2 * N_ ** 2 / 3 + 37 * N_ ** 3 / 96 - N_ ** 4 / 360,
         N_ ** 2 / 48 + N_ ** 3 / 15 - 437 * N_ ** 4 / 1440,
         17 * N_ ** 3 / 480 - 37 * N_ ** 4 / 840,
         4397 * N_ ** 4 / 161280]
_AS = E2 + E2 ** 2 + E2 ** 3 + E2 ** 4
_BS = -(7 * E2 ** 2 + 17 * E2 ** 3 + 30 * E2 ** 4) / 6
_CS = (224 * E2 ** 3 + 889 * E2 ** 4) / 120
_DS = -4279 * E2 ** 4 / 1260


def forward(lat, lon):
    """Geodetic SWEREF 99 degrees -> (E, N) metres."""
    phi = math.radians(lat)
    dl = math.radians(lon - LON0)
    s = math.sin(phi)
    phis = phi - s * math.cos(phi) * (_A + _B * s ** 2 + _C * s ** 4 + _D * s ** 6)
    xi = math.atan2(math.tan(phis), math.cos(dl))
    eta = math.atanh(math.cos(phis) * math.sin(dl))
    x = xi + sum(b * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, b in enumerate(BETA, 1))
    y = eta + sum(b * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, b in enumerate(BETA, 1))
    return K0 * AROOF * y + FE, K0 * AROOF * x + FN


def inverse(N, E):
    """(N, E) metres -> geodetic SWEREF 99 (lat, lon) degrees."""
    xi = (N - FN) / (K0 * AROOF)
    eta = (E - FE) / (K0 * AROOF)
    xip = xi - sum(d * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, d in enumerate(DELTA, 1))
    etap = eta - sum(d * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, d in enumerate(DELTA, 1))
    phis = math.asin(math.sin(xip) / math.cosh(etap))
    dl = math.atan(math.sinh(etap) / math.cos(xip))
    s = math.sin(phis)
    phi = phis + s * math.cos(phis) * (_AS + _BS * s ** 2 + _CS * s ** 4 + _DS * s ** 6)
    return math.degrees(phi), LON0 + math.degrees(dl)


def scale_and_convergence(lat, lon, h=1e-4):
    """Point scale factor and meridian convergence (degrees, grid north -> true north positive east)
    from central differences of forward()."""
    e0, n0 = forward(lat - h, lon); e1, n1 = forward(lat + h, lon)
    _, _, _ = 0, 0, 0
    phi = math.radians(lat)
    # Meridional arc length per degree latitude on GRS80.
    m = A * (1 - E2) / (1 - E2 * math.sin(phi) ** 2) ** 1.5 * math.radians(2 * h)
    k = math.hypot(e1 - e0, n1 - n0) / m
    gamma = math.degrees(math.atan2(e1 - e0, n1 - n0))
    return k, gamma
