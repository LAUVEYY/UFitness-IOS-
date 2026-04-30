import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, Modal, TextInput, TouchableWithoutFeedback, Keyboard, Alert, useWindowDimensions, Platform 
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import { PALETTE } from '../constants/theme';
import { getGif } from '../services/workoutService'; 
import { EXERCISES } from '../data/workouts'; 
import { Image } from 'expo-image';
import { useAudioPlayer } from 'expo-audio'; 
import * as ScreenOrientation from 'expo-screen-orientation';
import { BlurView } from 'expo-blur';

const CATEGORIES = ["All", "Micro", "HIIT", "Strength", "Cardio", "Core"];
const REST_SECONDS = 15; 

// Advanced shuffler that can loop if we request more exercises than exist in a category
const shuffleArray = (array) => [...array].sort(() => 0.5 - Math.random());
const getEx = (cat, count) => {
  const available = EXERCISES.filter(e => e.category === cat);
  if (available.length === 0) return [];
  let result = [];
  while (result.length < count) {
    result = result.concat(shuffleArray(available));
  }
  return result.slice(0, count);
};

const WorkoutScreen = () => {
  const theme = useColorScheme() || 'dark';
  const colors = PALETTE[theme];
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets(); 
  const isLandscape = width > height; 
  
  const styles = getStyles(theme, colors, isLandscape, insets);
  const { completeWorkout } = useUser();

  const [dailyWorkouts, setDailyWorkouts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState('none'); 
  
  const [selectedWorkout, setSelectedWorkout] = useState(null); 
  const [activeSession, setActiveSession] = useState(null);     
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isResting, setIsResting] = useState(false);

  const player = useAudioPlayer(require('../../assets/sounds/ding.mp3'));

  // --- UPGRADED MIX & MATCH ENGINE ---
  useEffect(() => {
    const generateMixedWorkouts = () => {
      return [
        {
          id: 'w1', title: 'Daily HIIT Burn', category: 'HIIT', duration: '12 min', cal: '150', level: 'Intermediate', smallSpace: false,
          image: 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?q=80&w=600',
          description: 'A high-intensity interval training session designed to spike your heart rate and maximize calorie burn in minimal time.',
          exercises: shuffleArray([...getEx('cardio', 3), ...getEx('core', 2)])
        },
        {
          id: 'w2', title: 'Dorm Core Crusher', category: 'Core', duration: '8 min', cal: '80', level: 'Beginner', smallSpace: true,
          image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=600',
          description: 'Silent but deadly. Sculpt your abs and obliques without making a sound or leaving your room.',
          exercises: getEx('core', 5)
        },
        {
          id: 'w3', title: 'Full Body Strength', category: 'Strength', duration: '15 min', cal: '120', level: 'Advanced', smallSpace: false,
          image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=600',
          description: 'Build functional strength across all major muscle groups. No equipment needed, just pure bodyweight resistance.',
          exercises: shuffleArray([...getEx('upper', 2), ...getEx('lower', 3), ...getEx('core', 1)])
        },
        {
          id: 'w4', title: 'Morning Mobility', category: 'Micro', duration: '5 min', cal: '30', level: 'Beginner', smallSpace: true,
          image: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?q=80&w=600',
          description: 'Start your day right. Gentle stretches and movements to wake up your joints, improve posture, and get the blood flowing.',
          exercises: getEx('flexibility', 3) 
        },
        {
          id: 'w5', title: 'Lower Body Burn', category: 'Strength', duration: '10 min', cal: '110', level: 'Intermediate', smallSpace: false,
          image: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?q=80&w=600',
          description: 'Target your glutes, quads, and hamstrings with this explosive lower body routine. Get ready to feel the burn.',
          exercises: getEx('lower', 4)
        },
        {
          id: 'w6', title: 'Cardio Blast', category: 'Cardio', duration: '10 min', cal: '130', level: 'Advanced', smallSpace: true,
          image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=600',
          description: 'Keep your heart rate in the red zone. Constant movement designed to build stamina and endurance quickly.',
          exercises: getEx('cardio', 4) 
        }
      ];
    };
    setDailyWorkouts(generateMixedWorkouts());
  }, []);

  // --- TIMER & REST LOGIC ---
  useEffect(() => {
    let interval = null;
    if (activeSession && isPlaying && timeLeft > 0) {
      if (isResting || activeSession.exercises[currentExIndex].type === 'time') {
        interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
      }
    } else if (timeLeft === 0 && isPlaying && activeSession) {
      if (isResting) { finishRest(); } 
      else if (activeSession.exercises[currentExIndex].type === 'time') { handleExerciseComplete(); }
    }
    return () => clearInterval(interval);
  }, [isPlaying, timeLeft, activeSession, currentExIndex, isResting]);

  useEffect(() => {
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); };
  }, []);

  const startWorkoutSession = async (workout) => {
    setSelectedWorkout(null);
    setActiveSession(workout);
    setCurrentExIndex(0);
    setupExercise(workout.exercises[0]);
    setIsPlaying(true);
    await ScreenOrientation.unlockAsync(); 
  };

  const closeWorkoutSession = async () => {
    setIsPlaying(false);
    setActiveSession(null);
    setIsResting(false);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  const setupExercise = (exercise) => {
    setIsResting(false);
    if (exercise.type === 'time') setTimeLeft(exercise.value);
    else setTimeLeft(0); 
  };

  const handleExerciseComplete = async () => {
    player.seekTo(0);
    player.play(); 

    if (currentExIndex < activeSession.exercises.length - 1) {
      setIsResting(true);
      setTimeLeft(REST_SECONDS); 
    } else {
      setIsPlaying(false);
      completeWorkout(activeSession.duration, parseInt(activeSession.cal));
      await closeWorkoutSession();
      Alert.alert("Workout Complete", `Incredible work! You crushed the ${activeSession.title} routine.`);
    }
  };

  const finishRest = () => {
    setIsResting(false);
    const nextIndex = currentExIndex + 1;
    setCurrentExIndex(nextIndex);
    setupExercise(activeSession.exercises[nextIndex]);
  };

  const handleSkipOrDone = () => {
    if (isResting) finishRest(); 
    else handleExerciseComplete(); 
  };

  const handlePrevExercise = () => {
    if (isResting) {
      setupExercise(activeSession.exercises[currentExIndex]);
    } else if (currentExIndex > 0) {
      const prevIndex = currentExIndex - 1;
      setCurrentExIndex(prevIndex);
      setupExercise(activeSession.exercises[prevIndex]);
    }
  };

  const filteredWorkouts = dailyWorkouts.filter(workout => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = query === "" || workout.title.toLowerCase().includes(query) || workout.tags?.some(t => t.includes(query));
    const matchesCategory = activeCategory === "All" || workout.category === activeCategory || (activeCategory === "Micro" && parseInt(workout.duration) <= 10);
    const matchesQuick = quickFilter === 'none' || (quickFilter === 'smallSpace' && workout.smallSpace) || (quickFilter === 'under15' && parseInt(workout.duration) <= 15);
    return matchesSearch && matchesCategory && matchesQuick;
  });

  // --- PLAYER MODAL ---
  const renderPlayerModal = () => {
    if (!activeSession) return null;
    const currentEx = activeSession.exercises[currentExIndex];
    const nextEx = activeSession.exercises[currentExIndex + 1];
    const targetEx = isResting ? nextEx : currentEx; 
    const isTime = currentEx.type === 'time';
    
    const progressPct = isResting 
      ? (((currentExIndex + 1) / activeSession.exercises.length) * 100) 
      : ((currentExIndex / activeSession.exercises.length) * 100);

    return (
      <Modal visible={!!activeSession} animationType="slide" transparent={false} supportedOrientations={['portrait', 'landscape']}>
        <LinearGradient colors={isResting ? ['#0f172a', '#000'] : ['#1c1c1e', '#000']} style={styles.playerContainer}>
          <View style={isLandscape ? styles.landscapeWrapper : styles.portraitWrapper}>
            <View style={isLandscape ? styles.landscapeLeft : styles.portraitTop}>
              <View style={styles.playerHeader}>
                <TouchableOpacity onPress={closeWorkoutSession} style={styles.playerCloseBtn}>
                  <Ionicons name="close" size={32} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: isResting ? '#3ab7ff' : colors.primary }]} />
                </View>
                <Text style={styles.playerStepText}>
                  {isResting ? 'RESTING' : `EXERCISE ${currentExIndex + 1} OF ${activeSession.exercises.length}`}
                </Text>
              </View>

              <View style={styles.playerGifContainer}>
                <Image source={getGif(targetEx.gifKey)} style={[styles.playerGif, isResting && { opacity: 0.3 }]} resizeMode="contain" />
                {isResting && (
                  <View style={styles.restOverlayBadge}>
                    <Ionicons name="cafe" size={32} color="#FFF" />
                    <Text style={styles.restOverlayText}>RECOVER</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={isLandscape ? styles.landscapeRight : styles.portraitBottom}>
              <View style={styles.playerInfoContainer}>
                <Text style={styles.playerExTitle} adjustsFontSizeToFit numberOfLines={1}>
                  {isResting ? "Take a Breather" : currentEx.title}
                </Text>
                <Text style={[styles.playerExTarget, isResting && { color: '#3ab7ff' }]}>
                  {isResting ? `UP NEXT: ${nextEx.title}` : `TARGET: ${currentEx.target}`}
                </Text>
              </View>

              <View style={styles.playerTimerContainer}>
                {isResting ? (
                  <Text style={[styles.hugeTimer, { color: '#3ab7ff' }]}>
                    00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                  </Text>
                ) : isTime ? (
                  <Text style={styles.hugeTimer}>
                    00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                  </Text>
                ) : (
                  <Text style={styles.hugeTimer}>
                    {currentEx.value} <Text style={{ fontSize: 32, color: '#8E8E93' }}>Reps</Text>
                  </Text>
                )}
                <Text style={styles.timerSubText}>
                  {isResting ? 'SECONDS LEFT' : isTime ? (isPlaying ? 'WORK' : 'PAUSED') : 'AT YOUR OWN PACE'}
                </Text>
              </View>

              <View style={styles.instructionBox}>
                <Text style={styles.instructionText} numberOfLines={isLandscape ? 2 : 3}>
                  {isResting ? `Next up: ${nextEx.instructions}` : currentEx.instructions}
                </Text>
              </View>

              <View style={styles.playerControls}>
                <TouchableOpacity style={styles.controlBtnSmall} onPress={handlePrevExercise}>
                  <Ionicons name="play-skip-back" size={24} color="#FFF" />
                </TouchableOpacity>
                {isResting ? (
                   <TouchableOpacity style={[styles.controlBtnLarge, { backgroundColor: '#3ab7ff' }]} onPress={handleSkipOrDone}>
                     <Ionicons name="play-forward" size={36} color="#000" />
                   </TouchableOpacity>
                ) : isTime ? (
                  <TouchableOpacity style={styles.controlBtnLarge} onPress={() => setIsPlaying(!isPlaying)}>
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={40} color="#000" style={!isPlaying && { marginLeft: 6 }} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.controlBtnLarge, { backgroundColor: '#34C759' }]} onPress={handleSkipOrDone}>
                    <Ionicons name="checkmark-done" size={40} color="#FFF" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.controlBtnSmall} onPress={handleSkipOrDone}>
                  <Ionicons name="play-skip-forward" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </LinearGradient>
      </Modal>
    );
  };

  return (
    <View style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          
          <View style={styles.header}>
            <View>
              <Text style={styles.pageSubtitle}>Ready to sweat?</Text>
              <Text style={styles.pageTitle}>Discover</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="options-outline" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.textDim} style={{ marginLeft: 8 }} />
            <TextInput 
              placeholder="Search routines, muscles..." 
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.textDim} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.chipRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 20}}>
              <TouchableOpacity style={[styles.chip, quickFilter === 'smallSpace' && styles.chipActive]} onPress={() => setQuickFilter(quickFilter === 'smallSpace' ? 'none' : 'smallSpace')}>
                <Ionicons name="bed-outline" size={14} color={quickFilter === 'smallSpace' ? '#000' : colors.text} />
                <Text style={[styles.chipText, quickFilter === 'smallSpace' && styles.chipTextActive]}>Dorm Friendly</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, quickFilter === 'under15' && styles.chipActive]} onPress={() => setQuickFilter(quickFilter === 'under15' ? 'none' : 'under15')}>
                <Ionicons name="timer-outline" size={14} color={quickFilter === 'under15' ? '#000' : colors.text} />
                <Text style={[styles.chipText, quickFilter === 'under15' && styles.chipTextActive]}>Under 15 min</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <View style={styles.categoryRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 20}}>
              {CATEGORIES.map((cat, index) => (
                <TouchableOpacity key={index} onPress={() => setActiveCategory(cat)} style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}>
                  <Text style={[styles.categoryText, activeCategory === cat && styles.categoryTextActive]}>{cat}</Text>
                  {activeCategory === cat && <View style={styles.activeDot} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>
            {activeCategory === "All" && searchQuery === "" && quickFilter === 'none' && (
              <Text style={styles.sectionHeading}>Featured Today</Text>
            )}

            {filteredWorkouts.length > 0 ? (
              filteredWorkouts.map((workout, idx) => {
                const isFeatured = idx === 0 && activeCategory === "All" && searchQuery === "" && quickFilter === 'none';
                return (
                <View key={workout.id}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedWorkout(workout)} style={[styles.card, isFeatured && styles.cardFeatured]}>
                    <View style={styles.cardImageContainer}>
                       {/* REMOVED GIF LOGIC HERE - Just premium static images */}
                       <Image source={{ uri: workout.image }} style={styles.cardImage} resizeMode="cover" />
                    </View>
                    
                    {workout.smallSpace && (
                      <BlurView intensity={60} tint="dark" experimentalBlurMethod="dimezisBlurView" style={styles.smallSpaceBadge}>
                        <Ionicons name="volume-mute" size={12} color="#FFF" />
                        <Text style={styles.smallSpaceText}>Silent</Text>
                      </BlurView>
                    )}

                    <BlurView intensity={80} tint={theme === 'dark' ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={styles.glassInfoPanel}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.glassTitle}>{workout.title}</Text>
                        <View style={styles.glassMetaRow}>
                          <Text style={styles.glassMetaText}><Ionicons name="time" size={12}/> {workout.duration}</Text>
                          <Text style={styles.glassMetaDot}>•</Text>
                          <Text style={styles.glassMetaText}><Ionicons name="flame" size={12}/> {workout.cal}</Text>
                          <Text style={styles.glassMetaDot}>•</Text>
                          <Text style={styles.glassMetaText}>{workout.category}</Text>
                        </View>
                      </View>
                      <View style={styles.glassPlayBtn}>
                        <Ionicons name="play" size={20} color={colors.primary} style={{marginLeft: 2}} />
                      </View>
                    </BlurView>
                  </TouchableOpacity>

                  {isFeatured && (
                     <Text style={[styles.sectionHeading, {marginTop: 20}]}>Explore Routines</Text>
                  )}
                </View>
              )})
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={64} color={colors.border} />
                <Text style={styles.emptyText}>No routines found.</Text>
                <Text style={styles.emptySubText}>Try adjusting your filters.</Text>
              </View>
            )}
          </ScrollView>

          {/* REVAMPED BOTTOM SHEET MODAL */}
          <Modal visible={!!selectedWorkout} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                {selectedWorkout && (
                  <>
                    <View style={styles.modalHero}>
                        <Image source={{ uri: selectedWorkout.image }} style={styles.modalImage} resizeMode="cover" />
                        <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.modalTopGradient} />
                        
                        <BlurView intensity={80} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.closeModalBtn, { top: insets.top + 10 }]}>
                          <TouchableOpacity onPress={() => setSelectedWorkout(null)}>
                            <Ionicons name="close" size={24} color="#FFF" />
                          </TouchableOpacity>
                        </BlurView>
                    </View>

                    {/* The Bottom Sheet Body */}
                    <View style={styles.modalBodyWrapper}>
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150, paddingHorizontal: 24, paddingTop: 30 }}>
                        
                        <View style={styles.pillRow}>
                          <View style={styles.categoryPill}><Text style={styles.pillText}>{selectedWorkout.category}</Text></View>
                          <View style={styles.levelPill}><Text style={[styles.pillText, {color: colors.textDim}]}>{selectedWorkout.level}</Text></View>
                        </View>
                        
                        <Text style={styles.modalTitle}>{selectedWorkout.title}</Text>
                        <Text style={styles.modalDescription}>{selectedWorkout.description}</Text>
                        
                        <View style={styles.statGrid}>
                          <View style={styles.statBox}>
                            <Ionicons name="time-outline" size={28} color={colors.primary} />
                            <Text style={styles.statValue}>{selectedWorkout.duration}</Text>
                          </View>
                          <View style={styles.statBox}>
                            <Ionicons name="flame-outline" size={28} color={colors.primary} />
                            <Text style={styles.statValue}>{selectedWorkout.cal}</Text>
                          </View>
                          <View style={styles.statBox}>
                            <MaterialCommunityIcons name="weight-lifter" size={28} color={colors.primary} />
                            <Text style={styles.statValue}>{selectedWorkout.exercises.length} Ex.</Text>
                          </View>
                        </View>

                        <Text style={styles.sectionHeading}>Routine Flow</Text>
                        
                        {/* REVAMPED DASHED TIMELINE */}
                        <View style={styles.timelineContainer}>
                          {selectedWorkout.exercises.map((ex, i) => (
                            <View key={i} style={styles.timelineRow}>
                               <View style={styles.timelineGraphics}>
                                  <View style={styles.timelineDotOuter}>
                                    <View style={styles.timelineDotInner} />
                                  </View>
                                  {i !== selectedWorkout.exercises.length - 1 && (
                                    <View style={styles.timelineDashedLine} />
                                  )}
                               </View>
                               
                               <View style={styles.timelineCard}>
                                 <View style={styles.exerciseImageWrapper}>
                                   {ex.gifKey ? (
                                     <Image source={getGif(ex.gifKey)} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
                                   ) : (
                                     <Ionicons name="barbell-outline" size={24} color={colors.textDim} />
                                   )}
                                 </View>
                                 <View style={{flex: 1, marginLeft: 16}}>
                                   <Text style={styles.exerciseName} numberOfLines={1}>{ex.title}</Text>
                                   <Text style={styles.exerciseTarget}>{ex.target}</Text>
                                 </View>
                                 <View style={styles.exerciseBadge}>
                                    <Text style={styles.exerciseDuration}>{ex.type === 'time' ? `${ex.value}s` : `${ex.value}x`}</Text>
                                 </View>
                               </View>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    </View>

                    <LinearGradient colors={['transparent', colors.background, colors.background]} style={styles.stickyStartContainer}>
                      <TouchableOpacity style={styles.startBtn} activeOpacity={0.8} onPress={() => startWorkoutSession(selectedWorkout)}>
                        <Text style={styles.startBtnText}>START WORKOUT</Text>
                        <Ionicons name="arrow-forward" size={20} color="#000" />
                      </TouchableOpacity>
                    </LinearGradient>
                  </>
                )}
              </View>
            </View>
          </Modal>

          {renderPlayerModal()}

        </View>
      </TouchableWithoutFeedback>
    </View>
  );
};

