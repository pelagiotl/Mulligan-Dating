/** Curated Medford-area public / semi-public courses for Golf Date planner. */

export type GolfCourseHoles = '9' | '18' | 'both';
export type GolfCourseDifficulty = 'easy' | 'moderate' | 'challenging';

export type MedfordGolfCourse = {
  id: string;
  name: string;
  city: string;
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
    holes: '9',
    difficulty: 'easy',
    bestForFirstDate: true,
    bookingUrl: 'https://www.golfbearcreek.com/',
    note: FIRST_DATE_NOTE,
  },
  {
    id: 'laurel-hill',
    name: 'Laurel Hill Golf Club',
    city: 'Medford / Phoenix, OR',
    holes: '9',
    difficulty: 'easy',
    bestForFirstDate: true,
    bookingUrl: 'https://www.laurelhillgc.com/',
    note: FIRST_DATE_NOTE,
  },
  {
    id: 'eagle-point',
    name: 'The Resort at Eagle Point',
    city: 'Eagle Point, OR',
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
    holes: '9',
    difficulty: 'moderate',
    bestForFirstDate: true,
    bookingUrl: 'https://www.oakknollgolf.com/',
    note: FIRST_DATE_NOTE,
  },
] as const;

export function getMedfordGolfCourse(id: string): MedfordGolfCourse | undefined {
  return MEDFORD_GOLF_COURSES.find((c) => c.id === id);
}
