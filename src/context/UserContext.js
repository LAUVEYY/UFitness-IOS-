import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// --- NATIVE ANDROID HEALTH CONNECT ---
import { 
  initialize, 
  requestPermission, 
  readRecords,
  insertRecords,
  getGrantedPermissions
} from 'react-native-health-connect';

import { 
  onAuthStateChanged, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,   
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithCredential,
  deleteUser 
} from 'firebase/auth';

import { 
  doc, onSnapshot, updateDoc, arrayUnion, setDoc, getDoc, 
  collection, query, orderBy, limit, getDocs, deleteDoc 
} from 'firebase/firestore';

import { auth, db } from '../config/firebase'; 

// --- CONFIGURE NOTIFICATIONS ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true, 
  }),
});

// --- INITIAL STATE ---
const INITIAL_USER_DATA = {
  name: '', 
  email: '',
  profileImage: null,
  createdAt: new Date().toISOString(),
  lastActiveDate: new Date().toISOString().split('T')[0],
  isSetupComplete: false,
  
  // Physical Stats 
  age: null,
  dob: null,
  weight: 0, 
  height: 0,

  // Data Containers
  history: [], 
  customEvents: [],
  schedule: [],

  // Tracking Stats
  stats: {
    streak: 0, 
    bestStreak: 0, 
    caloriesBurnedTotal: 0, 
    caloriesBurnedToday: 0, 
    workoutsCompletedTotal: 0, 
    workoutsCompletedToday: 0,
    minutes: 0,
    steps: 0, 
    stepGoal: 10000, 
    hydrationCurrent: 0, 
    hydrationGoal: 2500, 
    weeklyGoalCurrent: 0, 
    weeklyGoalTarget: 5,
  },

  // App Preferences
  preferences: {
    isAutoSyncEnabled: false,
    pushNotifications: true,
    units: {
      weight: 'kg',      
      height: 'cm',      
      volume: 'ml',      
      energy: 'kcal'     
    }
  },
};

