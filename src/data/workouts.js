// src/data/workouts.js

export const GIF_MAP = {
  // Exercise GIFs
  cat_cow_stretch:           require('../../assets/workouts/cat_cow_stretch.gif'),
  mountain_climber:          require('../../assets/workouts/mountain_climber.gif'),
  air_bike_crunches:         require('../../assets/workouts/air_bike_crunches.gif'),
  flutter_kicks:             require('../../assets/workouts/flutter_kicks.gif'),
  glute_bridge:              require('../../assets/workouts/glute_bridge.gif'),
  bird_dog:                  require('../../assets/workouts/bird_dog.gif'),
  burpees:                   require('../../assets/workouts/burpees.gif'),
  step_ups:                  require('../../assets/workouts/step_ups.gif'),
  bench_dips:                require('../../assets/workouts/bench_dips.gif'),
  side_lunges_floor_tap:     require('../../assets/workouts/side_lunges_floor_tap.gif'),
  lunge:                     require('../../assets/workouts/lunge.gif'),
  alternating_toe_with_taps: require('../../assets/workouts/alternating_toe_with_taps.gif'),
  bicycle_kicks:             require('../../assets/workouts/bicycle_kicks.gif'),
  leg_raises:                require('../../assets/workouts/leg_raises.gif'),
  dead_bug:                  require('../../assets/workouts/dead_bug.gif'),
  ninety_degree_crunch:      require('../../assets/workouts/90_degree_crunch.gif'),
  jumping_jacks:             require('../../assets/workouts/jumping_jacks.gif'),
  in_and_outs:               require('../../assets/workouts/in_and_outs.gif'),
  plank_with_elbow_lift:     require('../../assets/workouts/plank_with_elbow_lift.gif'),
  rotating_toe_touches:      require('../../assets/workouts/rotating_toe_touches.gif'),
  prone_back_extension:      require('../../assets/workouts/prone_back_extension.gif'),
  push_ups:                  require('../../assets/workouts/push_ups.gif'),
  run_in_place:              require('../../assets/workouts/run_in_place.gif'),
  standing_toe_touch:        require('../../assets/workouts/standing_toe_touch.gif'),

  // Routine card cover GIFs
  hiit_cover:     require('../../assets/workouts/burpees.gif'),
  core_cover:     require('../../assets/workouts/air_bike_crunches.gif'),
  strength_cover: require('../../assets/workouts/push_ups.gif'),
  micro_cover:    require('../../assets/workouts/cat_cow_stretch.gif'),
  cardio_cover:   require('../../assets/workouts/run_in_place.gif'),
};

