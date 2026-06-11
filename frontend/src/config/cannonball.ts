// Cannonball Run route — edit these waypoints to taste.
//
// Classic route: Red Ball Garage (Manhattan) → Portofino Hotel (Redondo Beach, CA),
// roughly following I-78 → I-76 → I-70 → I-44 → I-40 → I-15 → I-10.
// Each waypoint is [longitude, latitude].

export type Waypoint = {
  name: string;
  coord: [number, number];
};

export const CANNONBALL_WAYPOINTS: Waypoint[] = [
  { name: "Red Ball Garage, NYC",       coord: [-73.9857, 40.7484] },
  { name: "Newark, NJ",                 coord: [-74.1724, 40.7357] },
  { name: "Allentown, PA",              coord: [-75.4902, 40.6023] },
  { name: "Harrisburg, PA",             coord: [-76.8867, 40.2732] },
  { name: "Pittsburgh, PA",             coord: [-79.9959, 40.4406] },
  { name: "Columbus, OH",               coord: [-82.9988, 39.9612] },
  { name: "Indianapolis, IN",           coord: [-86.1581, 39.7684] },
  { name: "St. Louis, MO",              coord: [-90.1994, 38.6270] },
  { name: "Springfield, MO",            coord: [-93.2982, 37.2090] },
  { name: "Tulsa, OK",                  coord: [-95.9928, 36.1540] },
  { name: "Oklahoma City, OK",          coord: [-97.5164, 35.4676] },
  { name: "Amarillo, TX",               coord: [-101.8313, 35.2220] },
  { name: "Albuquerque, NM",            coord: [-106.6504, 35.0844] },
  { name: "Flagstaff, AZ",              coord: [-111.6513, 35.1983] },
  { name: "Kingman, AZ",                coord: [-114.0530, 35.1894] },
  { name: "Barstow, CA",                coord: [-117.0173, 34.8958] },
  { name: "Portofino Hotel, Redondo",   coord: [-118.3942, 33.8417] },
];

export const ROUTE_NAME = "Cannonball Run";
