import json, math, numpy as np
from pyproj import Geod, Transformer
o_lat, o_lon, mlon, mlat, U = 58.58981, 16.18747, 58010, 111133, 25
g = Geod(ellps='GRS80')
# True metres per degree at origin
_,_,dlon = g.inv(o_lon-0.0005, o_lat, o_lon+0.0005, o_lat); true_mlon = dlon/0.001
_,_,dlat = g.inv(o_lon, o_lat-0.0005, o_lon, o_lat+0.0005); true_mlat = dlat/0.001
print(f"metres/deg lon: used {mlon}, true {true_mlon:.1f}, scale error {(mlon/true_mlon-1)*100:+.3f}%")
print(f"metres/deg lat: used {mlat}, true {true_mlat:.1f}, scale error {(mlat/true_mlat-1)*100:+.3f}%")
# Scene position of points vs true geodesic offset from origin
bbox = [58.555, 16.065, 58.65, 16.295]
tm = Transformer.from_crs(4326, 3006, always_xy=True)
oE, oN = tm.transform(o_lon, o_lat)
def scene(lat, lon): return ((lon-o_lon)*mlon, (o_lat-lat)*mlat)  # metres, x east, z south
worst = 0; rows=[]
for lat in np.linspace(bbox[0], bbox[2], 21):
  for lon in np.linspace(bbox[1], bbox[3], 21):
    x, z = scene(lat, lon)
    az, _, d = g.inv(o_lon, o_lat, lon, lat)
    tx, tz = d*math.sin(math.radians(az)), -d*math.cos(math.radians(az))
    err = math.hypot(x-tx, z-tz); worst = max(worst, err)
    rows.append(err)
print(f"scene vs geodesic position from origin over map bbox: mean {np.mean(rows):.1f} m, max {worst:.1f} m")
# local distance scale distortion at corners (E-W and N-S 100 m baselines)
for name,(lat,lon) in {'origin':(o_lat,o_lon),'N edge':(58.65,o_lon),'S edge':(58.555,o_lon),'Industrilandskapet':(58.5878,16.1745)}.items():
  _,_,dE = g.inv(lon, lat, lon+0.001, lat); _,_,dN = g.inv(lon,lat,lon,lat+0.001)
  print(f"  {name}: E-W scene/true {mlon*0.001/dE:.5f}, N-S scene/true {mlat*0.001/dN:.5f}")
# Grid north vs true north in SWEREF (meridian convergence) - irrelevant for scene (scene is geographic), but report
print("SWEREF99TM origin E/N:", round(oE,2), round(oN,2))