export const EXERCISES = [
  // ── CARDIO ────────────────────────────────────────────────
  {
    id: 'e1',
    title: 'Mountain Climber',
    category: 'cardio',
    target: 'Full Body',
    type: 'time',
    value: 45,
    gifKey: 'mountain_climber',
    instructions: 'Start in a high plank position. Drive your knees to your chest alternately in a running motion. Keep your hips level and core tight throughout.'
  },
  {
    id: 'e2',
    title: 'Burpees',
    category: 'cardio',
    target: 'Full Body',
    type: 'reps',
    value: 10,
    gifKey: 'burpees',
    instructions: 'From standing, drop your hands to the floor, jump your feet back to a plank, do a push-up, jump your feet forward, then explosively jump up with arms overhead.'
  },
  {
    id: 'e3',
    title: 'Jumping Jacks',
    category: 'cardio',
    target: 'Full Body',
    type: 'time',
    value: 45,
    gifKey: 'jumping_jacks',
    instructions: 'Stand with feet together and arms at sides. Jump your feet out wide while raising your arms overhead, then return to the starting position.'
  },
  {
    id: 'e4',
    title: 'Run in Place',
    category: 'cardio',
    target: 'Legs & Cardio',
    type: 'time',
    value: 60,
    gifKey: 'run_in_place',
    instructions: 'Run on the spot, lifting your knees to hip height with each step. Pump your arms naturally and stay light on your feet.'
  },

  // ── CORE ──────────────────────────────────────────────────
  {
    id: 'e5',
    title: 'Air Bike Crunches',
    category: 'core',
    target: 'Obliques & Abs',
    type: 'time',
    value: 40,
    gifKey: 'air_bike_crunches',
    instructions: 'Lie on your back with hands behind your head. Bring opposite elbow to opposite knee in a cycling motion. Keep your lower back pressed to the floor.'
  },
  {
    id: 'e6',
    title: 'Flutter Kicks',
    category: 'core',
    target: 'Lower Abs',
    type: 'time',
    value: 40,
    gifKey: 'flutter_kicks',
    instructions: 'Lie flat on your back with legs straight. Lift both legs slightly off the ground and alternate kicking them up and down in small rapid movements.'
  },
  {
    id: 'e7',
    title: 'Bird Dog',
    category: 'core',
    target: 'Lower Back & Core',
    type: 'reps',
    value: 16,
    gifKey: 'bird_dog',
    instructions: 'Get on all fours. Extend your opposite arm and leg simultaneously, hold for one second, then switch sides. Keep your back flat throughout.'
  },
  {
    id: 'e8',
    title: 'Alternating Toe Taps',
    category: 'core',
    target: 'Abs',
    type: 'time',
    value: 40,
    gifKey: 'alternating_toe_with_taps',
    instructions: 'Lie on your back with legs raised to 90 degrees. Reach one hand up to tap the opposite foot, alternating sides in a controlled motion.'
  },
  {
    id: 'e9',
    title: 'Bicycle Kicks',
    category: 'core',
    target: 'Abs & Obliques',
    type: 'time',
    value: 40,
    gifKey: 'bicycle_kicks',
    instructions: 'Lie on your back with legs raised. Pedal your legs in a bicycle motion while keeping your core engaged and lower back pressed to the floor.'
  },
  {
    id: 'e10',
    title: 'Leg Raises',
    category: 'core',
    target: 'Lower Abs',
    type: 'reps',
    value: 15,
    gifKey: 'leg_raises',
    instructions: 'Lie flat on your back with legs straight. Slowly raise both legs to 90 degrees, then lower them back down without touching the floor.'
  },
  {
    id: 'e11',
    title: 'Dead Bug',
    category: 'core',
    target: 'Deep Core',
    type: 'time',
    value: 40,
    gifKey: 'dead_bug',
    instructions: 'Lie on your back with arms extended up and knees bent at 90 degrees. Lower the opposite arm and leg toward the floor slowly, then return and switch.'
  },
  {
    id: 'e12',
    title: '90 Degree Crunch',
    category: 'core',
    target: 'Abs',
    type: 'reps',
    value: 15,
    gifKey: 'ninety_degree_crunch',
    instructions: 'Lie on your back with knees bent at 90 degrees in the air. Crunch your upper body toward your knees, squeezing your abs at the top.'
  },
  {
    id: 'e13',
    title: 'In and Outs',
    category: 'core',
    target: 'Lower Abs',
    type: 'reps',
    value: 15,
    gifKey: 'in_and_outs',
    instructions: 'Sit on the floor with hands behind you for support. Bring your knees to your chest, then extend your legs out straight without touching the floor.'
  },
  {
    id: 'e14',
    title: 'Plank with Elbow Lift',
    category: 'core',
    target: 'Core & Shoulders',
    type: 'time',
    value: 40,
    gifKey: 'plank_with_elbow_lift',
    instructions: 'Start in a forearm plank. Lift one elbow slightly off the ground while keeping your body completely still, then alternate sides.'
  },
  {
    id: 'e15',
    title: 'Rotating Toe Touches',
    category: 'core',
    target: 'Obliques',
    type: 'reps',
    value: 16,
    gifKey: 'rotating_toe_touches',
    instructions: 'Lie on your back with legs raised. Rotate your torso to reach one hand toward the opposite foot, alternating sides in a controlled motion.'
  },
  {
    id: 'e16',
    title: 'Prone Back Extension',
    category: 'core',
    target: 'Lower Back',
    type: 'reps',
    value: 12,
    gifKey: 'prone_back_extension',
    instructions: 'Lie face down with arms extended in front. Lift your chest and arms off the ground using your lower back muscles, hold briefly, then lower.'
  },

  // ── UPPER BODY ────────────────────────────────────────────
  {
    id: 'e17',
    title: 'Push Ups',
    category: 'upper',
    target: 'Chest & Arms',
    type: 'reps',
    value: 15,
    gifKey: 'push_ups',
    instructions: 'Start in a high plank with hands shoulder-width apart. Lower your chest to the floor by bending your elbows, then press back up to the start.'
  },
  {
    id: 'e18',
    title: 'Bench Dips',
    category: 'upper',
    target: 'Triceps',
    type: 'reps',
    value: 15,
    gifKey: 'bench_dips',
    instructions: 'Sit on the edge of a sturdy chair or bed. Walk your feet out and lower your hips toward the floor by bending your elbows, then push back up.'
  },

  // ── LOWER BODY ────────────────────────────────────────────
  {
    id: 'e19',
    title: 'Glute Bridge',
    category: 'lower',
    target: 'Glutes',
    type: 'reps',
    value: 20,
    gifKey: 'glute_bridge',
    instructions: 'Lie on your back with knees bent and feet flat on the floor. Squeeze your glutes and lift your hips up until your body forms a straight line, then lower.'
  },
  {
    id: 'e20',
    title: 'Step Ups',
    category: 'lower',
    target: 'Quads & Glutes',
    type: 'reps',
    value: 16,
    gifKey: 'step_ups',
    instructions: 'Stand in front of a sturdy chair or step. Step one foot up, bring the other to meet it, then step back down and repeat on the other side.'
  },
  {
    id: 'e21',
    title: 'Side Lunges with Floor Tap',
    category: 'lower',
    target: 'Legs & Glutes',
    type: 'reps',
    value: 16,
    gifKey: 'side_lunges_floor_tap',
    instructions: 'Stand with feet together. Step one foot wide to the side, bend that knee and tap the floor with your opposite hand, then push back to start and alternate.'
  },
  {
    id: 'e22',
    title: 'Lunge',
    category: 'lower',
    target: 'Quads & Glutes',
    type: 'reps',
    value: 16,
    gifKey: 'lunge',
    instructions: 'Stand tall and step one foot forward. Lower your back knee toward the floor, keeping your front knee over your ankle, then push back to the start and alternate.'
  },

  // ── FLEXIBILITY ───────────────────────────────────────────
  {
    id: 'e23',
    title: 'Cat Cow Stretch',
    category: 'flexibility',
    target: 'Spine & Back',
    type: 'time',
    value: 30,
    gifKey: 'cat_cow_stretch',
    instructions: 'Get on all fours. Arch your back up like a cat while tucking your chin, then drop your belly down and lift your head like a cow. Move slowly and breathe.'
  },
  {
    id: 'e24',
    title: 'Standing Toe Touch',
    category: 'flexibility',
    target: 'Hamstrings & Back',
    type: 'reps',
    value: 12,
    gifKey: 'standing_toe_touch',
    instructions: 'Stand with feet hip-width apart. Hinge at your hips and slowly reach both hands toward your toes, keeping your legs as straight as comfortable.'
  },
];