const getStyles = (theme, colors, isLandscape, insets) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background, paddingTop: insets.top },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  pageSubtitle: { fontSize: 14, fontWeight: '600', color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  pageTitle: { fontSize: 34, fontWeight: 'bold', color: colors.text, letterSpacing: -0.5 },
  iconBtn: { padding: 12, backgroundColor: colors.surface, borderRadius: 50 },
  
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 24, paddingHorizontal: 16, height: 50 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, height: '100%', marginLeft: 8 },

  chipRow: { marginTop: 16, marginBottom: 8, height: 36 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, marginRight: 8 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, marginLeft: 6, fontWeight: 'bold' },
  chipTextActive: { color: '#000' },

  categoryRow: { marginVertical: 12, height: 32 },
  categoryTab: { marginRight: 24, alignItems: 'center' },
  categoryText: { color: colors.textDim, fontWeight: 'bold', fontSize: 16 },
  categoryTextActive: { color: colors.text, fontWeight: 'bold', fontSize: 16 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 4 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 10 },
  sectionHeading: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 16, letterSpacing: 0.5 },
  
  card: { height: 260, borderRadius: 32, marginBottom: 24, overflow: 'hidden', backgroundColor: colors.surface, elevation: 5, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.1, shadowRadius: 10 },
  cardFeatured: { height: 320 }, 
  cardImageContainer: { width: '100%', height: '100%', backgroundColor: '#111' },
  cardImage: { width: '100%', height: '100%', opacity: 0.85 },
  
  smallSpaceBadge: { position: 'absolute', top: 16, left: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
  smallSpaceText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 },

  glassInfoPanel: { position: 'absolute', bottom: 12, left: 12, right: 12, borderRadius: 24, padding: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  glassTitle: { color: theme === 'dark' ? '#FFF' : '#000', fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  glassMetaRow: { flexDirection: 'row', alignItems: 'center' },
  glassMetaText: { color: theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  glassMetaDot: { color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', marginHorizontal: 8, fontSize: 10 },
  glassPlayBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: colors.text, fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  emptySubText: { color: colors.textDim, fontSize: 14, marginTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: colors.background },
  modalContent: { flex: 1, backgroundColor: colors.background },
  
  // Taller Hero for the Bottom Sheet Look
  modalHero: { width: '100%', height: 450, position: 'relative' },
  modalImage: { width: '100%', height: '100%' },
  modalTopGradient: { position: 'absolute', width: '100%', height: 150, top: 0 },
  closeModalBtn: { position: 'absolute', right: 20, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  
  // The Bottom Sheet overlay
  modalBodyWrapper: { flex: 1, backgroundColor: colors.background, marginTop: -60, borderTopLeftRadius: 40, borderTopRightRadius: 40, overflow: 'hidden', shadowColor: '#000', shadowOffset: {width: 0, height: -10}, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
  
  pillRow: { flexDirection: 'row', marginBottom: 16 },
  categoryPill: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8 },
  levelPill: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  pillText: { color: '#000', fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  modalTitle: { fontSize: 36, fontWeight: 'bold', color: colors.text, marginBottom: 12, letterSpacing: -0.5 },
  modalDescription: { fontSize: 15, color: colors.textDim, lineHeight: 22, marginBottom: 24 },
  
  statGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  statBox: { flex: 1, backgroundColor: colors.surface, padding: 16, borderRadius: 24, alignItems: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginTop: 8 },
  
  timelineContainer: { paddingLeft: 5, marginTop: 10 },
  timelineRow: { flexDirection: 'row', marginBottom: 20 },
  timelineGraphics: { width: 40, alignItems: 'center' },
  
  // Glowing Dot
  timelineDotOuter: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(58, 183, 255, 0.2)', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  timelineDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  // Dashed line
  timelineDashedLine: { width: 1, flex: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: colors.border, marginTop: 8, marginBottom: -20 },
  
  timelineCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 24, borderWidth: 1, borderColor: 'transparent' },
  exerciseImageWrapper: { width: 56, height: 56, borderRadius: 16, backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F2F2F7', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  exerciseName: { color: colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  exerciseTarget: { color: colors.textDim, fontSize: 12, textTransform: 'uppercase', fontWeight: 'bold' },
  exerciseBadge: { backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  exerciseDuration: { color: colors.primary, fontSize: 14, fontWeight: 'bold' },

  stickyStartContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 20, paddingTop: 30 },
  startBtn: { flexDirection: 'row', backgroundColor: colors.primary, borderRadius: 32, paddingVertical: 20, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: colors.primary, shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.4, shadowRadius: 16 },
  startBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold', marginRight: 8, letterSpacing: 1 },

  // --- RESPONSIVE PLAYER STYLES ---
  playerContainer: { flex: 1 }, 
  landscapeWrapper: { flex: 1, flexDirection: 'row' },
  portraitWrapper: { flex: 1, flexDirection: 'column' },
  landscapeLeft: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  landscapeRight: { flex: 1, justifyContent: 'center', paddingRight: 20 },
  portraitTop: { flex: 1, justifyContent: 'flex-start' },
  portraitBottom: { flex: 1, justifyContent: 'flex-end', paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  playerHeader: { paddingTop: isLandscape ? 20 : insets.top + 20, paddingHorizontal: 24, marginBottom: 8 },
  playerCloseBtn: { alignSelf: 'flex-start', paddingBottom: 10 },
  progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden', width: '100%', marginBottom: 12 },
  progressFill: { height: '100%', borderRadius: 4 }, 
  playerStepText: { color: '#8E8E93', fontSize: 13, fontWeight: 'bold', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 },
  playerGifContainer: { alignItems: 'center', justifyContent: 'center', height: isLandscape ? '70%' : 220, backgroundColor: 'rgba(0,0,0,0.4)', marginHorizontal: 24, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  playerGif: { width: '100%', height: '100%' },
  restOverlayBadge: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20, borderRadius: 24 },
  restOverlayText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 8, letterSpacing: 2 },
  playerInfoContainer: { alignItems: 'center', paddingHorizontal: 24, marginTop: 12, marginBottom: 4 },
  playerExTitle: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center', letterSpacing: 0.5 },
  playerExTarget: { color: colors.primary, fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 },
  instructionBox: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginHorizontal: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16, marginTop: 10 },
  instructionText: { color: '#D1D1D6', fontSize: 13, lineHeight: 18, textAlign: 'center', fontWeight: 'bold' },
  playerTimerContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  hugeTimer: { color: '#FFF', fontSize: isLandscape ? 56 : 76, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  timerSubText: { color: '#8E8E93', fontSize: 14, fontWeight: 'bold', letterSpacing: 3, marginTop: -10 },
  playerControls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 40 },
  controlBtnSmall: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  controlBtnLarge: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
});

export default WorkoutScreen;