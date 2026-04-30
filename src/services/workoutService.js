// src/services/workoutService.js
import { EXERCISES, GIF_MAP } from '../data/workouts';

// Safely resolve a gifKey to a bundled asset
export const getGif = (gifKey) => {
  if (!gifKey) return null;
  return GIF_MAP[gifKey] || null;
};

// Deterministic shuffle — same seed = same order per day
const shuffleWithSeed = (array, seed) => {
  const arr = [...array];
  let currentIndex = arr.length;
  const seededRandom = () => {
    let x = Math.sin(seed + currentIndex) * 10000;
    return x - Math.floor(x);
  };
  while (currentIndex !== 0) {
    const randomIndex = Math.floor(seededRandom() * currentIndex);
    currentIndex--;
    [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
  }
  return arr;
};

export const generateDailyWorkouts = () => {
  const today = new Date();
  const seed = today.getFullYear() + today.getMonth() + today.getDate();

  // Filter by category
  const cardio      = EXERCISES.filter(e => e.category === 'cardio');
  const core        = EXERCISES.filter(e => e.category === 'core');
  const upper       = EXERCISES.filter(e => e.category === 'upper');
  const lower       = EXERCISES.filter(e => e.category === 'lower');
  const flexibility = EXERCISES.filter(e => e.category === 'flexibility');

  const routines = [];

  // ── HIIT ─────────────────────────────────────────────────
  routines.push({
    id: `w_hiit_${seed}`,
    title: 'Dorm HIIT Burn',
    category: 'HIIT',
    duration: '15 min',
    cal: '150',
    level: 'Intermediate',
    smallSpace: true,
    gifKey: 'hiit_cover',
    tags: ['sweat', 'silent'],
    exercises: shuffleWithSeed([...cardio, ...lower], seed).slice(0, 4),
  });

  // ── CORE ─────────────────────────────────────────────────
  routines.push({
    id: `w_core_${seed}`,
    title: 'Silent Desk Core',
    category: 'Core',
    duration: '10 min',
    cal: '80',
    level: 'All Levels',
    smallSpace: true,
    gifKey: 'core_cover',
    tags: ['abs', 'mat'],
    exercises: shuffleWithSeed([...core], seed).slice(0, 4),
  });

  // ── STRENGTH ─────────────────────────────────────────────
  routines.push({
    id: `w_str_${seed}`,
    title: 'Full Body Strength',
    category: 'Strength',
    duration: '20 min',
    cal: '180',
    level: 'Advanced',
    smallSpace: true,
    gifKey: 'strength_cover',
    tags: ['muscle', 'bodyweight'],
    exercises: shuffleWithSeed([...upper, ...lower], seed).slice(0, 4),
  });

  // ── MICRO ────────────────────────────────────────────────
  routines.push({
    id: `w_mic_${seed}`,
    title: '5-Min Study Break',
    category: 'Micro',
    duration: '5 min',
    cal: '40',
    level: 'Beginner',
    smallSpace: true,
    gifKey: 'micro_cover',
    tags: ['quick', 'energy'],
    // Mix of flexibility + light core for a quick break
    exercises: shuffleWithSeed([...flexibility, ...core], seed).slice(0, 3),
  });

  // ── CARDIO ───────────────────────────────────────────────
  routines.push({
    id: `w_car_${seed}`,
    title: 'Endurance Builder',
    category: 'Cardio',
    duration: '12 min',
    cal: '110',
    level: 'Intermediate',
    smallSpace: true,
    gifKey: 'cardio_cover',
    tags: ['heart', 'stamina'],
    exercises: shuffleWithSeed([...cardio], seed).slice(0, 3),
  });

  return routines;
};