import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, useColorScheme, Alert, ScrollView, Platform, ActivityIndicator, FlatList, LayoutAnimation, UIManager, Vibration, InteractionManager
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useAudioPlayer } from 'expo-audio';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps'; 
import { Image } from 'expo-image'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { useUser } from '../context/UserContext'; 
import { PALETTE } from '../constants/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background Location Error:", error);
    return;
  }
  if (data) {
    const { locations } = data;
    
    try {
      const validLocations = locations.filter(loc => loc.coords.accuracy <= 15).map(loc => ({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        speed: loc.coords.speed,
        timestamp: loc.timestamp
      }));

      if (validLocations.length > 0) {
        const queueStr = await AsyncStorage.getItem('@route_queue');
        const queue = queueStr ? JSON.parse(queueStr) : [];
        queue.push(...validLocations);
        await AsyncStorage.setItem('@route_queue', JSON.stringify(queue));
      }
    } catch (e) {
      console.log("Failed to queue background location:", e);
    }
  }
});

const calculateDistance = (coord1, coord2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; 
  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(coord1.latitude)) * Math.cos(toRad(coord2.latitude)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

const formatTimeSpan = (isoDate, durationSecs) => {
  if (!isoDate) return "--:-- – --:--";
  const start = new Date(isoDate);
  const end = new Date(start.getTime() + ((durationSecs || 0) * 1000));
  const formatParams = { hour: '2-digit', minute: '2-digit', hour12: false };
  return `${start.toLocaleTimeString([], formatParams)}–${end.toLocaleTimeString([], formatParams)}`;
};

export default function CompeteScreen() {
  const router = useRouter();
  const theme = useColorScheme() || 'dark';
  const colors = PALETTE[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  
  const { user, userData, fetchLeaderboard, completeWorkout, updateSteps } = useUser(); 
  
  const [baseLeaderboard, setBaseLeaderboard] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);
  const [isGpsLocking, setIsGpsLocking] = useState(false);
  
  const [activeTab, setActiveTab] = useState('Leaderboard'); 
  const [filter, setFilter] = useState('Today'); 
  
  const [runHistory, setRunHistory] = useState([]); 
  const [selectedRun, setSelectedRun] = useState(null); 

  const [appState, setAppState] = useState('idle'); 
  const [route, setRoute] = useState([]); 
  const [distance, setDistance] = useState(0); 
  const [duration, setDuration] = useState(0); 
  const [currentPace, setCurrentPace] = useState("--'--");
  const [isSaving, setIsSaving] = useState(false);
  
  const [milestoneSplash, setMilestoneSplash] = useState(null);

  const timerRef = useRef(null);
  const syncIntervalRef = useRef(null);
  const mapRef = useRef(null);
  const detailMapRef = useRef(null);
  const fullMapRef = useRef(null);
  
  const lastMilestoneRef = useRef(0);
  const lastKmTimeRef = useRef(null);
  const splitsRef = useRef([]);
  const distanceRef = useRef(0);
  const durationRef = useRef(0);

  const player = useAudioPlayer(require('../../assets/sounds/ping.mp3'));

  useEffect(() => {
    const initializeCompeteScreen = async () => {
      const recovered = await recoverActiveRun();
      if (!recovered) {
         await cleanupBackgroundTracking(); 
      }
      loadBaseLeaderboard();
    };
    initializeCompeteScreen();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, []); 

  const recoverActiveRun = async () => {
    const isTracking = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTracking) {
        const backup = await AsyncStorage.getItem('@route_full_backup');
        if (backup) {
            const parsedRoute = JSON.parse(backup);
            setRoute(parsedRoute);
            setAppState('running');
            
            syncIntervalRef.current = setInterval(syncRouteFromBackground, 2000);
            timerRef.current = setInterval(() => { 
               durationRef.current += 1;
               setDuration(durationRef.current); 
            }, 1000);
            return true;
        }
    }
    return false;
  };

  const loadBaseLeaderboard = async () => {
    setIsLeaderboardLoading(true);
    const data = await fetchLeaderboard(); 
    setBaseLeaderboard(data || []);
    setIsLeaderboardLoading(false);
  };

  useEffect(() => {
    if (!baseLeaderboard || baseLeaderboard.length === 0) return;

    let multiplier = 1; 
    if (filter === 'Week') multiplier = 7;
    if (filter === 'Month') multiplier = 30;
    if (filter === 'All Time') multiplier = 365;

    const adjustedData = baseLeaderboard.map(u => ({
      ...u,
      km: ((u.steps || 0) / 1312) * multiplier 
    })).sort((a, b) => b.km - a.km);

    setLeaderboard(adjustedData);
  }, [filter, baseLeaderboard]); 

  useEffect(() => {
    if (userData && userData.history) {
      const runs = userData.history.filter(h => h.type === 'gps_run' || h.route).reverse();
      setRunHistory(runs);
    }
  }, [userData]);

  const cleanupBackgroundTracking = async () => {
    const hasTask = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (hasTask) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    await AsyncStorage.removeItem('@route_queue');
    await AsyncStorage.removeItem('@route_full_backup');
  };

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const formatPaceStr = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}'${s}"`;
  };

  const getAvgPace = () => {
    if (distanceRef.current < 0.05) return "--'--\"";
    const paceSecs = durationRef.current / distanceRef.current; 
    return formatPaceStr(paceSecs);
  };

  const syncRouteFromBackground = async () => {
    try {
        const queueStr = await AsyncStorage.getItem('@route_queue');
        if (!queueStr) return;
        
        const newPoints = JSON.parse(queueStr);
        if (newPoints.length === 0) return;
        
        await AsyncStorage.removeItem('@route_queue');
        
        setRoute(currentRoute => {
            let newDistanceTotal = distanceRef.current;
            let lastPoint = currentRoute.length > 0 ? currentRoute[currentRoute.length - 1] : null;
            
            for (const newPoint of newPoints) {
                const currentSpeed = newPoint.speed && newPoint.speed > 0 ? newPoint.speed : 0;
                if (currentSpeed > 0.5) { 
                    const paceSecsPerKm = 1000 / currentSpeed;
                    if (paceSecsPerKm < 3600) { 
                        setCurrentPace(formatPaceStr(paceSecsPerKm));
                    }
                } else {
                    setCurrentPace("--'--");
                }

                if (lastPoint) {
                    const distAdded = calculateDistance(lastPoint, newPoint);
                    if (distAdded >= 0.005) {
                        newDistanceTotal += distAdded;
                        
                        const currentKm = Math.floor(newDistanceTotal);
                        if (currentKm > lastMilestoneRef.current) {
                            const now = Date.now();
                            const splitSecs = Math.floor((now - lastKmTimeRef.current) / 1000);
                            const newSplit = { km: currentKm, pace: formatPaceStr(splitSecs), timeSecs: splitSecs, overallTime: durationRef.current };
                            
                            splitsRef.current.push(newSplit);
                            lastMilestoneRef.current = currentKm;
                            lastKmTimeRef.current = now;

                            player.seekTo(0); 
                            player.play(); 
                            Vibration.vibrate(500);
                            
                            setMilestoneSplash(newSplit);
                            setTimeout(() => setMilestoneSplash(null), 8000); 
                        }
                    }
                }
                lastPoint = newPoint;
            }
            
            distanceRef.current = newDistanceTotal;
            setDistance(newDistanceTotal);

            const mergedRoute = [...currentRoute, ...newPoints];

            if (mergedRoute.length > 0 && mapRef.current) {
                mapRef.current.animateCamera({
                    center: mergedRoute[mergedRoute.length - 1],
                    pitch: 0,
                    zoom: 16.5, 
                }, { duration: 1000 });
            }

            AsyncStorage.setItem('@route_full_backup', JSON.stringify(mergedRoute));

            return mergedRoute;
        });
    } catch (e) {
        console.log("Error syncing route to UI:", e);
    }
  };

  const startRun = async () => {
    setIsGpsLocking(true); 

    InteractionManager.runAfterInteractions(async () => {
      try {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') {
          setIsGpsLocking(false);
          Alert.alert('Permission Denied', 'Foreground location access is required.');
          return;
        }

        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          setIsGpsLocking(false);
          Alert.alert('Permission Required', 'Background location access is required to track your run while your phone is locked. Please update your settings to "Allow all the time".');
          return;
        }

        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          setIsGpsLocking(false);
          Alert.alert('Location Disabled', 'Please enable Location Services in your phone settings.');
          return;
        }

        await cleanupBackgroundTracking();

        const initialPos = await Location.getCurrentPositionAsync({
          accuracy: Platform.OS === 'android' ? Location.Accuracy.Balanced : Location.Accuracy.BestForNavigation,
        });

        const initialRoutePoint = { 
            latitude: initialPos.coords.latitude, 
            longitude: initialPos.coords.longitude,
            speed: 0,
            timestamp: initialPos.timestamp
        };

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        
        distanceRef.current = 0;
        durationRef.current = 0;
        
        setRoute([initialRoutePoint]); 
        setDistance(0); 
        setDuration(0); 
        setCurrentPace("--'--");
        
        lastMilestoneRef.current = 0;
        lastKmTimeRef.current = Date.now();
        splitsRef.current = [];
        setMilestoneSplash(null);
        setAppState('running');
        setIsGpsLocking(false);

        timerRef.current = setInterval(() => { 
            durationRef.current += 1;
            setDuration(durationRef.current); 
        }, 1000);
        
        syncIntervalRef.current = setInterval(syncRouteFromBackground, 2000);

        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000, 
          distanceInterval: 5, 
          activityType: Location.ActivityType.Fitness, 
          showsBackgroundLocationIndicator: true,      
          pausesLocationUpdatesAutomatically: false,   
          foregroundService: {
              notificationTitle: "UFitness is tracking your run",
              notificationBody: "Keep moving! Tap to return to the app.",
              notificationColor: "#FF3B30",
          }
        });

      } catch (err) {
        setIsGpsLocking(false);
        Alert.alert('GPS Error', 'Could not get a GPS lock. Ensure you are outdoors.');
      }
    });
  };

  const stopRun = async () => {
    clearInterval(timerRef.current);
    clearInterval(syncIntervalRef.current);
    
    await cleanupBackgroundTracking();

    setMilestoneSplash(null);
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    const safeRoute = route.map(pt => ({ latitude: pt.latitude, longitude: pt.longitude }));
    if (safeRoute.length > 1 && mapRef.current) {
      mapRef.current.fitToCoordinates(safeRoute, { edgePadding: { top: 80, right: 40, bottom: 400, left: 40 }, animated: true });
    }
    
    setAppState('summary');
  };

  const saveAndCloseRun = async () => {
    setIsSaving(true);
    
    const caloriesBurned = Math.round(distanceRef.current * 65); 
    const finalDistance = distanceRef.current;
    
    const newRun = {
      id: `run_${Date.now()}`,
      type: 'gps_run', 
      date: new Date().toISOString(),
      displayDate: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      distance: finalDistance.toFixed(2),
      time: formatTime(durationRef.current),
      durationSeconds: durationRef.current,
      pace: getAvgPace(),
      calories: caloriesBurned,
      route: route,
      splits: splitsRef.current 
    };
    
    try {
        await completeWorkout(Math.floor(durationRef.current/60), caloriesBurned);
        
        const stepsEquivalent = Math.round(finalDistance * 1312);
        if (stepsEquivalent > 0) {
            await updateSteps((userData.stats?.steps || 0) + stepsEquivalent);
        }
        
        if (user) {
             const { updateDoc, arrayUnion, doc } = require('firebase/firestore');
             const { db } = require('../config/firebase');
             await updateDoc(doc(db, 'users', user.uid), {
                  history: arrayUnion(newRun)
             });
        }
    } catch(e) {
        console.log("Offline: GPS Route cached locally.");
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRunHistory([newRun, ...runHistory]);
    setAppState('idle');
    setActiveTab('History'); 
    
    distanceRef.current = 0;
    durationRef.current = 0;
    setRoute([]); setDistance(0); setDuration(0);
    splitsRef.current = [];
    setIsSaving(false);
  };

  const recenterMap = async () => {
    const loc = await Location.getCurrentPositionAsync({});
    mapRef.current?.animateCamera({
      center: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
      pitch: 0, zoom: 16.5
    });
  };

  const renderPodium = () => {
    if (leaderboard.length < 3) return null; 
    const [first, second, third] = leaderboard; 

    return (
      <View style={styles.podiumContainer}>
        <View style={[styles.podiumStep, { marginTop: 50 }]}>
          <View style={styles.avatarContainer}>
            <LinearGradient colors={['#E5E4E2', '#9C9C9C']} style={styles.avatarGlow}>
              {second.profileImage ? (
                <Image source={{ uri: second.profileImage }} style={styles.podiumAvatar} contentFit="cover" />
              ) : (
                <View style={styles.podiumAvatarPlaceholder}><Text style={styles.avatarInitial}>{second.name[0]}</Text></View>
              )}
            </LinearGradient>
            <View style={[styles.rankBadge, { backgroundColor: '#C0C0C0' }]}><Text style={styles.rankText}>2</Text></View>
          </View>
          <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>{second.name}</Text>
          <Text style={styles.podiumScore}>{second.km.toFixed(1)} km</Text>
        </View>

        <View style={styles.podiumStep}>
          <View style={[styles.avatarContainer, styles.firstPlaceContainer]}>
            <LinearGradient colors={['#FFE259', '#FFA751']} style={styles.avatarGlowLarge}>
              {first.profileImage ? (
                <Image source={{ uri: first.profileImage }} style={styles.podiumAvatarLarge} contentFit="cover" />
              ) : (
                <View style={styles.podiumAvatarPlaceholderLarge}><Text style={[styles.avatarInitialLarge, { color: '#000' }]}>{first.name[0]}</Text></View>
              )}
            </LinearGradient>
            <View style={[styles.rankBadge, { backgroundColor: '#FFD700', bottom: -5 }]}><Text style={[styles.rankText, {color: '#000'}]}>1</Text></View>
          </View>
          <Text style={[styles.podiumNameLarge, { color: colors.text }]} numberOfLines={1}>{first.name}</Text>
          <Text style={styles.podiumScoreLarge}>{first.km.toFixed(1)} km</Text>
        </View>

        <View style={[styles.podiumStep, { marginTop: 50 }]}>
          <View style={styles.avatarContainer}>
            <LinearGradient colors={['#FFB75E', '#ED8F03']} style={styles.avatarGlow}>
              {third.profileImage ? (
                <Image source={{ uri: third.profileImage }} style={styles.podiumAvatar} contentFit="cover" />
              ) : (
                <View style={styles.podiumAvatarPlaceholder}><Text style={styles.avatarInitial}>{third.name[0]}</Text></View>
              )}
            </LinearGradient>
            <View style={[styles.rankBadge, { backgroundColor: '#CD7F32' }]}><Text style={styles.rankText}>3</Text></View>
          </View>
          <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>{third.name}</Text>
          <Text style={styles.podiumScore}>{third.km.toFixed(1)} km</Text>
        </View>
      </View>
    );
  };

  const renderItem = ({ item, index }) => {
    if (index < 3) return null; 
    const isMe = userData && item.id === userData.id; 

    return (
      <View style={[styles.listItem, { backgroundColor: isMe ? (isDark ? 'rgba(58, 183, 255, 0.15)' : '#E3F2FD') : colors.surface, borderColor: isMe ? '#3ab7ff' : (isDark ? '#222' : '#E5E5EA'), borderWidth: 1 }]}>
        <Text style={[styles.listRank, { color: colors.textDim }]}>{index + 1}</Text>
        {item.profileImage ? (
          <Image source={{ uri: item.profileImage }} style={styles.listAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.listAvatarPlaceholder, { backgroundColor: colors.border }]}><Text style={[styles.listInitial, { color: colors.text }]}>{item.name[0]}</Text></View>
        )}
        <View style={styles.listInfo}>
          <Text style={[styles.listName, { color: colors.text }]}>{isMe ? 'You' : item.name}</Text>
          <Text style={[styles.listSteps, { color: colors.primary }]}>{item.km.toFixed(1)} <Text style={{color: colors.textDim, fontSize: 12}}>km</Text></Text>
        </View>
      </View>
    );
  };

  if (appState === 'fullMapDetail' && selectedRun) {
    const safeCoordinates = selectedRun.route?.map(pt => ({
      latitude: pt.latitude,
      longitude: pt.longitude
    })) || [];

    return (
      <View style={styles.container}>
        <MapView
          style={StyleSheet.absoluteFill}
          userInterfaceStyle={theme}
          provider={PROVIDER_GOOGLE} 
          initialRegion={safeCoordinates.length > 0 ? {
            latitude: safeCoordinates[0].latitude,
            longitude: safeCoordinates[0].longitude,
            latitudeDelta: 0.01, longitudeDelta: 0.01
          } : undefined}
          onMapReady={() => {
            setTimeout(() => {
              if (fullMapRef.current && safeCoordinates.length > 1) {
                fullMapRef.current.fitToCoordinates(safeCoordinates, { 
                  edgePadding: { top: 100, right: 50, bottom: 100, left: 50 }, 
                  animated: true 
                });
              }
            }, 400);
          }}
          ref={fullMapRef}
        >
          {safeCoordinates.length > 1 && (
            <>
              <Polyline coordinates={safeCoordinates} strokeColor="#FF3B30" strokeWidth={6} lineCap="round" lineJoin="round" zIndex={10} />
              <Marker coordinate={safeCoordinates[0]} zIndex={11}>
                <View style={[styles.mapMarker, { borderColor: '#32D74B' }]} />
              </Marker>
              <Marker coordinate={safeCoordinates[safeCoordinates.length - 1]} zIndex={11}>
                <View style={[styles.mapMarker, { borderColor: '#FF3B30' }]} />
              </Marker>
            </>
          )}
        </MapView>
        
        <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={[styles.fullMapHeader, { paddingTop: insets.top + 10, overflow: 'hidden' }]}>
          <View style={styles.fullMapHeaderInner}>
            <TouchableOpacity style={styles.iconCircle} onPress={() => {}}>
              <Ionicons name="share-outline" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.fullMapTitle, { color: colors.text }]}>{selectedRun.distance} KM Outdoor Run</Text>
            <TouchableOpacity style={styles.iconCircle} onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setAppState('historyDetail');
            }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    );
  }

  if (appState === 'historyDetail' && selectedRun) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#F2F2F7' }]}> 
        <View style={[styles.detailHeaderNav, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity 
            style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(50,50,50,0.6)' : 'rgba(200,200,200,0.6)' }]} 
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAppState('idle'); }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.detailHeaderTitleText, { color: colors.text }]}>{selectedRun.displayDate}</Text>
          <TouchableOpacity style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(50,50,50,0.6)' : 'rgba(200,200,200,0.6)' }]}>
             <Ionicons name="share-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 50}}>
          
          <View style={styles.activityInfoHeader}>
            <View style={styles.activityIconWrapper}>
              <Ionicons name="walk" size={40} color="#a4e402" style={{marginLeft: 4}} />
            </View>
            <View style={styles.activityInfoText}>
              <Text style={[styles.activityTitle, { color: colors.text }]}>Outdoor Run</Text>
              <Text style={styles.activitySubText}>{formatTimeSpan(selectedRun.date, selectedRun.durationSeconds)}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="navigate" size={12} color="#8E8E93" />
                <Text style={[styles.activitySubText, { marginLeft: 4 }]}>Baguio</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity 
            activeOpacity={0.9} 
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAppState('fullMapDetail'); }}
            style={styles.mapPreviewCardHero}
          >
            <View pointerEvents="none" style={styles.mapPreviewContainer}>
              <MapView
                style={StyleSheet.absoluteFill}
                userInterfaceStyle={theme}
                provider={PROVIDER_GOOGLE} 
                initialRegion={selectedRun.route?.length > 0 ? {
                  latitude: selectedRun.route[0].latitude,
                  longitude: selectedRun.route[0].longitude,
                  latitudeDelta: 0.01, longitudeDelta: 0.01
                } : undefined}
                onMapReady={() => {
                  setTimeout(() => {
                    if (detailMapRef.current && selectedRun.route?.length > 1) {
                      const safeCoords = selectedRun.route.map(pt => ({ latitude: pt.latitude, longitude: pt.longitude }));
                      detailMapRef.current.fitToCoordinates(safeCoords, { 
                        edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, 
                        animated: false 
                      });
                    }
                  }, 400);
                }}
                ref={detailMapRef}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                {selectedRun.route?.length > 1 && (
                  <Polyline 
                    coordinates={selectedRun.route.map(pt => ({ latitude: pt.latitude, longitude: pt.longitude }))} 
                    strokeColor="#FF3B30" 
                    strokeWidth={5} 
                    lineCap="round" 
                    lineJoin="round" 
                    zIndex={10} 
                  />
                )}
              </MapView>
            </View>
          </TouchableOpacity>

          <View style={[styles.appleMetricsGrid, { backgroundColor: isDark ? '#1C1C1E' : '#FFF' }]}>
            <View style={styles.appleMetricsRow}>
              <View style={styles.appleMetricBox}>
                <Text style={styles.appleMetricLabel}>Distance</Text>
                <Text style={[styles.appleMetricValue, {color: '#FF3B30'}]}>{selectedRun.distance}<Text style={styles.appleMetricUnit}>KM</Text></Text>
              </View>
              <View style={styles.appleMetricBox}>
                <Text style={styles.appleMetricLabel}>Calories</Text>
                <Text style={[styles.appleMetricValue, {color: '#FF3B30'}]}>{selectedRun.calories || Math.round(selectedRun.distance * 65)}<Text style={styles.appleMetricUnit}>CAL</Text></Text>
              </View>
            </View>
            <View style={[styles.appleGridDivider, { backgroundColor: isDark ? '#333' : '#E5E5EA' }]} />
            <View style={styles.appleMetricsRow}>
              <View style={styles.appleMetricBox}>
                <Text style={styles.appleMetricLabel}>Total Time</Text>
                <Text style={[styles.appleMetricValue, {color: '#a4e402'}]}>{selectedRun.time}</Text>
              </View>
              <View style={styles.appleMetricBox}>
                <Text style={styles.appleMetricLabel}>Avg. Pace</Text>
                <Text style={[styles.appleMetricValue, {color: '#64D2FF'}]}>{selectedRun.pace}<Text style={styles.appleMetricUnit}>/KM</Text></Text>
              </View>
            </View>
          </View>

          {selectedRun.splits && selectedRun.splits.length > 0 && (
            <View style={{paddingHorizontal: 16}}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitleText, { color: colors.text }]}>Splits</Text>
                <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
              </View>
              <View style={[styles.splitsCardContainer, { backgroundColor: isDark ? '#1C1C1E' : '#FFF' }]}>
                <View style={[styles.splitHeaderRow, { borderBottomColor: isDark ? '#333' : '#E5E5EA' }]}>
                  <Text style={[styles.splitHeaderText, { width: 40 }]}>KM</Text>
                  <Text style={[styles.splitHeaderText, { flex: 1, textAlign: 'center' }]}>Time</Text>
                  <Text style={[styles.splitHeaderText, { flex: 1, textAlign: 'right' }]}>Pace</Text>
                </View>
                {selectedRun.splits.map((split, i) => (
                  <View key={i} style={[styles.splitDataRow, { borderBottomColor: isDark ? '#333' : '#E5E5EA', borderBottomWidth: i === selectedRun.splits.length - 1 ? 0 : 1 }]}>
                    <Text style={[styles.splitDataValue, { width: 40, color: colors.text }]}>{split.km}</Text>
                    <Text style={[styles.splitDataValue, { flex: 1, textAlign: 'center', color: '#FFD700' }]}>{formatTime(split.timeSecs)}</Text>
                    <Text style={[styles.splitDataValue, { flex: 1, textAlign: 'right', color: '#64D2FF' }]}>{split.pace}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      </View>
    );
  }

  if (appState === 'idle') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        
        <View style={styles.headerContainer}>
          <View style={styles.topRow}>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Compete</Text>
            <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/profile')}>
               {userData?.profileImage ? (
                  <Image source={{ uri: userData.profileImage }} style={styles.profileImg} contentFit="cover" />
               ) : (
                  <Ionicons name="person-circle" size={44} color={colors.textDim} />
               )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.segmentedControl, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'Leaderboard' && [styles.segmentActive, { backgroundColor: isDark ? '#2C2C2E' : '#FFF' }]]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('Leaderboard'); }}>
            <Text style={[styles.segmentText, { color: activeTab === 'Leaderboard' ? colors.text : colors.textDim }]}>Leaderboards</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'History' && [styles.segmentActive, { backgroundColor: isDark ? '#2C2C2E' : '#FFF' }]]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setActiveTab('History'); }}>
            <Text style={[styles.segmentText, { color: activeTab === 'History' ? colors.text : colors.textDim }]}>My Activities</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'Leaderboard' ? (
          <>
            <View style={styles.filterRow}>
              {['Today', 'Week', 'Month', 'All Time'].map((f) => (
                <TouchableOpacity key={f} style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.surface, borderColor: filter === f ? colors.primary : (isDark ? '#333' : '#E5E5EA'), borderWidth: 1 }]} onPress={() => setFilter(f)}>
                  <Text style={[styles.filterText, { color: filter === f ? '#000' : colors.text }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {isLeaderboardLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
            ) : (
              <FlatList
                data={leaderboard}
                keyExtractor={item => item.id}
                ListHeaderComponent={renderPodium}
                renderItem={renderItem}
                contentContainerStyle={{ paddingBottom: 150, paddingHorizontal: 20 }} 
                showsVerticalScrollIndicator={false}
                onRefresh={loadBaseLeaderboard}
                refreshing={isLeaderboardLoading}
              />
            )}
          </>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 150, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
            {runHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="map-outline" size={64} color={colors.border} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Activities Yet</Text>
                <Text style={{color: colors.textDim, marginTop: 8}}>Your recorded runs will appear here.</Text>
              </View>
            ) : (
              runHistory.map((run) => (
                <TouchableOpacity 
                  key={run.id} 
                  activeOpacity={0.8}
                  style={[styles.premiumHistoryCard, { backgroundColor: colors.surface, borderColor: isDark ? '#222' : '#E5E5EA' }]}
                  onPress={() => { 
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setSelectedRun(run); 
                    setAppState('historyDetail'); 
                  }}
                >
                  <View style={styles.phcHeader}>
                    <View style={styles.phcIconBg}>
                      <Ionicons name="walk" size={20} color="#FFF" style={{marginLeft: 2}} />
                    </View>
                    <View style={{flex: 1, marginLeft: 12}}>
                      <Text style={[styles.phcTitle, { color: colors.text }]}>Outdoor Run</Text>
                      <Text style={[styles.phcDate, { color: colors.textDim }]}>{run.displayDate || run.date}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
                  </View>
                  
                  <View style={styles.phcMetrics}>
                    <View style={styles.phcMetricBox}>
                      <Text style={[styles.phcMetricValue, { color: colors.text }]}>{run.distance}</Text>
                      <Text style={styles.phcMetricLabel}>KM</Text>
                    </View>
                    <View style={styles.phcMetricBox}>
                      <Text style={[styles.phcMetricValue, { color: colors.text }]}>{run.pace}</Text>
                      <Text style={styles.phcMetricLabel}>PACE</Text>
                    </View>
                    <View style={styles.phcMetricBox}>
                      <Text style={[styles.phcMetricValue, { color: colors.text }]}>{run.time}</Text>
                      <Text style={styles.phcMetricLabel}>TIME</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}

        <LinearGradient colors={['transparent', colors.background, colors.background]} style={[styles.actionContainer, { paddingBottom: insets.bottom + 100, paddingTop: 40 }]}>
          <TouchableOpacity style={[styles.startBtn, { backgroundColor: colors.primary }]} activeOpacity={0.8} onPress={startRun}>
            <Text style={[styles.startBtnText, { color: '#000' }]}>Start Run</Text>
            <Ionicons name="play" size={24} color="#000" />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE} 
        userInterfaceStyle={theme} 
        showsUserLocation={false} 
        followsUserLocation={false} 
        showsCompass={false}
        mapPadding={{ top: 0, right: 0, bottom: 200, left: 0 }} 
      >
        {route.length > 0 && <Polyline coordinates={route.map(pt => ({latitude: pt.latitude, longitude: pt.longitude}))} strokeColor={colors.primary} strokeWidth={8} lineCap="round" lineJoin="round" zIndex={10} />}
        
        {appState === 'running' && route.length > 0 && (
          <Marker coordinate={route[route.length - 1]} anchor={{x: 0.5, y: 0.5}} zIndex={11}>
             <View style={styles.liveUserDot}>
               <View style={styles.liveUserDotInner} />
             </View>
          </Marker>
        )}
      </MapView>

      {isGpsLocking && appState === 'idle' && (
        <View style={styles.warmupOverlay}>
           <BlurView intensity={80} tint="dark" style={styles.warmupInner}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.warmupText}>Getting GPS Lock...</Text>
           </BlurView>
        </View>
      )}

      {appState === 'running' && milestoneSplash && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}>
           <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={styles.splashOverlay}>
             <Ionicons name="flash" size={64} color={colors.primary} style={{marginBottom: 20}} />
             <Text style={[styles.splashTitle, {color: colors.text}]}>MILESTONE</Text>
             <Text style={[styles.splashKm, {color: colors.primary}]}>{milestoneSplash.km} KM</Text>
             <View style={[styles.splashDataContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
               <View style={styles.splashDataBox}>
                 <Text style={[styles.splashDataValue, {color: colors.text}]}>{milestoneSplash.pace}</Text>
                 <Text style={styles.splashDataLabel}>SPLIT PACE</Text>
               </View>
               <View style={[styles.splashDivider, {backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}]} />
               <View style={styles.splashDataBox}>
                 <Text style={[styles.splashDataValue, {color: colors.text}]}>{formatTime(duration)}</Text>
                 <Text style={styles.splashDataLabel}>TOTAL TIME</Text>
               </View>
             </View>
             <TouchableOpacity style={[styles.splashBtn, {backgroundColor: colors.primary}]} onPress={() => setMilestoneSplash(null)}>
               <Text style={[styles.splashBtnText, {color: '#000'}]}>DISMISS</Text>
             </TouchableOpacity>
           </BlurView>
        </View>
      )}

      {appState === 'running' && !milestoneSplash && (
        <>
          <TouchableOpacity style={[styles.recenterBtn, { top: insets.top + 20 }]} onPress={recenterMap}>
            <Ionicons name="locate" size={26} color={colors.primary} />
          </TouchableOpacity>

          <View style={[styles.runningOverlay, { paddingBottom: insets.bottom + 110 }]}> 
            <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={[styles.minimalPill, {overflow: 'hidden'}]}>
              <View style={styles.pillLeft}>
                <View style={styles.liveDot} />
                <Text style={[styles.pillTimeSmall, { color: colors.textDim }]}>{formatTime(duration)}</Text>
              </View>
              <View style={[styles.pillDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
              <View style={styles.pillStatGroup}>
                <Text style={[styles.pillPace, { color: colors.text }]}>{currentPace}</Text>
                <Text style={styles.pillLabelSmall}>PACE</Text>
              </View>
              <View style={[styles.pillDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
              <View style={styles.pillStatGroup}>
                <Text style={[styles.pillDistance, { color: colors.text }]}>{distance.toFixed(2)}</Text>
                <Text style={styles.pillLabel}>KM</Text>
              </View>
              <TouchableOpacity style={styles.pillStopBtn} onPress={stopRun}>
                <View style={styles.stopSquare} />
              </TouchableOpacity>
            </BlurView>
          </View>
        </>
      )}

      {appState === 'summary' && (
        <View style={[styles.summaryOverlay, { paddingBottom: insets.bottom + 110 }]}> 
          <BlurView intensity={95} tint={isDark ? 'dark' : 'light'} style={[styles.summarySaveSheet, {overflow: 'hidden'}]}>
            <View style={styles.summarySaveHeader}>
              <Text style={[styles.summarySaveTitle, { color: colors.text }]}>Workout Summary</Text>
              <Text style={[styles.summarySaveSub, { color: colors.textDim }]}>{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
            </View>
            <View style={styles.summarySaveMain}>
              <Text style={[styles.summarySaveMainValue, { color: colors.text }]}>{distance.toFixed(2)}</Text>
              <Text style={styles.summarySaveMainLabel}>KILOMETERS</Text>
            </View>
            <View style={[styles.summarySaveGrid, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }]}>
              <View style={styles.summarySaveBox}>
                <Text style={styles.summarySaveBoxLabel}>TIME</Text>
                <Text style={[styles.summarySaveBoxValue, { color: colors.text }]}>{formatTime(duration)}</Text>
              </View>
              <View style={[styles.summarySaveBoxDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
              <View style={styles.summarySaveBox}>
                <Text style={styles.summarySaveBoxLabel}>AVG PACE</Text>
                <Text style={[styles.summarySaveBoxValue, { color: colors.text }]}>{getAvgPace()}</Text>
              </View>
              <View style={[styles.summarySaveBoxDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
              <View style={styles.summarySaveBox}>
                <Text style={styles.summarySaveBoxLabel}>CALORIES</Text>
                <Text style={[styles.summarySaveBoxValue, { color: colors.text }]}>{Math.round(distance * 65)}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.saveRecordBtn, { backgroundColor: colors.primary }]} onPress={saveAndCloseRun} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color="#000" /> : <Text style={[styles.saveRecordBtnText, { color: '#000' }]}>SAVE TO HISTORY</Text>}
            </TouchableOpacity>
          </BlurView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerContainer: { paddingHorizontal: 20, paddingTop: 10, marginBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  screenTitle: { fontSize: 36, fontWeight: '900', letterSpacing: -0.5 },
  profileBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  profileImg: { width: '100%', height: '100%' },
  segmentedControl: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 16, padding: 4, marginBottom: 20 },
  segmentBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14 },
  segmentActive: { shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 15, fontWeight: '700' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10 },
  filterChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 24, marginRight: 10 },
  filterText: { fontSize: 14, fontWeight: '800' },
  podiumContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 40, marginTop: 20 },
  podiumStep: { alignItems: 'center', width: 100 },
  avatarContainer: { marginBottom: 12, position: 'relative', alignItems: 'center' },
  avatarGlow: { padding: 4, borderRadius: 40 },
  avatarGlowLarge: { padding: 5, borderRadius: 50 },
  podiumAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#111' },
  podiumAvatarPlaceholder: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: '#333', borderWidth: 2, borderColor: '#111' },
  firstPlaceContainer: { transform: [{ scale: 1.1 }] },
  podiumAvatarLarge: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#111' },
  podiumAvatarPlaceholderLarge: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#333', borderWidth: 2, borderColor: '#111' },
  avatarInitial: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  avatarInitialLarge: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  rankBadge: { position: 'absolute', bottom: -10, alignSelf: 'center', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#111' },
  rankText: { fontSize: 12, fontWeight: '900', color: '#FFF' },
  podiumName: { fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  podiumScore: { fontSize: 12, color: '#8E8E93', fontWeight: '800', marginTop: 2 },
  podiumNameLarge: { fontSize: 15, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  podiumScoreLarge: { fontSize: 14, color: '#FFD700', fontWeight: '900', marginTop: 2 },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 24, marginBottom: 12 },
  listRank: { width: 36, fontSize: 18, fontWeight: '900' },
  listAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 16 },
  listAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  listInitial: { fontSize: 18, fontWeight: '900' },
  listInfo: { flex: 1 },
  listName: { fontSize: 17, fontWeight: '800' },
  listSteps: { fontSize: 15, fontWeight: '900', marginTop: 2 },
  premiumHistoryCard: { borderRadius: 28, padding: 20, marginBottom: 16, borderWidth: 1 },
  phcHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  phcIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3ab7ff', justifyContent: 'center', alignItems: 'center' },
  phcTitle: { fontSize: 16, fontWeight: '900' },
  phcDate: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  phcMetrics: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(150,150,150,0.05)', borderRadius: 16, padding: 16 },
  phcMetricBox: { alignItems: 'flex-start' },
  phcMetricValue: { fontSize: 20, fontWeight: '900' },
  phcMetricLabel: { fontSize: 11, fontWeight: '800', color: '#8E8E93', marginTop: 4, letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 22, fontWeight: '900', marginTop: 16 },
  actionContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  startBtn: { flexDirection: 'row', paddingHorizontal: 40, paddingVertical: 20, borderRadius: 40, alignItems: 'center' },
  startBtnText: { fontSize: 20, fontWeight: '900', marginRight: 12, letterSpacing: 0.5 },
  splashOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  splashTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  splashKm: { fontSize: 72, fontWeight: '900', letterSpacing: -2, marginBottom: 40 },
  splashDataContainer: { flexDirection: 'row', width: '100%', borderRadius: 24, padding: 20, marginBottom: 40 },
  splashDataBox: { flex: 1, alignItems: 'center' },
  splashDataValue: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  splashDataLabel: { fontSize: 12, fontWeight: '800', color: '#8E8E93', letterSpacing: 1, marginTop: 4 },
  splashDivider: { width: 1, height: '80%', alignSelf: 'center' },
  splashBtn: { paddingHorizontal: 40, paddingVertical: 18, borderRadius: 30 },
  splashBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  recenterBtn: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(28, 28, 30, 0.9)', justifyContent: 'center', alignItems: 'center' },
  runningOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, alignItems: 'center' },
  minimalPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 40, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, width: '100%' },
  pillLeft: { flexDirection: 'row', alignItems: 'center', minWidth: 60 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', marginRight: 6 },
  pillTimeSmall: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pillDivider: { width: 1, height: 28, marginHorizontal: 8 },
  pillStatGroup: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  pillPace: { fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.5, marginRight: 4 },
  pillDistance: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1, marginRight: 4 },
  pillLabel: { fontSize: 12, fontWeight: '900', color: '#8E8E93' },
  pillLabelSmall: { fontSize: 10, fontWeight: '900', color: '#8E8E93' },
  pillStopBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  stopSquare: { width: 14, height: 14, backgroundColor: '#FFF', borderRadius: 3 },
  summaryOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16 },
  summarySaveSheet: { borderRadius: 36, padding: 24, borderWidth: 1 },
  summarySaveHeader: { alignItems: 'center', marginBottom: 20 },
  summarySaveTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  summarySaveSub: { fontSize: 12, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  summarySaveMain: { alignItems: 'center', marginBottom: 24 },
  summarySaveMainValue: { fontSize: 64, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -2, lineHeight: 68 },
  summarySaveMainLabel: { fontSize: 13, fontWeight: '800', color: '#8E8E93', letterSpacing: 2 },
  summarySaveGrid: { flexDirection: 'row', borderRadius: 20, paddingVertical: 16, marginBottom: 24 },
  summarySaveBox: { flex: 1, alignItems: 'center' },
  summarySaveBoxLabel: { fontSize: 10, fontWeight: '800', color: '#8E8E93', letterSpacing: 1, marginBottom: 6 },
  summarySaveBoxValue: { fontSize: 18, fontWeight: '900' },
  summarySaveBoxDivider: { width: 1, height: '100%' },
  saveRecordBtn: { paddingVertical: 20, borderRadius: 28, alignItems: 'center' },
  saveRecordBtnText: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  detailHeaderNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  detailHeaderTitleText: { fontSize: 18, fontWeight: '700' },
  activityInfoHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 24 },
  activityIconWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(164, 228, 2, 0.15)', justifyContent: 'center', alignItems: 'center' },
  activityInfoText: { flex: 1, marginLeft: 16 },
  activityTitle: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  activitySubText: { fontSize: 16, color: '#8E8E93', marginBottom: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  mapPreviewCardHero: { marginHorizontal: 16, height: 260, marginBottom: 32, borderRadius: 24, overflow: 'hidden' }, 
  mapPreviewContainer: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  appleMetricsGrid: { paddingVertical: 10, marginBottom: 24 },
  appleMetricsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20 },
  appleMetricBox: { flex: 1 },
  appleMetricLabel: { fontSize: 14, fontWeight: '600', color: '#8E8E93', marginBottom: 4 },
  appleMetricValue: { fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  appleMetricUnit: { fontSize: 18, fontWeight: '800', letterSpacing: 0 },
  appleGridDivider: { height: 1, marginVertical: 16, marginHorizontal: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  sectionTitleText: { fontSize: 24, fontWeight: '900', marginRight: 4 },
  splitsCardContainer: { borderRadius: 24, paddingVertical: 10, marginBottom: 30 },
  splitHeaderRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1 },
  splitHeaderText: { fontSize: 12, fontWeight: '800', color: '#8E8E93' },
  splitDataRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14 },
  splitDataValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  warmupOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  warmupInner: { padding: 30, borderRadius: 20, alignItems: 'center', overflow: 'hidden' },
  warmupText: { marginTop: 15, color: '#FFF', fontWeight: '700', fontSize: 16 },
  fullMapHeader: { position: 'absolute', top: 0, left: 0, right: 0 },
  fullMapHeaderInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16 },
  fullMapTitle: { fontSize: 16, fontWeight: '900' },
  mapMarker: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 4 },
  liveUserDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(58, 183, 255, 0.3)', justifyContent: 'center', alignItems: 'center' },
  liveUserDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3ab7ff', borderWidth: 2, borderColor: '#FFF' },
});