const DEFENSIVE_RETRY_DELAY = 250; 

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);       
  const [userData, setUserData] = useState(INITIAL_USER_DATA); 
  const [loading, setLoading] = useState(true);
  
  const unsubscribeSnapshot = useRef(null);
  const [pedometerSubscription, setPedometerSubscription] = useState(null);
  
  const appState = useRef(AppState.currentState);

  const sessionStartSteps = useRef(0); 
  const currentSessionSteps = useRef(0); 
  const lastSavedSteps = useRef(0);

  const hcInitialized = useRef(false);

  // ============================================================
  // 1. HELPER FUNCTIONS & CONVERTERS
  // ============================================================

  const getLocalDateString = (dateInput) => {
    if (!dateInput) return null;
    try {
      const d = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
      if (isNaN(d.getTime())) return null; 
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return null;
    }
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  };

  const getUnitConfig = (type) => {
    const prefs = userData?.preferences?.units || {};
    
    switch (type) {
      case 'weight':
        return prefs.weight === 'lbs' 
          ? { multiplier: 2.20462, unit: 'lbs', decimals: 0 }
          : { multiplier: 1, unit: 'kg', decimals: 0 };
          
      case 'height':
        return prefs.height === 'ft'
          ? { multiplier: 0.393701, unit: 'in', decimals: 1 } 
          : { multiplier: 1, unit: 'cm', decimals: 0 };

      case 'hydration':
      case 'volume':
        if (prefs.volume === 'oz') return { multiplier: 0.033814, unit: 'oz', decimals: 0 };
        if (prefs.volume === 'glasses') return { multiplier: 1/240, unit: 'glasses', decimals: 1 };
        return { multiplier: 1, unit: 'ml', decimals: 0 };

      case 'energy':
      case 'calories':
        return prefs.energy === 'kJ'
          ? { multiplier: 4.184, unit: 'kJ', decimals: 0 }
          : { multiplier: 1, unit: 'kcal', decimals: 0 };

      case 'steps':
      default:
        return { multiplier: 1, unit: '', decimals: 0 };
    }
  };

  const converters = {
    getUnitConfig, 

    displayWeight: (kgVal) => {
      const { multiplier, unit } = getUnitConfig('weight');
      if (!kgVal) return '--';
      return `${Math.round(kgVal * multiplier)} ${unit}`;
    },

    displayHeight: (cmVal) => {
      const unit = userData?.preferences?.units?.height || 'cm';
      if (!cmVal) return '--';
      if (unit === 'ft') {
        const totalInches = cmVal / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        return `${feet}'${inches}"`;
      }
      return `${cmVal} cm`;
    },

    displayVolume: (mlVal) => {
      const { multiplier, unit, decimals } = getUnitConfig('hydration');
      if (!mlVal && mlVal !== 0) return '--';
      const val = mlVal * multiplier;
      return `${decimals === 0 ? Math.round(val) : val.toFixed(decimals).replace(/\.0$/, '')} ${unit}`;
    },

    displayEnergy: (kcalVal) => {
      const { multiplier, unit } = getUnitConfig('energy');
      if (!kcalVal && kcalVal !== 0) return '--';
      return `${Math.round(kcalVal * multiplier)} ${unit}`;
    }
  };

  // ============================================================
  // 2. HISTORY ARCHIVER (End of Day Logic)
  // ============================================================
  
  const checkAndMigrateDailyStats = async (uid, data) => {
    if (!data) return;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const lastActive = data.lastActiveDate || todayStr;

    if (lastActive !== todayStr) {
      try {
        const userRef = doc(db, 'users', uid);
        const historyEntries = [];

        if (data.stats && data.stats.steps > 0) {
          historyEntries.push({
            type: 'steps',
            value: data.stats.steps, 
            date: lastActive 
          });
        }

        const updates = { lastActiveDate: todayStr };
        updates['stats.steps'] = 0; 
        updates['stats.hydrationCurrent'] = 0; 
        updates['stats.caloriesBurnedToday'] = 0;
        updates['stats.workoutsCompletedToday'] = 0;

        if (historyEntries.length > 0) {
          updates.history = arrayUnion(...historyEntries);
        }

        await updateDoc(userRef, updates);
        
        sessionStartSteps.current = 0;
        currentSessionSteps.current = 0;
      } catch (error) {
        console.error("Failed to migrate daily stats:", error);
      }
    }
  };

  // ============================================================
  // 3. AUTHENTICATION & SETUP
  // ============================================================

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) { 
      return { success: false, error: error.message }; 
    }
  };

  const register = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const newUserData = { 
        ...INITIAL_USER_DATA, 
        email: email, 
        createdAt: new Date().toISOString(), 
        isSetupComplete: false 
      };
      
      await setDoc(doc(db, 'users', uid), newUserData);
      setUserData(newUserData); 
      
      return { success: true };
    } catch (error) { 
      return { success: false, error: error.message }; 
    }
  };

  const loginWithGoogle = async (idToken) => {
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      
      const userRef = doc(db, 'users', result.user.uid);
      const docSnap = await getDoc(userRef);
      
      if (!docSnap.exists()) {
        const newUserData = { 
          ...INITIAL_USER_DATA, 
          email: result.user.email, 
          name: result.user.displayName || 'User',
          profileImage: result.user.photoURL,
          createdAt: new Date().toISOString(), 
          isSetupComplete: false 
        };
        await setDoc(userRef, newUserData);
        setUserData(newUserData);
      }
      return { success: true };
    } catch (error) { 
      return { success: false, error: error.message }; 
    }
  };

  const logout = async () => {
    try {
      if (unsubscribeSnapshot.current) {
        unsubscribeSnapshot.current();
        unsubscribeSnapshot.current = null; 
      }
      if (user) {
        await AsyncStorage.removeItem(`@user_profile_${user.uid}`);
      }
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const deleteAccount = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return { success: false, error: "No user logged in." };

      if (unsubscribeSnapshot.current) {
        unsubscribeSnapshot.current();
        unsubscribeSnapshot.current = null;
      }

      await deleteDoc(doc(db, 'users', currentUser.uid));
      await AsyncStorage.removeItem(`@user_profile_${currentUser.uid}`);

      try { 
        await deleteUser(currentUser); 
      } catch (authError) { 
        console.warn("Auth deletion required recent login, but Firestore data was completely wiped."); 
      }

      await signOut(auth);
      setUserData(INITIAL_USER_DATA);
      setUser(null);

      return { success: true };
    } catch (error) { 
      console.error("Delete Account Error:", error);
      return { success: false, error: error.message }; 
    }
  };

  const completeSetup = async (setupData) => {
    if (!user) return;
    try {
      const now = new Date().toISOString();
      const historyEntries = [];

      if (setupData.weight) {
        historyEntries.push({ type: 'weight', value: setupData.weight, date: now });
      }
      if (setupData.height) {
        historyEntries.push({ type: 'height', value: setupData.height, date: now });
      }

      const updatedPreferences = {
        ...(userData?.preferences || INITIAL_USER_DATA.preferences),
        isAutoSyncEnabled: setupData.preferences?.calendarSynced || false,
        units: {
          ...(userData?.preferences?.units || INITIAL_USER_DATA.preferences.units),
          weight: setupData.preferences?.weightUnit || 'kg',
          height: setupData.preferences?.heightUnit || 'cm',
          volume: setupData.preferences?.hydrationUnit || 'ml',
        }
      };

      const firestoreUpdates = {
        name: setupData.name,
        age: setupData.age,
        dob: setupData.dob, 
        weight: setupData.weight, 
        height: setupData.height, 
        "stats.stepGoal": setupData.stats?.stepGoal || 10000,
        "stats.hydrationGoal": setupData.stats?.hydrationGoal || 2500, 
        preferences: updatedPreferences,
        isSetupComplete: true
      };

      if (historyEntries.length > 0) {
        firestoreUpdates.history = arrayUnion(...historyEntries);
      }

      await updateDoc(doc(db, 'users', user.uid), firestoreUpdates);
      
      setUserData(prev => ({ 
        ...prev, 
        name: setupData.name,
        age: setupData.age,
        dob: setupData.dob,
        weight: setupData.weight,
        height: setupData.height,
        stats: {
          ...(prev?.stats || INITIAL_USER_DATA.stats),
          stepGoal: setupData.stats?.stepGoal || 10000,
          hydrationGoal: setupData.stats?.hydrationGoal || 2500,
        },
        history: [...(prev?.history || []), ...historyEntries],
        preferences: updatedPreferences,
        isSetupComplete: true 
      }));
    } catch (e) { 
      console.error("Setup Error:", e); 
    }
  };

  // ============================================================
  // 4. PROFILE & BODY STATS MANAGEMENT
  // ============================================================

  const updateName = async (newName) => {
    if (!user) return { success: false, error: "No user" };
    try {
      await updateProfile(user, { displayName: newName });
      await updateDoc(doc(db, 'users', user.uid), { name: newName });
      setUserData(prev => ({ ...prev, name: newName }));
      return { success: true };
    } catch (e) { 
      return { success: false, error: e.message }; 
    }
  };

  const updateDOB = async (dobString, age) => {
    if (!user) return { success: false, error: "No user" };
    try {
      await updateDoc(doc(db, 'users', user.uid), { dob: dobString, age: age });
      setUserData(prev => ({ ...prev, dob: dobString, age: age }));
      return { success: true };
    } catch (e) { 
      return { success: false, error: e.message }; 
    }
  };

  const updateBodyStats = async (newWeight, newHeight) => {
    if (!user) return { success: false, error: "No user" };
    try {
      const now = new Date().toISOString();
      const updates = {};
      const historyEntries = [];

      if (newWeight) {
        const val = parseInt(newWeight);
        updates.weight = val;
        historyEntries.push({ type: 'weight', value: val, date: now });
      }
      if (newHeight) {
        const val = parseInt(newHeight);
        updates.height = val;
        historyEntries.push({ type: 'height', value: val, date: now });
      }

      if (historyEntries.length > 0) {
        updates.history = arrayUnion(...historyEntries);
      }

      await updateDoc(doc(db, 'users', user.uid), updates);
      return { success: true };
    } catch (e) { 
      return { success: false, error: e.message }; 
    }
  };

  const updateUserPassword = async (currentPassword, newPassword) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return { success: false, error: "No user logged in" };
    try {
      await updatePassword(currentUser, newPassword);
      return { success: true };
    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        try {
          const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
          await reauthenticateWithCredential(currentUser, credential);
          await updatePassword(currentUser, newPassword);
          return { success: true };
        } catch (reAuthError) { 
          return { success: false, error: "Current password was incorrect." }; 
        }
      }
      return { success: false, error: error.message };
    }
  };

  const uploadProfileImage = async (base64Image) => {
    if (!user) return { success: false, error: "No user logged in" };
    try {
      const imageString = `data:image/jpeg;base64,${base64Image}`;
      await updateDoc(doc(db, 'users', user.uid), { profileImage: imageString });
      setUserData(prev => ({ ...prev, profileImage: imageString }));
      return { success: true };
    } catch (error) { 
      return { success: false, error: error.message }; 
    }
  };

  const updatePreferences = async (newPrefs) => {
    if (!user) return;
    const currentUnits = userData.preferences?.units || INITIAL_USER_DATA.preferences.units;
    const incomingUnits = newPrefs.units || {};
    
    const updated = { 
      ...userData.preferences, 
      ...newPrefs, 
      units: { ...currentUnits, ...incomingUnits }
    };

    setUserData(prev => ({ ...prev, preferences: updated })); 
    await updateDoc(doc(db, 'users', user.uid), { preferences: updated });
  };

  const updateDailyGoals = async (newStepGoal, newHydrationGoal) => {
    if (!user) return;
    const updates = {};
    if (newStepGoal) updates["stats.stepGoal"] = parseInt(newStepGoal);
    if (newHydrationGoal) updates["stats.hydrationGoal"] = parseInt(newHydrationGoal);
    
    setUserData(prev => ({ ...prev, stats: { ...prev.stats, ...updates } }));
    await updateDoc(doc(db, 'users', user.uid), updates);
  };

  // ============================================================
  // 5. DATA, CALENDAR & SYNC
  // ============================================================

  const fetchLeaderboard = async () => {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy("stats.steps", "desc"), limit(50));
      const querySnapshot = await getDocs(q);
      const leaderboardData = [];
      
      querySnapshot.forEach((doc) => {
        const d = doc.data();
        leaderboardData.push({
          id: doc.id,
          name: d.name || 'Anonymous',
          steps: d.stats?.steps || 0,
          profileImage: d.profileImage || null
        });
      });
      return leaderboardData;
    } catch (e) { 
      console.log("Error fetching leaderboard:", e); 
      return []; 
    }
  };

  const findSmartGaps = (busyEvents, startDate, daysToScan = 365) => {
    const gaps = [];
    const minGapMinutes = 20;
    
    const createGap = (startMs, endMs, dateKey, label) => {
      const diffMins = Math.floor((endMs - startMs) / 60000);
      let gapType = 'Bronze'; 
      let suggestion = 'Free Time'; 
      let color = '#FFCC00'; 
      
      if (diffMins >= 120) { 
        gapType = 'Diamond'; 
        suggestion = 'FREE DAY: Long Workout'; 
        color = '#0A84FF'; 
      } else if (diffMins >= 45) { 
        gapType = 'Gold'; 
        suggestion = 'BEST TIME: Full Workout'; 
        color = '#c59d00'; 
      } else if (diffMins >= 20) { 
        gapType = 'Silver'; 
        suggestion = 'Great for HIIT / Micro'; 
        color = '#929292'; 
      }
      
      const startObj = new Date(startMs); 
      const endObj = new Date(endMs);
      
      return {
        id: `gap_${dateKey}_${startMs}_${Date.now()}`, 
        dateString: dateKey, 
        day: new Date(startMs).getDate().toString(),
        title: label || 'Fitness Opportunity', 
        startTime: startObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        endTime: endObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 
        rawStart: startMs, 
        rawEnd: endMs, 
        type: 'gap',
        gapQuality: gapType, 
        duration: formatDuration(diffMins), 
        suggestion: suggestion, 
        color: color
      };
    };

    const eventsByDate = {};
    busyEvents.forEach(e => { 
      if (!eventsByDate[e.dateString]) {
        eventsByDate[e.dateString] = [];
      }
      eventsByDate[e.dateString].push(e); 
    });

    for (let i = 0; i < daysToScan; i++) {
      const currentDate = new Date(startDate); 
      currentDate.setDate(currentDate.getDate() + i);
      const dateKey = getLocalDateString(currentDate);
      
      if (!eventsByDate[dateKey] || eventsByDate[dateKey].length === 0) {
        const freeStart = new Date(currentDate); 
        freeStart.setHours(9, 0, 0, 0);
        
        const freeEnd = new Date(currentDate); 
        freeEnd.setHours(18, 0, 0, 0);
        
        gaps.push(createGap(freeStart.getTime(), freeEnd.getTime(), dateKey, "Free Day Opportunity")); 
        continue; 
      }
      
      const dayEvents = eventsByDate[dateKey].sort((a, b) => a.rawStart - b.rawStart);
      
      const dayStart = new Date(dayEvents[0].rawStart); 
      dayStart.setHours(7, 0, 0, 0); 
      
      if (dayEvents[0].rawStart > dayStart.getTime()) {
        const diff = Math.floor((dayEvents[0].rawStart - dayStart.getTime()) / 60000);
        if (diff >= minGapMinutes) {
          gaps.push(createGap(dayStart.getTime(), dayEvents[0].rawStart, dateKey, "Morning Workout"));
        }
      }
      
      for (let j = 0; j < dayEvents.length - 1; j++) {
        const currentEnd = dayEvents[j].rawEnd; 
        const nextStart = dayEvents[j+1].rawStart;
        const diff = Math.floor((nextStart - currentEnd) / 60000);
        if (diff >= minGapMinutes) {
          gaps.push(createGap(currentEnd, nextStart, dateKey));
        }
      }
      
      const dayEnd = new Date(dayEvents[0].rawStart); 
      dayEnd.setHours(22, 0, 0, 0);
      
      const lastEventEnd = dayEvents[dayEvents.length - 1].rawEnd;
      if (lastEventEnd < dayEnd.getTime()) {
        const diff = Math.floor((dayEnd.getTime() - lastEventEnd) / 60000);
        if (diff >= minGapMinutes) {
          gaps.push(createGap(lastEventEnd, dayEnd.getTime(), dateKey, "Evening Workout"));
        }
      }
    }
    
    return gaps;
  };

  const scheduleGapNotifications = async (gaps) => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('gaps', {
          name: 'Fitness Windows',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF3B30',
          sound: 'ping.wav', 
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') return;

      await Notifications.cancelAllScheduledNotificationsAsync();

      const now = Date.now();
      const upcomingGaps = gaps.filter(g => g.type === 'gap' && (g.rawStart - 5 * 60000) > now);

      for (let i = 0; i < Math.min(upcomingGaps.length, 20); i++) {
        const gap = upcomingGaps[i];
        const triggerTime = new Date(gap.rawStart - 5 * 60000); 

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Fitness Window Approaching",
            body: `You have a ${gap.duration} gap starting in 5 minutes. Time for a quick ${gap.suggestion}?`,
            data: { gapId: gap.id },
            sound: 'ping.wav',
            badge: 1, 
          },
          trigger: { 
            date: triggerTime,
            channelId: 'gaps' 
          },
        });
      }
    } catch (e) {
      console.log("Failed to schedule notifications:", e);
    }
  };

  const syncDefaultCalendar = async () => {
    if (!user) return false;
    
    try {
      let busyEvents = [];
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      
      if (status === 'granted') {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const calendarIds = calendars.map(c => c.id);
        
        const start = new Date(); 
        start.setHours(0,0,0,0);
        
        const end = new Date(); 
        end.setDate(end.getDate() + 365); 
        end.setHours(23,59,59,999);
        
        // FIX: Replaced console log with silent catch for no-events boundary crash
        let deviceEvents = [];
        if (calendarIds && calendarIds.length > 0) {
            try {
                const events = await Calendar.getEventsAsync(calendarIds, start, end);
                deviceEvents = events.filter(e => {
                    const note = e.notes || e.description || ''; 
                    return !note.includes('Added via UFitness Schedule');
                }).map((e, i) => {
                    const s = new Date(e.startDate); 
                    const en = new Date(e.endDate); 
                    const durMins = Math.round((en - s) / 60000);
                    
                    return {
                    id: `local_${i}_${e.id}`, 
                    dateString: getLocalDateString(s), 
                    day: s.getDate().toString(),
                    title: e.title || 'Event', 
                    rawStart: s.getTime(), 
                    rawEnd: en.getTime(),
                    startTime: s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                    endTime: en.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                    type: 'class', 
                    duration: formatDuration(durMins), 
                    color: e.calendarColor || '#555' 
                    };
                });
            } catch (err) {
                // Silenced Calendar Fetch Error
            }
        }
        busyEvents = [...busyEvents, ...deviceEvents];
      }
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const customData = userDoc.data().customEvents || [];
        const formattedCustom = customData.map(c => {
          const s = new Date(c.rawStart); 
          const e = new Date(c.rawEnd);
          
          return {
            id: c.id, 
            dateString: c.dateString, 
            day: s.getDate().toString(), 
            title: c.title,
            rawStart: c.rawStart, 
            rawEnd: c.rawEnd,
            startTime: s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            endTime: e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            type: 'custom', 
            duration: formatDuration(c.duration), 
            color: '#FF9500' 
          };
        });
        
        busyEvents = [...busyEvents, ...formattedCustom];
      }
      
      const start = new Date(); 
      start.setHours(0,0,0,0);
      
      const gaps = findSmartGaps(busyEvents, start, 365);
      const fullSchedule = [...busyEvents, ...gaps].sort((a, b) => a.rawStart - b.rawStart);
      
      await updateDoc(doc(db, 'users', user.uid), { schedule: fullSchedule });

      if (userData?.preferences?.pushNotifications) {
         await scheduleGapNotifications(gaps);
      }

      return true;
      
    } catch (e) { 
      console.log(e); 
      return false; 
    }
  };

  const addCustomEvent = async (title, dateIsoString, timeString, durationMins) => {
    if (!user) return { success: false, error: "No user" };
    try {
      const [hours, mins] = timeString.split(':').map(Number);
      
      const startDate = new Date(dateIsoString);
      startDate.setHours(hours, mins, 0, 0);
      const rawStart = startDate.getTime();
      
      const rawEnd = rawStart + (durationMins * 60000);
      const endDate = new Date(rawEnd);

      try {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        
        if (status === 'granted') {
          let calendarId = null;
          
          if (Platform.OS === 'ios') {
            const defaultCal = await Calendar.getDefaultCalendarAsync();
            calendarId = defaultCal.id;
          } else {
            const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const primary = calendars.find(c => c.isPrimary) || calendars.find(c => c.accessLevel === Calendar.CalendarAccessLevel.OWNER);
            calendarId = primary ? primary.id : null;
          }
          
          if (calendarId) {
            const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            await Calendar.createEventAsync(calendarId, {
              title: title, 
              startDate: startDate, 
              endDate: endDate, 
              timeZone: deviceTimeZone,
              location: 'UFitness App', 
              notes: 'Added via UFitness Schedule' 
            });
          }
        }
      } catch (calErr) { 
        console.warn("Native Sync Skipped:", calErr.message); 
      }

      const newEvent = {
        id: `custom_${Date.now()}`, 
        title: title || "Workout", 
        dateString: dateIsoString,
        startTime: timeString, 
        duration: parseInt(durationMins), 
        rawStart, 
        rawEnd, 
        type: 'custom'
      };
      
      await updateDoc(doc(db, 'users', user.uid), { customEvents: arrayUnion(newEvent) });
      await refreshData();
      return { success: true };
      
    } catch (e) { 
      return { success: false, error: e.message }; 
    }
  };

  const deleteCustomEvent = async (eventId) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const currentEvents = userSnap.data().customEvents || [];
        const updatedEvents = currentEvents.filter(e => e.id !== eventId);
        
        await updateDoc(userRef, { customEvents: updatedEvents });
        await refreshData(); 
        
        return { success: true };
      }
    } catch (e) { 
      return { success: false, error: e.message }; 
    }
  };

  // ============================================================
  // 7. STATS & OS NATIVE LOGIC 
  // ============================================================

  const calculateStats = (history = [], currentStats) => {
    if (!history || !Array.isArray(history)) return currentStats;

    const todayStr = getLocalDateString(new Date());

    const caloriesBurnedTotal = history.reduce((sum, item) => {
      return item.type === 'workout' ? sum + (Number(item.calories) || 0) : sum;
    }, 0);

    const caloriesBurnedToday = history.reduce((sum, item) => {
      if (item.type === 'workout' && getLocalDateString(item.date) === todayStr) {
        return sum + (Number(item.calories) || 0);
      }
      return sum;
    }, 0);

    const workoutsCompletedTotal = history.filter(h => h.type === 'workout').length;
    
    const workoutsCompletedToday = history.filter(h => {
      return h.type === 'workout' && getLocalDateString(h.date) === todayStr;
    }).length;

    const hydrationCurrent = history.reduce((sum, item) => {
      if ((item.type === 'hydration' || item.type === 'water') && getLocalDateString(item.date) === todayStr) {
        return sum + (Number(item.amount) || 0);
      }
      return sum;
    }, 0);

    const minutes = history.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    
    const now = new Date();
    const startOfWeek = new Date(now); 
    startOfWeek.setDate(now.getDate() - now.getDay()); 
    startOfWeek.setHours(0,0,0,0);
    
    const weeklyGoalCurrent = history.filter(item => {
      const itemDate = item.date && item.date.toDate ? item.date.toDate() : new Date(item.date);
      return itemDate >= startOfWeek && item.type === 'workout';
    }).length;

    const uniqueDates = [...new Set(history.filter(h => h.type === 'workout').map(item => {
      const dateObj = item.date && item.date.toDate ? item.date.toDate() : new Date(item.date);
      return getLocalDateString(dateObj);
    }))].filter(d => d).sort();

    const yesterdayDate = new Date(); 
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterdayDate);

    let currentStreak = 0;
    if (uniqueDates.includes(todayStr) || uniqueDates.includes(yesterdayStr)) {
      let checkDate = new Date(uniqueDates.includes(todayStr) ? todayStr : yesterdayStr);
      currentStreak = 1;
      
      while (true) {
        checkDate.setDate(checkDate.getDate() - 1);
        if (uniqueDates.includes(getLocalDateString(checkDate))) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
    const finalBestStreak = Math.max(currentStreak, currentStats.bestStreak || 0);

    return { 
      ...currentStats, 
      workoutsCompletedTotal, 
      workoutsCompletedToday, 
      caloriesBurnedTotal, 
      caloriesBurnedToday, 
      minutes, 
      weeklyGoalCurrent,
      streak: currentStreak, 
      bestStreak: finalBestStreak, 
      hydrationCurrent 
    };
  };

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const safeInitHealthConnect = async () => {
    if (Platform.OS !== 'android') return false;
    if (hcInitialized.current) return true;
    
    try {
      const res = await initialize();
      hcInitialized.current = res; 
      return res;
    } catch (error) {
      console.log("Health Connect Initialization Error:", error);
      return false;
    }
  };

  const refreshData = async () => {
    try {
      if (Platform.OS === 'ios') {
        const isAvailable = await Pedometer.isAvailableAsync();
        if (isAvailable) {
          const start = new Date(); 
          start.setHours(0,0,0,0); 
          const end = new Date();
          const result = await Pedometer.getStepCountAsync(start, end);
          const newSteps = result.steps;
          
          setUserData(prev => ({ ...prev, stats: { ...prev.stats, steps: newSteps } }));
          sessionStartSteps.current = newSteps; 
          currentSessionSteps.current = 0;
          
          if (user) {
            try { await updateDoc(doc(db, 'users', user.uid), { "stats.steps": newSteps }); } catch (e) {}
          }
        }
      } else if (Platform.OS === 'android') {
        const isInitialized = await safeInitHealthConnect();
        
        if (isInitialized) {
          try {
            const granted = await getGrantedPermissions();
            const hasStepsPerm = granted.some(p => p.recordType === 'Steps' && p.accessType === 'read');

            if (hasStepsPerm) {
              const startOfDay = new Date();
              startOfDay.setHours(0, 0, 0, 0);
              const endOfDay = new Date();

              const result = await readRecords('Steps', {
                timeRangeFilter: { operator: 'between', startTime: startOfDay.toISOString(), endTime: endOfDay.toISOString() },
              });

              const totalStepsToday = result.records.reduce((sum, record) => sum + record.count, 0);

              setUserData(prev => ({ ...prev, stats: { ...prev.stats, steps: totalStepsToday } }));

              if (user) {
                try { await updateDoc(doc(db, 'users', user.uid), { "stats.steps": totalStepsToday }); } catch (e) {}
              }
            } else {
              console.log("Health Connect: Permission not granted yet. Skipping auto-fetch to prevent boot crash.");
            }
          } catch(err) {
             // FIX: Ignore the Android 14 strict SecurityException to avoid console spam. 
             // If they blocked cross-app reads, we just skip local cache parsing.
             if (!err.message?.includes('SecurityException')) {
                console.log("Health Connect Sync Error:", err.message);
             }
          }
        }
      }
      
      if (userData?.preferences?.isAutoSyncEnabled) {
        await syncDefaultCalendar();
      }
    } catch (e) {
      console.log("Refresh Data Error:", e);
    }
  };

  const startPedometer = async () => {
    try {
      if (Platform.OS === 'ios') {
        const { status } = await Pedometer.requestPermissionsAsync(); 
        if (status !== 'granted') return;
        
        sessionStartSteps.current = userData?.stats?.steps || 0;
        if (pedometerSubscription) pedometerSubscription.remove();
        
        const sub = Pedometer.watchStepCount((result) => {
          currentSessionSteps.current = result.steps; 
          const totalSteps = sessionStartSteps.current + currentSessionSteps.current;
          setUserData(prev => ({ ...prev, stats: { ...prev.stats, steps: totalSteps } }));
        });
        setPedometerSubscription(sub);
      } else {
        await refreshData();
      }
    } catch (e) { 
      console.log("Pedometer Permission Error:", e);
    }
  };

  const promptHealthConnectPermissions = async () => {
      if (Platform.OS !== 'android') return false;
      try {
          const isInitialized = await safeInitHealthConnect();
          if (isInitialized) {
              await requestPermission([
                  { accessType: 'read', recordType: 'Steps' },
                  { accessType: 'write', recordType: 'ActiveCaloriesBurned' }
              ]);
              await refreshData();
              return true;
          }
      } catch (err) {
          console.error("Manual Permission Request Failed:", err);
          return false;
      }
  }

  const completeWorkout = async (dur, cal) => {
    if (!user) return;
    
    const entry = { date: new Date().toISOString(), type: 'workout', duration: parseInt(dur), calories: parseInt(cal) };
    const newHistory = [...(userData.history || []), entry]; 
    const newStats = calculateStats(newHistory, userData.stats);
    
    setUserData(prev => ({ ...prev, history: newHistory, stats: newStats }));
    
    if (Platform.OS === 'android') {
      try {
        const isInitialized = await safeInitHealthConnect();
        if (isInitialized) {
          const granted = await getGrantedPermissions();
          const hasCalPerm = granted.some(p => p.recordType === 'ActiveCaloriesBurned' && p.accessType === 'write');

          if (hasCalPerm) {
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - (entry.duration * 60000));

            await insertRecords([{
              recordType: 'ActiveCaloriesBurned',
              energy: { value: parseInt(cal), unit: 'kilocalories' },
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
            }]);
          }
        }
      } catch(hcError) { console.log("Health Connect Write Error:", hcError); }
    }
    
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        history: arrayUnion(entry), 
        "stats.streak": newStats.streak, 
        "stats.bestStreak": newStats.bestStreak, 
        "stats.caloriesBurnedTotal": newStats.caloriesBurnedTotal, 
        "stats.caloriesBurnedToday": newStats.caloriesBurnedToday, 
        "stats.minutes": newStats.minutes, 
        "stats.workoutsCompletedTotal": newStats.workoutsCompletedTotal, 
        "stats.workoutsCompletedToday": newStats.workoutsCompletedToday, 
        "stats.weeklyGoalCurrent": newStats.weeklyGoalCurrent
      });
    } catch(e) { console.log("Offline: Workout cached locally."); }
  };

  const addWater = async () => {
    if (!user) return;
    const entry = { date: new Date().toISOString(), type: 'hydration', amount: 250 };
    const newHistory = [...(userData.history || []), entry]; 
    const newStats = calculateStats(newHistory, userData.stats);
    setUserData(prev => ({ ...prev, history: newHistory, stats: newStats }));
    
    try {
      await updateDoc(doc(db, 'users', user.uid), { history: arrayUnion(entry), "stats.hydrationCurrent": newStats.hydrationCurrent });
    } catch(e) { console.log("Offline: Water cached locally."); }
  };

  const updateSteps = async (steps) => {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { 'stats.steps': steps }); } 
    catch (e) { console.log("Offline: Steps cached locally."); }
  };

  const resetProgress = async () => { 
    if (!user) return;
    const resetState = {
      history: [], customEvents: [], "stats.hydrationCurrent": 0, "stats.streak": 0, 
      "stats.bestStreak": 0, "stats.caloriesBurnedTotal": 0, "stats.caloriesBurnedToday": 0, 
      "stats.workoutsCompletedTotal": 0, "stats.workoutsCompletedToday": 0, "stats.minutes": 0, 
      "stats.weeklyGoalCurrent": 0, "stats.steps": 0
    };
    setUserData(prev => ({ ...prev, ...resetState }));
    
    try { await updateDoc(doc(db, 'users', user.uid), resetState); } 
    catch(e) { console.log("Offline: Reset cached locally."); }
    sessionStartSteps.current = 0; currentSessionSteps.current = 0;
  };

  // ============================================================
  // 8. EFFECTS & LISTENERS
  // ============================================================

  useEffect(() => {
    if (user && userData && userData.isSetupComplete) {
      AsyncStorage.setItem(`@user_profile_${user.uid}`, JSON.stringify(userData)).catch(() => {});
    }
  }, [userData, user]);

  useEffect(() => {
    Notifications.setBadgeCountAsync(0);

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') { 
        Notifications.setBadgeCountAsync(0);
        Notifications.dismissAllNotificationsAsync();

        if (user && userData?.preferences?.isAutoSyncEnabled) syncDefaultCalendar(); 
        if (Platform.OS === 'android' && user) refreshData(); 
      }
      appState.current = nextAppState;
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      Notifications.setBadgeCountAsync(0);
      Notifications.dismissAllNotificationsAsync();
    });
    
    return () => { 
      subscription.remove(); 
      responseListener.remove();
    };
  }, [user, userData?.preferences?.isAutoSyncEnabled]);

  useEffect(() => {
    if (!user) return;
    
    const saveInterval = setInterval(async () => {
      const totalSteps = sessionStartSteps.current + currentSessionSteps.current;
      
      if (totalSteps > lastSavedSteps.current) {
         try { 
           await updateDoc(doc(db, 'users', user.uid), { "stats.steps": totalSteps }); 
           lastSavedSteps.current = totalSteps; 
         } catch(e) {}
      }
    }, 60000); 
    
    return () => clearInterval(saveInterval);
  }, [user]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setLoading(true); setUser(currentUser); startPedometer(); 
        const cacheKey = `@user_profile_${currentUser.uid}`;
        const failsafeTimer = setTimeout(() => { setLoading(false); }, 2500);
        let localCache = null;

        try {
          const cachedProfile = await AsyncStorage.getItem(cacheKey);
          if (cachedProfile) {
            localCache = JSON.parse(cachedProfile);
            setUserData(localCache); setLoading(false); clearTimeout(failsafeTimer); 
          }
        } catch (e) { console.log("Cache read error:", e); }

        unsubscribeSnapshot.current = onSnapshot(doc(db, 'users', currentUser.uid), async (docSnap) => {
            if (docSnap.exists()) {
              let data = docSnap.data();
              if (!data.email && currentUser.email) data.email = currentUser.email;

              if (localCache && localCache.history && data.history && localCache.history.length > data.history.length) {
                data = { ...localCache }; 
                try { await setDoc(doc(db, 'users', currentUser.uid), localCache); } catch(e) {}
              }
              
              if (localCache && localCache.stats && data.stats && localCache.stats.steps > data.stats.steps) {
                data.stats.steps = localCache.stats.steps;
                try { await updateDoc(doc(db, 'users', currentUser.uid), { "stats.steps": localCache.stats.steps }); } catch(e) {}
              }

              checkAndMigrateDailyStats(currentUser.uid, data);
              if (sessionStartSteps.current === 0 && (data.stats?.steps || 0) > 0) sessionStartSteps.current = data.stats.steps;

              const prefs = { ...INITIAL_USER_DATA.preferences, ...(data.preferences || {}) };
              const safeStats = calculateStats(data.history, data.stats || INITIAL_USER_DATA.stats);
              const finalData = { ...data, stats: safeStats, preferences: prefs };
              
              setUserData(finalData); localCache = finalData; 
            } else {
              if (localCache && localCache.isSetupComplete) {
                setUserData(localCache); try { await setDoc(doc(db, 'users', currentUser.uid), localCache); } catch(e) {}
              } else {
                const fallbackData = { ...INITIAL_USER_DATA, email: currentUser.email || '', name: currentUser.displayName || 'User', profileImage: currentUser.photoURL || null };
                try { await setDoc(doc(db, 'users', currentUser.uid), fallbackData); } catch(e) {}
                setUserData(fallbackData);
              }
            }
            setLoading(false); clearTimeout(failsafeTimer);
          },
          (error) => { setLoading(false); clearTimeout(failsafeTimer); }
        );

        return () => { 
          if (unsubscribeSnapshot.current) unsubscribeSnapshot.current(); 
          if (pedometerSubscription) pedometerSubscription.remove(); 
          clearTimeout(failsafeTimer);
        };
      } else { 
        setUser(null); setUserData(INITIAL_USER_DATA); setLoading(false); 
      }
    });
    return () => unsubscribeAuth();
  }, []);

  return (
    <UserContext.Provider value={{ 
      user, userData, loading, login, register, logout, loginWithGoogle, completeSetup, deleteAccount, 
      uploadProfileImage, updateName, updateUserPassword, updatePreferences, updateDailyGoals, updateBodyStats, updateDOB, 
      refreshData, syncDefaultCalendar, fetchLeaderboard, addCustomEvent, deleteCustomEvent, 
      completeWorkout, addWater, updateSteps, resetProgress, promptHealthConnectPermissions, converters 
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);