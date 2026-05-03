import React, { useState, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, 
  useColorScheme, StatusBar, Dimensions, Keyboard, TouchableWithoutFeedback 
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useUser } from '../context/UserContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PALETTE } from '../constants/theme';

const { width } = Dimensions.get('window');

const SetupScreen = () => {
  const theme = useColorScheme() || 'dark';
  const colors = PALETTE[theme];
  const styles = getStyles(theme, colors);
  
  // Destructure our new prompt function from UserContext
  const { completeSetup, syncDefaultCalendar, promptHealthConnectPermissions } = useUser();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Active Bottom Sheet Picker ('dob', 'weight', 'height', or null)
  const [activePicker, setActivePicker] = useState(null);

  // Form State
  const [name, setName] = useState('');
  
  // Date of Birth State
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [dateSelected, setDateSelected] = useState(false);

  // Measurements State
  const [weight, setWeight] = useState(Platform.OS === 'ios' ? '70' : '');
  const [weightUnit, setWeightUnit] = useState('kg');
  
  const [heightCm, setHeightCm] = useState(Platform.OS === 'ios' ? '170' : '');
  const [heightFt, setHeightFt] = useState(Platform.OS === 'ios' ? '5' : '');
  const [heightIn, setHeightIn] = useState(Platform.OS === 'ios' ? '7' : '');
  const [heightUnit, setHeightUnit] = useState('cm');

  // Goals State
  const [stepGoal, setStepGoal] = useState('10000');
  const [hydrationGoal, setHydrationGoal] = useState('2500');
  const [hydrationUnit, setHydrationUnit] = useState('ml');
  
  // Permission States
  const [calendarSynced, setCalendarSynced] = useState(false);
  const [healthSynced, setHealthSynced] = useState(false); // New state for Health Connect

  // Refs for Auto-Focus
  const weightRef = useRef(null);
  const heightRef = useRef(null);
  const heightInRef = useRef(null);

  // --- ACTIONS ---

  const calculateAge = (birthDate) => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setActivePicker(null); 
    if (selectedDate) {
      setDob(selectedDate);
      setDateSelected(true);
    }
  };

  const handleHydrationUnitToggle = (unit) => {
    setHydrationUnit(unit);
    if (unit === 'oz') setHydrationGoal('85');
    else if (unit === 'glasses') setHydrationGoal('10');
    else setHydrationGoal('2500');
  };

  const handleSetupLater = () => {
    Alert.alert(
      "Skip Setup?",
      "We'll use default settings. You can update your profile later.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Skip & Finish", 
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            const defaultData = {
              name: name.trim() || "Student",
              dob: null, age: null, weight: null, height: null, 
              stats: { stepGoal: 10000, hydrationGoal: 2500 },
              preferences: { weightUnit: 'kg', heightUnit: 'cm', hydrationUnit: 'ml', calendarSynced: false }
            };
            await completeSetup(defaultData);
            setLoading(false);
          }
        }
      ]
    );
  };

  const handleNext = () => {
    setActivePicker(null); 
    
    if (step === 1) {
      if (!name.trim()) return Alert.alert("Missing Name", "Please enter your name to continue.");
      const nameRegex = /^[\p{L}\s'-]+$/u;
      if (!nameRegex.test(name.trim())) return Alert.alert("Invalid Name", "Names must only contain letters and no emojis or symbols.");
      if (!dateSelected) return Alert.alert("Missing Date", "Please select your date of birth.");
      
      const age = calculateAge(dob);
      if (age < 13) return Alert.alert("Age Restriction", "You must be at least 13 years old to use this app.");
      if (age > 120) return Alert.alert("Invalid Date", "Please enter a valid date of birth.");

      setStep(2);
    } else if (step === 2) {
      if (Platform.OS === 'android') {
        if (!weight || parseFloat(weight) <= 0 || parseFloat(weight) > 1000) {
          return Alert.alert("Invalid Weight", "Please enter a valid weight.");
        }
        if (heightUnit === 'cm' && (!heightCm || parseFloat(heightCm) <= 50 || parseFloat(heightCm) > 300)) {
          return Alert.alert("Invalid Height", "Please enter a valid height in cm.");
        }
        if (heightUnit === 'ft') {
          const f = parseInt(heightFt || '0');
          const i = parseInt(heightIn || '0');
          if (f < 1 || f > 9 || i < 0 || i > 11) {
            return Alert.alert("Invalid Height", "Please enter a valid height in feet and inches.");
          }
        }
      }
      setStep(3);
    } else if (step === 3) {
      if (!stepGoal || !hydrationGoal) return Alert.alert("Missing Goals", "Please select your daily targets.");
      setStep(4);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    const age = dateSelected ? calculateAge(dob) : null;
    
    const dobString = dateSelected 
      ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`
      : null;
    
    let finalHeight = null;
    if (heightUnit === 'cm' && heightCm) {
      finalHeight = parseFloat(heightCm);
    } else if (heightUnit === 'ft' && (heightFt || heightIn)) {
      const totalInches = (parseInt(heightFt || '0') * 12) + parseInt(heightIn || '0');
      finalHeight = Math.round(totalInches * 2.54); 
    }

    let finalWeight = weight ? parseFloat(weight) : null;
    if (finalWeight && weightUnit === 'lbs') {
      finalWeight = Math.round(finalWeight * 0.453592); 
    }

    let finalHydration = parseInt(hydrationGoal) || 2500;
    if (hydrationUnit === 'oz') {
      finalHydration = Math.round(finalHydration * 29.5735); 
    } else if (hydrationUnit === 'glasses') {
      finalHydration = finalHydration * 250; 
    }

    const setupData = {
      name: name.trim() || "Student",
      dob: dobString,
      age: age,
      weight: finalWeight,
      height: finalHeight,
      stats: {
        stepGoal: parseInt(stepGoal) || 10000,
        hydrationGoal: finalHydration
      },
      preferences: {
        weightUnit: weightUnit,
        heightUnit: heightUnit,
        hydrationUnit: hydrationUnit,
        calendarSynced: calendarSynced 
      }
    };

    await completeSetup(setupData);
    setLoading(false);
  };

  const handleSyncCalendar = async () => {
    const success = await syncDefaultCalendar();
    if (success) {
      setCalendarSynced(true);
      Alert.alert("Synced!", "We've analyzed your schedule to find workout gaps.");
    } else {
      Alert.alert("Permission Error", "Please enable calendar access in your device settings.");
    }
  };

  // --- NEW: Android Health Connect Request Handler ---
  const handleSyncHealthConnect = async () => {
    const success = await promptHealthConnectPermissions();
    if (success) {
      setHealthSynced(true);
      Alert.alert("Connected!", "UFitness is now synced with Android Health Connect.");
    } else {
      Alert.alert("Connection Failed", "Could not connect to Health Connect. Ensure it is installed on your device.");
    }
  };

  // --- HELPER ARRAYS FOR PICKERS (iOS Only) ---
  const weightOptions = Array.from({ length: weightUnit === 'kg' ? 221 : 441 }, (_, i) => String(i + (weightUnit === 'kg' ? 30 : 60)));
  const cmOptions = Array.from({ length: 161 }, (_, i) => String(i + 90));
  const ftOptions = ['3', '4', '5', '6', '7', '8'];
  const inOptions = Array.from({ length: 12 }, (_, i) => String(i));

  const getStepOptions = () => ['3000', '5000', '7500', '10000', '12500', '20000'];
  const getHydrationOptions = () => {
    if (hydrationUnit === 'ml') return ['1500', '2000', '2500', '3000', '4000'];
    if (hydrationUnit === 'oz') return ['50', '68', '85', '100', '135'];
    return ['6', '8', '10', '12', '16']; 
  };

  // --- RENDERERS ---

  const renderProgressBar = () => (
    <View style={styles.progressBarTrack}>
      <View style={[styles.progressBarFill, { width: `${(step / 4) * 100}%` }]} />
    </View>
  );

  const renderStepIcon = () => {
    let iconName = 'person';
    let iconColor = colors.primary;
    if (step === 2) { iconName = 'body'; iconColor = '#FF9500'; } 
    if (step === 3) { iconName = 'flag'; iconColor = '#FFD60A'; } 
    if (step === 4) { iconName = 'shield-checkmark'; iconColor = '#32D74B'; } 
    return (
      <View style={[styles.stepIconCircle, { backgroundColor: iconColor + '15', borderColor: iconColor + '30' }]}>
        <Ionicons name={iconName} size={28} color={iconColor} />
      </View>
    );
  };

  const renderBottomPickerSheet = () => {
    if (!activePicker) return null;
    
    if (activePicker === 'dob' && Platform.OS === 'android') {
      return <DateTimePicker value={dob} mode="date" display="default" onChange={onDateChange} maximumDate={new Date()} />;
    }

    if (Platform.OS === 'android') return null; 

    return (
      <View style={styles.pickerSheet}>
        <View style={styles.pickerToolbar}>
          <TouchableOpacity onPress={() => setActivePicker(null)}>
            <Text style={styles.pickerDoneBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        {activePicker === 'dob' && (
          <View style={styles.centeredPickerContainer}>
            <DateTimePicker 
              value={dob} 
              mode="date" 
              display="spinner" 
              onChange={onDateChange} 
              maximumDate={new Date()} 
              textColor={colors.text} 
            />
          </View>
        )}

        {activePicker === 'weight' && (
          <Picker selectedValue={weight} onValueChange={(val) => setWeight(val)} itemStyle={{ color: colors.text }}>
            {weightOptions.map(val => <Picker.Item key={val} label={`${val} ${weightUnit}`} value={val} />)}
          </Picker>
        )}

        {activePicker === 'height' && heightUnit === 'cm' && (
          <Picker selectedValue={heightCm} onValueChange={(val) => setHeightCm(val)} itemStyle={{ color: colors.text }}>
            {cmOptions.map(val => <Picker.Item key={val} label={`${val} cm`} value={val} />)}
          </Picker>
        )}

        {activePicker === 'height' && heightUnit === 'ft' && (
          <View style={{ flexDirection: 'row' }}>
            <Picker style={{ flex: 1 }} selectedValue={heightFt} onValueChange={(val) => setHeightFt(val)} itemStyle={{ color: colors.text }}>
              {ftOptions.map(val => <Picker.Item key={val} label={`${val} ft`} value={val} />)}
            </Picker>
            <Picker style={{ flex: 1 }} selectedValue={heightIn} onValueChange={(val) => setHeightIn(val)} itemStyle={{ color: colors.text }}>
              {inOptions.map(val => <Picker.Item key={val} label={`${val} in`} value={val} />)}
            </Picker>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={theme === 'dark' ? "light-content" : "dark-content"} />
      
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setActivePicker(null); }}>
        <View style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={styles.container}>
              
              {/* TOP NAV */}
              <View style={styles.topNav}>
                {step > 1 ? (
                  <TouchableOpacity onPress={() => { setStep(step - 1); setActivePicker(null); }} style={styles.navBtn}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                  </TouchableOpacity>
                ) : <View style={{width: 24}} />}
                <TouchableOpacity onPress={handleSetupLater} style={styles.skipBtn}>
                  <Text style={styles.skipText}>Setup Later</Text>
                </TouchableOpacity>
              </View>

              {/* HEADER */}
              <View style={styles.header}>
                <View style={styles.headerRow}>
                   {renderStepIcon()}
                   <View style={{flex:1, marginLeft: 15}}>
                     <Text style={styles.stepIndicator}>STEP {step} OF 4</Text>
                     <Text style={styles.title}>
                       {step === 1 && "Identity"}
                       {step === 2 && "Body Stats"}
                       {step === 3 && "Daily Goals"}
                       {step === 4 && "Permissions"}
                     </Text>
                   </View>
                </View>
                {renderProgressBar()}
              </View>

              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                
                {/* STEP 1: IDENTITY */}
                {step === 1 && (
                  <View style={styles.formSection}>
                    <Text style={styles.label}>FULL NAME (REQUIRED)</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="person-outline" size={20} color={colors.textDim} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your name"
                        placeholderTextColor={colors.textDim}
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        onFocus={() => setActivePicker(null)}
                      />
                    </View>

                    <Text style={[styles.label, { marginTop: 24 }]}>DATE OF BIRTH</Text>
                    <TouchableOpacity 
                      style={styles.inputContainer} 
                      onPress={() => { Keyboard.dismiss(); setActivePicker('dob'); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={20} color={colors.textDim} style={styles.inputIcon} />
                      <Text style={[styles.input, { paddingTop: 18, color: dateSelected ? colors.text : colors.textDim }]}>
                        {dateSelected ? dob.toLocaleDateString() : 'Select your birthdate'}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.tipBox}>
                      <Ionicons name="information-circle" size={16} color={colors.primary} />
                      <Text style={styles.tipText}>Used to calculate age accurately.</Text>
                    </View>
                  </View>
                )}

                {/* STEP 2: MEASUREMENTS */}
                {step === 2 && (
                  <View style={styles.formSection}>
                    
                    {/* WEIGHT */}
                    <View style={{ marginBottom: 20 }}>
                      <View style={styles.metricHeader}>
                        <Text style={[styles.label, { marginBottom: 0 }]}>WEIGHT</Text>
                        <View style={styles.toggleContainer}>
                          <TouchableOpacity onPress={() => { setWeightUnit('kg'); if (Platform.OS==='ios') setWeight('70'); }} style={[styles.toggleBtn, weightUnit === 'kg' && { backgroundColor: colors.primary }]}><Text style={[styles.toggleText, weightUnit === 'kg' && { color: '#FFF' }]}>kg</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => { setWeightUnit('lbs'); if (Platform.OS==='ios') setWeight('150'); }} style={[styles.toggleBtn, weightUnit === 'lbs' && { backgroundColor: colors.primary }]}><Text style={[styles.toggleText, weightUnit === 'lbs' && { color: '#FFF' }]}>lbs</Text></TouchableOpacity>
                        </View>
                      </View>
                      
                      {Platform.OS === 'ios' ? (
                        <TouchableOpacity style={styles.inputContainer} onPress={() => { Keyboard.dismiss(); setActivePicker('weight'); }}>
                          <MaterialCommunityIcons name="scale-bathroom" size={20} color={colors.textDim} style={styles.inputIcon} />
                          <Text style={[styles.input, { paddingTop: 18, color: colors.text }]}>{weight} {weightUnit}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.inputContainer}>
                          <MaterialCommunityIcons name="scale-bathroom" size={20} color={colors.textDim} style={styles.inputIcon} />
                          <TextInput
                            ref={weightRef}
                            style={styles.input}
                            placeholder={`e.g. ${weightUnit === 'kg' ? '70' : '150'}`}
                            placeholderTextColor={colors.textDim}
                            keyboardType="numeric"
                            value={weight}
                            onChangeText={(text) => setWeight(text.replace(/[^0-9]/g, ''))} // Numeric only
                            maxLength={4}
                            returnKeyType="next"
                            onSubmitEditing={() => heightRef.current?.focus()}
                          />
                          <Text style={{ color: colors.textDim, fontWeight: '600' }}>{weightUnit}</Text>
                        </View>
                      )}
                    </View>

                    {/* HEIGHT */}
                    <View>
                      <View style={styles.metricHeader}>
                        <Text style={[styles.label, { marginBottom: 0 }]}>HEIGHT</Text>
                        <View style={styles.toggleContainer}>
                          <TouchableOpacity onPress={() => { setHeightUnit('cm'); if (Platform.OS==='ios') setHeightCm('170'); }} style={[styles.toggleBtn, heightUnit === 'cm' && { backgroundColor: colors.primary }]}><Text style={[styles.toggleText, heightUnit === 'cm' && { color: '#FFF' }]}>cm</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => { setHeightUnit('ft'); if (Platform.OS==='ios') { setHeightFt('5'); setHeightIn('7'); } }} style={[styles.toggleBtn, heightUnit === 'ft' && { backgroundColor: colors.primary }]}><Text style={[styles.toggleText, heightUnit === 'ft' && { color: '#FFF' }]}>ft</Text></TouchableOpacity>
                        </View>
                      </View>
                      
                      {Platform.OS === 'ios' ? (
                        <TouchableOpacity style={styles.inputContainer} onPress={() => { Keyboard.dismiss(); setActivePicker('height'); }}>
                          <MaterialCommunityIcons name="human-male-height" size={20} color={colors.textDim} style={styles.inputIcon} />
                          <Text style={[styles.input, { paddingTop: 18, color: colors.text }]}>
                            {heightUnit === 'cm' ? `${heightCm} cm` : `${heightFt} ft ${heightIn} in`}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        heightUnit === 'cm' ? (
                          <View style={styles.inputContainer}>
                            <MaterialCommunityIcons name="human-male-height" size={20} color={colors.textDim} style={styles.inputIcon} />
                            <TextInput
                              ref={heightRef}
                              style={styles.input}
                              placeholder="e.g. 175"
                              placeholderTextColor={colors.textDim}
                              keyboardType="numeric"
                              value={heightCm}
                              onChangeText={(text) => setHeightCm(text.replace(/[^0-9]/g, ''))}
                              maxLength={3}
                            />
                            <Text style={{ color: colors.textDim, fontWeight: '600' }}>cm</Text>
                          </View>
                        ) : (
                          <View style={styles.row}>
                            <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                              <MaterialCommunityIcons name="human-male-height" size={20} color={colors.textDim} style={styles.inputIcon} />
                              <TextInput
                                ref={heightRef}
                                style={styles.input}
                                placeholder="Ft"
                                placeholderTextColor={colors.textDim}
                                keyboardType="numeric"
                                value={heightFt}
                                onChangeText={(text) => setHeightFt(text.replace(/[^0-9]/g, ''))}
                                maxLength={1}
                                returnKeyType="next"
                                onSubmitEditing={() => heightInRef.current?.focus()}
                              />
                            </View>
                            <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                              <TextInput
                                ref={heightInRef}
                                style={styles.input}
                                placeholder="In"
                                placeholderTextColor={colors.textDim}
                                keyboardType="numeric"
                                value={heightIn}
                                onChangeText={(text) => setHeightIn(text.replace(/[^0-9]/g, ''))}
                                maxLength={2}
                              />
                            </View>
                          </View>
                        )
                      )}
                    </View>

                    <View style={[styles.tipBox, { marginTop: 20 }]}>
                      <Ionicons name="fitness-outline" size={16} color={colors.primary} />
                      <Text style={styles.tipText}>Used to calculate accurate calorie burn.</Text>
                    </View>
                  </View>
                )}

                {/* STEP 3: GOALS */}
                {step === 3 && (
                  <View style={styles.formSection}>
                    <Text style={styles.label}>DAILY STEPS</Text>
                    <View style={[styles.grid, { flexWrap: 'wrap' }]}>
                      {getStepOptions().map(g => (
                        <TouchableOpacity 
                          key={g} 
                          style={[styles.goalCard, { minWidth: '30%', flex: 1 }, stepGoal === g && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                          onPress={() => setStepGoal(g)}
                        >
                           <Ionicons name="footsteps" size={20} color={stepGoal === g ? colors.primary : colors.textDim} />
                           <Text style={[styles.goalCardText, stepGoal === g && { color: colors.primary }]}>
                             {parseInt(g).toLocaleString()}
                           </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    <View style={[styles.metricHeader, { marginTop: 30 }]}>
                      <Text style={[styles.label, { marginBottom: 0 }]}>HYDRATION</Text>
                      <View style={styles.toggleContainer}>
                        <TouchableOpacity onPress={() => handleHydrationUnitToggle('ml')} style={[styles.toggleBtn, hydrationUnit === 'ml' && { backgroundColor: '#0A84FF' }]}><Text style={[styles.toggleText, hydrationUnit === 'ml' && { color: '#FFF' }]}>ml</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleHydrationUnitToggle('oz')} style={[styles.toggleBtn, hydrationUnit === 'oz' && { backgroundColor: '#0A84FF' }]}><Text style={[styles.toggleText, hydrationUnit === 'oz' && { color: '#FFF' }]}>oz</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleHydrationUnitToggle('glasses')} style={[styles.toggleBtn, hydrationUnit === 'glasses' && { backgroundColor: '#0A84FF' }]}><Text style={[styles.toggleText, hydrationUnit === 'glasses' && { color: '#FFF' }]}>glasses</Text></TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.grid, { flexWrap: 'wrap' }]}>
                      {getHydrationOptions().map(h => (
                        <TouchableOpacity 
                          key={h} 
                          style={[styles.goalCard, { minWidth: '30%', flex: 1 }, hydrationGoal === h && { borderColor: '#0A84FF', backgroundColor: '#0A84FF15' }]}
                          onPress={() => setHydrationGoal(h)}
                        >
                           <Ionicons name="water-outline" size={20} color={hydrationGoal === h ? '#0A84FF' : colors.textDim} />
                           <Text style={[styles.goalCardText, hydrationGoal === h && { color: '#0A84FF' }]}>
                             {h} {hydrationUnit === 'glasses' ? 'gl' : hydrationUnit}
                           </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* STEP 4: PERMISSIONS */}
                {step === 4 && (
                  <View style={styles.formSection}>
                     
                     {/* Calendar Sync Card */}
                     <TouchableOpacity 
                       style={[styles.permCard, calendarSynced && { borderColor: '#34C759', backgroundColor: '#34C75910', marginBottom: 15 }]}
                       onPress={handleSyncCalendar} disabled={calendarSynced}
                     >
                       <View style={[styles.iconBox, { backgroundColor: calendarSynced ? '#34C759' : colors.surface }]}>
                          <Ionicons name="calendar" size={28} color={calendarSynced ? "#FFF" : colors.text} />
                       </View>
                       <View style={{flex: 1, paddingHorizontal: 15}}>
                          <Text style={styles.permTitle}>Sync Calendar</Text>
                          <Text style={styles.permDesc}>Required to find "Smart Gaps" in your schedule.</Text>
                       </View>
                       <View style={[styles.checkBox, calendarSynced && { backgroundColor: '#34C759', borderColor: '#34C759' }]}>
                          {calendarSynced && <Ionicons name="checkmark" size={16} color="#FFF" />}
                       </View>
                     </TouchableOpacity>

                     {/* Android Health Connect Card */}
                     {Platform.OS === 'android' && (
                       <TouchableOpacity 
                         style={[styles.permCard, healthSynced && { borderColor: '#FF453A', backgroundColor: '#FF453A10' }]}
                         onPress={handleSyncHealthConnect} disabled={healthSynced}
                       >
                         <View style={[styles.iconBox, { backgroundColor: healthSynced ? '#FF453A' : colors.surface }]}>
                            <MaterialCommunityIcons name="heart-pulse" size={28} color={healthSynced ? "#FFF" : colors.text} />
                         </View>
                         <View style={{flex: 1, paddingHorizontal: 15}}>
                            <Text style={styles.permTitle}>Health Connect</Text>
                            <Text style={styles.permDesc}>Required to sync steps and workouts without draining battery.</Text>
                         </View>
                         <View style={[styles.checkBox, healthSynced && { backgroundColor: '#FF453A', borderColor: '#FF453A' }]}>
                            {healthSynced && <Ionicons name="checkmark" size={16} color="#FFF" />}
                         </View>
                       </TouchableOpacity>
                     )}

                  </View>
                )}

              </ScrollView>

              {/* FOOTER */}
              <View style={styles.footer}>
                {step > 1 && step < 4 && (
                  <TouchableOpacity onPress={() => { handleSkipStep(); setActivePicker(null); }} style={styles.textBtn}>
                    <Text style={styles.textBtnLabel}>Skip</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleNext} style={[styles.primaryBtn, step === 1 && { flex: 1, marginLeft: 0 }]} disabled={loading} activeOpacity={0.8}>
                  <Text style={styles.primaryBtnText}>{loading ? "Saving..." : (step === 4 ? "Finish Setup" : "Continue")}</Text>
                  {!loading && <Ionicons name="arrow-forward" size={20} color="#FFF" />}
                </TouchableOpacity>
              </View>

            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>

      {/* BOTTOM SHEET RENDERED OUTSIDE TOUCHABLE WITHOUT FEEDBACK */}
      {renderBottomPickerSheet()}

    </SafeAreaView>
  );
};

const getStyles = (theme, colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  navBtn: { padding: 8, marginLeft: -8 },
  skipBtn: { padding: 8, marginRight: -8 },
  skipText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },

  header: { marginBottom: 30 },
  headerRow: { flexDirection:'row', alignItems:'center', marginBottom: 20 },
  stepIconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  stepIndicator: { fontSize: 11, fontWeight: '800', color: colors.textDim, letterSpacing: 1, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  progressBarTrack: { height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },

  content: { flexGrow: 1 },
  formSection: { gap: 10 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textDim, marginBottom: 8, marginLeft: 4 },
  
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, height: 58, borderWidth: 1, borderColor: colors.border },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 17, color: colors.text, fontWeight: '600', height: '100%' },
  row: { flexDirection: 'row' },
  
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  toggleContainer: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 8, padding: 2, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  toggleText: { fontSize: 12, fontWeight: '600', color: colors.textDim },

  tipBox: { flexDirection: 'row', backgroundColor: colors.primary + '10', padding: 12, borderRadius: 12, marginTop: 15, alignItems: 'center' },
  tipText: { fontSize: 13, color: colors.text, marginLeft: 10, flex: 1, lineHeight: 18 },

  grid: { flexDirection: 'row', gap: 10 },
  goalCard: { flex: 1, paddingVertical: 15, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 6 },
  goalCardText: { fontSize: 15, fontWeight: '700', color: colors.textDim },

  permCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  permTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 },
  permDesc: { fontSize: 12, color: colors.textDim, lineHeight: 16 },
  checkBox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },

  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  textBtn: { paddingHorizontal: 20, paddingVertical: 15 },
  textBtnLabel: { fontSize: 16, fontWeight: '600', color: colors.textDim },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, height: 56, borderRadius: 28, gap: 8, marginLeft: 10, shadowColor: colors.primary, shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  primaryBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  // Bottom Picker Styles
  pickerSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? 30 : 0 },
  pickerToolbar: { flexDirection: 'row', justifyContent: 'flex-end', padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
  pickerDoneBtn: { color: colors.primary, fontSize: 17, fontWeight: '700' },
  centeredPickerContainer: { width: '100%', alignItems: 'center', justifyContent: 'center' }
});

export default SetupScreen;