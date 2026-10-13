export interface Course {
  id: string;
  name: string;
  region: string;
  created_at?: string;
}

export interface Tee {
  id: string;
  course_id: string;
  name: string;
  color_hex?: string;
  course_rating: number;
  slope_rating: number;
  gender?: string;
}

export interface Hole {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  handicap_index: number;
}

export interface HoleDistance {
  id: string;
  hole_id: string;
  tee_id: string;
  distance_meters: number;
}

export interface Session {
  id: string;
  access_code: string;
  course_id: string;
  play_date: string;
  created_at?: string;
}

export interface Player {
  id: string;
  session_id: string;
  name: string;
  tee_id: string;
  created_at?: string;
}

export interface Score {
  id: string;
  player_id: string;
  hole_id: string;
  strokes: number;
  updated_at?: string;
}