type DatePlanLaneId = 'coffee' | 'meal' | 'walk' | 'games' | 'culture' | 'market' | 'dessert';

export type CuratedVenueResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  place_id?: string;
  types?: string[];
  businessStatus?: string;
};

type CuratedVenue = CuratedVenueResult & { laneIds: DatePlanLaneId[] };

/** Verified local spots used when Google Places / geocoding are unavailable. */
const CURATED_VENUES: CuratedVenue[] = [
  {
    laneIds: ['coffee'],
    name: 'Origin Coffee Roasters',
    address: 'Medford, OR',
    lat: 42.3312,
    lng: -122.8721,
    types: ['cafe', 'food'],
  },
  {
    laneIds: ['coffee'],
    name: 'Mellelo Coffee Roasters',
    address: 'Medford, OR',
    lat: 42.3248,
    lng: -122.8675,
    types: ['cafe', 'food'],
  },
  {
    laneIds: ['coffee'],
    name: 'Corinthian Coffee House',
    address: 'Medford, OR',
    lat: 42.3269,
    lng: -122.8714,
    types: ['cafe', 'food'],
  },
  {
    laneIds: ['walk'],
    name: 'Bear Creek Park',
    address: 'Medford, OR',
    lat: 42.3186,
    lng: -122.8489,
    types: ['park'],
  },
  {
    laneIds: ['walk'],
    name: 'Lithia Park',
    address: 'Ashland, OR',
    lat: 42.1949,
    lng: -122.7092,
    types: ['park'],
  },
  {
    laneIds: ['walk'],
    name: 'Pacifica: A Garden in the Siskiyous',
    address: 'Ashland, OR',
    lat: 42.1684,
    lng: -122.6551,
    types: ['park', 'tourist_attraction'],
  },
  {
    laneIds: ['walk'],
    name: 'Prescott Park Trail',
    address: 'East Medford, OR',
    lat: 42.3412,
    lng: -122.8124,
    types: ['park'],
  },
  {
    laneIds: ['walk'],
    name: 'Roxy Ann Peak Overlook',
    address: 'Central Point, OR',
    lat: 42.3551,
    lng: -122.8918,
    types: ['park', 'tourist_attraction'],
  },
  {
    laneIds: ['meal'],
    name: 'The Lark',
    address: 'Medford, OR',
    lat: 42.3262,
    lng: -122.8719,
    types: ['restaurant', 'food'],
  },
  {
    laneIds: ['meal'],
    name: 'Jefferson Grapevine',
    address: 'Medford, OR',
    lat: 42.3271,
    lng: -122.8728,
    types: ['restaurant', 'bar', 'food'],
  },
  {
    laneIds: ['meal'],
    name: 'Pomodori Osteria',
    address: '410 E Main St, Medford, OR',
    lat: 42.3265,
    lng: -122.8698,
    types: ['restaurant', 'food'],
  },
  {
    laneIds: ['dessert'],
    name: 'Rogue Creamery',
    address: 'Central Point, OR',
    lat: 42.3764,
    lng: -122.9163,
    types: ['bakery', 'food'],
  },
  {
    laneIds: ['dessert'],
    name: 'Mix Bakeshop',
    address: '57 N Main St, Ashland, OR',
    lat: 42.1972,
    lng: -122.7145,
    types: ['bakery', 'cafe', 'food'],
  },
  {
    laneIds: ['dessert'],
    name: 'Petite à Grace Croissant Cafe',
    address: '36 S Central Ave, Medford, OR',
    lat: 42.3254,
    lng: -122.8722,
    types: ['bakery', 'cafe', 'food'],
  },
  {
    laneIds: ['games'],
    name: 'The Game Table',
    address: 'Medford, OR',
    lat: 42.3291,
    lng: -122.8684,
    types: ['store', 'establishment'],
  },
  {
    laneIds: ['games'],
    name: 'Game Night Deli',
    address: '1390 Biddle Rd, Medford, OR',
    lat: 42.3518,
    lng: -122.8512,
    types: ['restaurant', 'store'],
  },
  {
    laneIds: ['games'],
    name: 'Astral Games',
    address: '125 S Central Ave, Medford, OR',
    lat: 42.3251,
    lng: -122.8716,
    types: ['store', 'establishment'],
  },
  {
    laneIds: ['games'],
    name: 'Bear Creek Golf Center',
    address: 'Medford, OR',
    lat: 42.3124,
    lng: -122.8356,
    types: ['golf_course', 'point_of_interest'],
  },
  {
    laneIds: ['culture'],
    name: 'Rogue Gallery',
    address: 'Medford, OR',
    lat: 42.3267,
    lng: -122.8711,
    types: ['art_gallery', 'museum'],
  },
  {
    laneIds: ['culture'],
    name: 'The Annex Clay & Culinary Studio',
    address: 'Medford, OR',
    lat: 42.3284,
    lng: -122.8702,
    types: ['art_gallery', 'point_of_interest'],
  },
  {
    laneIds: ['culture'],
    name: 'Schneider Museum of Art',
    address: 'Ashland, OR',
    lat: 42.1889,
    lng: -122.6951,
    types: ['museum', 'art_gallery'],
  },
  {
    laneIds: ['culture'],
    name: 'Bloomsbury Books',
    address: 'Ashland, OR',
    lat: 42.1968,
    lng: -122.7128,
    types: ['book_store', 'store'],
  },
  {
    laneIds: ['culture'],
    name: 'The Talent Club',
    address: '114 Talent Ave, Talent, OR',
    lat: 42.2457,
    lng: -122.7886,
    types: ['bar', 'night_club', 'point_of_interest'],
  },
  {
    laneIds: ['market'],
    name: 'Rogue Valley Growers Market',
    address: 'Medford, OR',
    lat: 42.3265,
    lng: -122.8756,
    types: ['food', 'point_of_interest'],
  },
  {
    laneIds: ['market'],
    name: 'Ashland Saturday Market',
    address: 'Ashland, OR',
    lat: 42.1962,
    lng: -122.7134,
    types: ['food', 'point_of_interest'],
  },
  {
    laneIds: ['market'],
    name: 'The Commons Food Hall',
    address: 'Medford, OR',
    lat: 42.3278,
    lng: -122.8735,
    types: ['food', 'restaurant'],
  },
];

export function getCuratedSouthernOregonVenues(laneId: DatePlanLaneId): CuratedVenueResult[] {
  return CURATED_VENUES.filter((venue) => venue.laneIds.includes(laneId)).map(
    ({ laneIds: _laneIds, ...venue }) => venue,
  );
}
