/** Curated Southern Oregon public / semi-public courses for Golf Date planner. */

export type GolfCourseHoles = '9' | '18' | 'both';
export type GolfCourseDifficulty = 'easy' | 'moderate' | 'challenging';
export type GolfCourseArea = 'Medford' | 'Ashland' | 'Grants Pass';

export type MedfordGolfCourse = {
  id: string;
  name: string;
  city: string;
  /** Region chip in the planner (city stays specific on the card). */
  area: GolfCourseArea;
  holes: GolfCourseHoles;
  difficulty: GolfCourseDifficulty;
  bestForFirstDate: boolean;
  bookingUrl: string;
  note: string;
  phone?: string;
};

const FIRST_DATE_NOTE = '9 holes recommended for first dates.';

export const MEDFORD_GOLF_COURSES: readonly MedfordGolfCourse[] = [
  {
    id: 'centennial',
    name: 'Centennial Golf Club',
    city: 'Medford, OR',
    area: 'Medford',
    holes: '18',
    difficulty: 'challenging',
    bestForFirstDate: false,
    bookingUrl: 'https://centennialgolfclub.com/-tee-times',
    note: FIRST_DATE_NOTE,
    phone: '541-773-4653',
  },
  {
    id: 'stewart-meadows',
    name: 'Stewart Meadows Golf Course',
    city: 'Medford, OR',
    area: 'Medford',
    holes: '9',
    difficulty: 'easy',
    bestForFirstDate: true,
    bookingUrl: 'https://www.chronogolf.com/club/stewart-meadows-golf-course',
    note: FIRST_DATE_NOTE,
    phone: '541-770-6554',
  },
  {
    id: 'quail-point',
    name: 'Quail Point Golf Course',
    city: 'Medford, OR',
    area: 'Medford',
    holes: '18',
    difficulty: 'moderate',
    bestForFirstDate: true,
    bookingUrl: 'https://www.quailpointgolf.com/',
    note: FIRST_DATE_NOTE,
    phone: '541-857-7000',
  },
  {
    id: 'bear-creek',
    name: 'Bear Creek Golf Center',
    city: 'Medford, OR',
    area: 'Medford',
    holes: '9',
    difficulty: 'easy',
    bestForFirstDate: true,
    bookingUrl: 'https://www.golfbearcreek.com/',
    note: FIRST_DATE_NOTE,
  },
  {
    id: 'laurel-hill',
    name: 'Laurel Hill Golf Club',
    city: 'Central Point, OR',
    area: 'Medford',
    holes: '9',
    difficulty: 'easy',
    bestForFirstDate: true,
    bookingUrl: 'https://foreupsoftware.com/index.php/booking/index/3742#teetimes',
    note: FIRST_DATE_NOTE,
    phone: '541-855-7965',
  },
  {
    id: 'eagle-point',
    name: 'The Resort at Eagle Point',
    city: 'Eagle Point, OR',
    area: 'Medford',
    holes: '18',
    difficulty: 'challenging',
    bestForFirstDate: false,
    bookingUrl: 'https://eaglepointgolf.com/',
    note: FIRST_DATE_NOTE,
    phone: '541-826-8225',
  },
  {
    id: 'oak-knoll',
    name: 'Oak Knoll Golf Course',
    city: 'Ashland, OR',
    area: 'Ashland',
    holes: '9',
    difficulty: 'moderate',
    bestForFirstDate: true,
    bookingUrl: 'https://oak-knoll-golf-course-ashland.book.teeitup.com/',
    note: FIRST_DATE_NOTE,
    phone: '541-482-4311',
  },
  {
    id: 'dutcher-creek',
    name: 'Dutcher Creek Golf Course',
    city: 'Grants Pass, OR',
    area: 'Grants Pass',
    holes: '18',
    difficulty: 'moderate',
    bestForFirstDate: true,
    bookingUrl: 'https://dutchercreek.com/',
    note: 'Call the pro shop to book · 9 holes recommended for first dates.',
    phone: '541-474-2188',
  },
  {
    id: 'grants-pass-gc',
    name: 'Grants Pass Golf Club',
    city: 'Grants Pass, OR',
    area: 'Grants Pass',
    holes: '18',
    difficulty: 'challenging',
    bestForFirstDate: false,
    bookingUrl: 'https://www.chronogolf.com/club/grants-pass-golf-club',
    note: FIRST_DATE_NOTE,
    phone: '541-476-0849',
  },
] as const;

export function getMedfordGolfCourse(id: string): MedfordGolfCourse | undefined {
  return MEDFORD_GOLF_COURSES.find((c) => c.id === id);
}
