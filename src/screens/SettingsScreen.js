import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Switch, 
  useColorScheme, Modal, FlatList, TextInput, ScrollView, Alert, Platform, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router'; 
import { useUser } from '../context/UserContext';
import { PALETTE } from '../constants/theme';

// NEW IMPORT: Needed to check if the Android switch should visually be "ON" 
import { getGrantedPermissions } from 'react-native-health-connect';

// --- PRE-MADE CONSTANTS ---
const STEP_OPTIONS = [ 
  { label: 'Sedentary', value: 3000 }, 
  { label: 'Light Active', value: 5000 }, 
  { label: 'Moderate', value: 7500 }, 
  { label: 'Active', value: 10000 }, 
  { label: 'Very Active', value: 12500 }, 
  { label: 'Athlete', value: 20000 } 
];

const WATER_OPTIONS = [ 
  { label: 'Minimum', value: 1500 }, 
  { label: 'Standard', value: 2000 }, 
  { label: 'Recommended', value: 2500 }, 
  { label: 'High Active', value: 3000 }, 
  { label: 'Gallon Mode', value: 4000 } 
];

const UNIT_OPTIONS = {
  weight: [ { label: 'Kilograms (kg)', value: 'kg' }, { label: 'Pounds (lbs)', value: 'lbs' } ],
  height: [ { label: 'Centimeters (cm)', value: 'cm' }, { label: 'Feet & Inches (ft)', value: 'ft' } ],
  volume: [ { label: 'Milliliters (ml)', value: 'ml' }, { label: 'Ounces (oz)', value: 'oz' }, { label: 'Glasses (240ml)', value: 'glasses' } ],
  energy: [ { label: 'Calories (kcal)', value: 'kcal' }, { label: 'Kilojoules (kJ)', value: 'kJ' } ]
};

const DISPLAY_OPTIONS = [
  { label: 'System Default', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' }
];

// --- COMPONENTS ---
const SettingRow = ({ icon, color, label, value, onPress, isLast, showChevron = true, theme, colors, styles }) => (
  <TouchableOpacity 
    style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }]} 
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
    <View style={styles.rowRight}>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {showChevron && <Ionicons name="chevron-forward" size={16} color={colors.textDim} style={{marginLeft: 4}} />}
    </View>
  </TouchableOpacity>
);

const SectionHeader = ({ title, colors, styles }) => (
  <Text style={[styles.sectionHeader, { color: colors.textDim }]}>{title}</Text>
);

const SettingsScreen = () => {
  const router = useRouter(); 
  const systemTheme = useColorScheme() || 'dark';
  
  const { 
    userData, logout, syncDefaultCalendar, updateDailyGoals, 
    updatePreferences, updateName, updateUserPassword, resetProgress, updateDOB,
    converters, deleteAccount, promptHealthConnectPermissions 
  } = useUser();
  
  const { name, dob, stats, preferences } = userData || {};
  const units = preferences?.units || { weight: 'kg', height: 'cm', volume: 'ml', energy: 'kcal' };
  
  const displayMode = preferences?.displayMode || 'system';
  const theme = displayMode === 'system' ? systemTheme : displayMode;
  const colors = PALETTE[theme];
  const styles = getStyles(theme, colors);

  // --- STATE ---
  const [modalVisible, setModalVisible] = useState(false);
  const [editType, setEditType] = useState(null); 
  const [activeBottomSheet, setActiveBottomSheet] = useState(null); 
  
  const [errorField, setErrorField] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [textInput, setTextInput] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');

  const [tempDate, setTempDate] = useState(new Date());

  const [tempStepGoal, setTempStepGoal] = useState('10000');
  const [tempHydrationGoal, setTempHydrationGoal] = useState('2500');
  const [tempUnit, setTempUnit] = useState(null);
  const [tempDisplayMode, setTempDisplayMode] = useState('system');

  // NEW: State to visually toggle the Android Health Connect switch
  const [isHealthConnectEnabled, setIsHealthConnectEnabled] = useState(false);

  // --- EFFECTS ---
  
  // On load, silently check if Android permissions are already granted 
  // so the switch initializes in the correct visual state.
  useEffect(() => {
    const checkHealthStatus = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await getGrantedPermissions();
          const hasStepsPerm = granted.some(p => p.recordType === 'Steps' && p.accessType === 'read');
          setIsHealthConnectEnabled(hasStepsPerm);
        } catch (e) {
          setIsHealthConnectEnabled(false);
        }
      }
    };
    checkHealthStatus();
  }, []);

  // --- ACTIONS ---
  const calculateAge = (birthDate) => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const handleDeviceToggle = async (val) => {
    if (val) { 
      const success = await syncDefaultCalendar(); 
      updatePreferences({ isAutoSyncEnabled: success }); 
    } else { 
      updatePreferences({ isAutoSyncEnabled: false }); 
    }
  };

  // NEW: Action for the Android Health Connect Switch
  const handleHealthConnectToggle = async (val) => {
    if (val) {
      // User turned the switch ON. Fire the dialog.
      const success = await promptHealthConnectPermissions();
      setIsHealthConnectEnabled(success);
      if (success) {
        Alert.alert("Synced!", "UFitness is now connected to Android Health Connect.");
      }
    } else {
      // User turned the switch OFF. 
      // Note: Android apps cannot programmatically "revoke" their own Health Connect permissions.
      // The user MUST do it from their Android Settings app. We will alert them of this.
      setIsHealthConnectEnabled(false);
      Alert.alert(
        "Permission Revocation", 
        "To fully disconnect UFitness, please open your Android 'Settings' app, go to 'Health Connect', and remove UFitness from the connected apps list."
      );
    }
  };

  const onDateChange = async (event, selectedDate) => {
    if (Platform.OS === 'android') setActiveBottomSheet(null); 
    if (selectedDate) {
      setTempDate(selectedDate);
      if (Platform.OS === 'android') {
         const age = calculateAge(selectedDate);
         if (age < 13) return Alert.alert("Age Restriction", "You must be at least 13 years old.");
         if (age > 120) return Alert.alert("Invalid Date", "Please enter a valid date of birth.");
         const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
         await updateDOB(dateStr, age);
      }
    }
  };

  const getDisplayModeLabel = (val) => {
    if (val === 'light') return 'Light';
    if (val === 'dark') return 'Dark';
    return 'System Default';
  };

  const openEdit = (type) => {
    setEditType(type);
    setErrorField(null);
    setErrorMessage('');
    
    if (['weight', 'height', 'volume', 'energy'].includes(type)) {
      if (Platform.OS === 'ios') {
        setTempUnit(units[type]);
        setActiveBottomSheet(type);
      } else {
        setModalVisible(true);
      }
      return;
    }

    if (type === 'displayMode') {
      if (Platform.OS === 'ios') {
        setTempDisplayMode(displayMode);
        setActiveBottomSheet(type);
      } else {
        setModalVisible(true);
      }
      return;
    }

    if (type === 'name') {
      setTextInput(name || '');
      setModalVisible(true);
      return;
    }
    if (type === 'password') {
      setCurrentPass('');
      setNewPass('');
      setModalVisible(true);
      return;
    }

    if (type === 'dob') {
       if (dob) {
           const parts = dob.split('-');
           if (parts.length === 3) setTempDate(new Date(parts[0], parts[1] - 1, parts[2]));
       } else {
           setTempDate(new Date(2000, 0, 1));
       }
       setActiveBottomSheet('dob');
       return;
    }

    if (type === 'steps') {
        if (Platform.OS === 'ios') {
            setTempStepGoal(stats?.stepGoal?.toString() || '10000');
            setActiveBottomSheet('steps');
        } else {
            setModalVisible(true);
        }
        return;
    }

    if (type === 'hydration') {
        if (Platform.OS === 'ios') {
            setTempHydrationGoal(stats?.hydrationGoal?.toString() || '2500');
            setActiveBottomSheet('hydration');
        } else {
            setModalVisible(true);
        }
        return;
    }
  };

  const handleSelectUnit = (type, value) => {
    const newUnits = { ...units, [type]: value };
    updatePreferences({ units: newUnits });
    setModalVisible(false);
  };

  const handleSelectDisplayMode = (value) => {
    updatePreferences({ displayMode: value });
    setModalVisible(false);
  };

  const handleSelectGoal = (value) => {
    if (editType === 'steps') updateDailyGoals(value, null);
    if (editType === 'hydration') updateDailyGoals(null, value);
    setModalVisible(false);
  };

  const handleSaveText = async () => {
    setErrorField(null);
    setErrorMessage('');

    if (editType === 'name') {
      const nameRegex = /^[\p{L}\s'-]+$/u;
      if (!textInput.trim()) {
        setErrorField('name');
        setErrorMessage("Name cannot be empty.");
        return;
      }
      if (!nameRegex.test(textInput.trim())) {
        setErrorField('name');
        setErrorMessage("Names must only contain letters.");
        return;
      }
      await updateName(textInput.trim());
      setModalVisible(false);
      return;
    }
    
    if (editType === 'password') {
      if (!currentPass) {
        setErrorField('currentPass');
        setErrorMessage("Please enter your current password.");
        return;
      }
      if (newPass.length < 6) {
        setErrorField('newPass');
        setErrorMessage("Password must be at least 6 characters long.");
        return;
      }
      if (newPass.length > 128) {
        setErrorField('newPass');
        setErrorMessage("Password cannot exceed 128 characters.");
        return;
      }
      
      const res = await updateUserPassword(currentPass, newPass);
      if (!res.success) {
        setErrorField('currentPass');
        setErrorMessage("Current password was incorrect.");
        return;
      } else {
        Alert.alert("Success", "Password updated successfully.");
        setModalVisible(false);
        return;
      }
    }
  };

  const handleSaveBottomSheet = async () => {
      if (activeBottomSheet === 'dob') {
         const age = calculateAge(tempDate);
         if (age < 13) return Alert.alert("Age Restriction", "You must be at least 13 years old.");
         if (age > 120) return Alert.alert("Invalid Date", "Please enter a valid date of birth.");
         const dateStr = `${tempDate.getFullYear()}-${String(tempDate.getMonth() + 1).padStart(2, '0')}-${String(tempDate.getDate()).padStart(2, '0')}`;
         await updateDOB(dateStr, age);
      }

      if (activeBottomSheet === 'steps') {
          await updateDailyGoals(parseInt(tempStepGoal), null);
      }

      if (activeBottomSheet === 'hydration') {
          await updateDailyGoals(null, parseInt(tempHydrationGoal));
      }

      if (['weight', 'height', 'volume', 'energy'].includes(activeBottomSheet)) {
          handleSelectUnit(activeBottomSheet, tempUnit);
      }

      if (activeBottomSheet === 'displayMode') {
          updatePreferences({ displayMode: tempDisplayMode });
      }

      setActiveBottomSheet(null);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete Account?",
      "Are you absolutely sure? This will permanently erase your profile, all historical data, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: 'cancel' },
        { 
          text: "Delete Account", 
          style: 'destructive', 
          onPress: async () => {
            if (deleteAccount) {
              const res = await deleteAccount();
              if (res && res.success) {
                Alert.alert("Account Deleted", "Your account has been wiped and you have been securely logged out.");
              } else if (res && !res.success) {
                Alert.alert("Error", res.error);
              }
            }
          } 
        }
      ]
    );
  };

  // --- RENDERERS ---
  const renderModalContent = () => {
    if (['weight', 'height', 'volume', 'energy'].includes(editType)) {
      return (
        <FlatList 
          data={UNIT_OPTIONS[editType]}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.optionItem} onPress={() => handleSelectUnit(editType, item.value)}>
              <Text style={styles.optionLabel}>{item.label}</Text>
              {units[editType] === item.value && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
            </TouchableOpacity>
          )}
        />
      );
    }

    if (editType === 'displayMode') {
      return (
        <FlatList 
          data={DISPLAY_OPTIONS}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.optionItem} onPress={() => handleSelectDisplayMode(item.value)}>
              <Text style={styles.optionLabel}>{item.label}</Text>
              {displayMode === item.value && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
            </TouchableOpacity>
          )}
        />
      );
    }

    if (editType === 'steps' || editType === 'hydration') {
       return <FlatList 
         data={editType === 'steps' ? STEP_OPTIONS : WATER_OPTIONS} 
         keyExtractor={(item) => item.value.toString()}
         renderItem={({item}) => {
            const displayText = editType === 'steps' 
              ? `${item.value.toLocaleString()} steps` 
              : converters.displayVolume(item.value); 

            return (
              <TouchableOpacity style={styles.optionItem} onPress={() => handleSelectGoal(item.value)}>
                  <View>
                    <Text style={styles.optionLabel}>{item.label}</Text>
                    <Text style={styles.optionSubLabel}>{displayText}</Text>
                  </View>
                  {(editType === 'steps' ? stats?.stepGoal : stats?.hydrationGoal) === item.value && 
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  }
              </TouchableOpacity>
            );
       }} />;
    }
    
    if (editType === 'password') {
        return (
            <View>
                <TextInput 
                  style={[styles.input, errorField === 'currentPass' && { borderColor: '#FF3B30' }]} 
                  placeholder="Current Password" 
                  value={currentPass} 
                  onChangeText={(val) => { setCurrentPass(val); setErrorField(null); setErrorMessage(''); }} 
                  secureTextEntry 
                  maxLength={128} 
                  placeholderTextColor={colors.textDim}
                />
                <View style={{height:12}}/>
                <TextInput 
                  style={[styles.input, errorField === 'newPass' && { borderColor: '#FF3B30' }]} 
                  placeholder="New Password" 
                  value={newPass} 
                  onChangeText={(val) => { setNewPass(val); setErrorField(null); setErrorMessage(''); }} 
                  secureTextEntry 
                  maxLength={128} 
                  placeholderTextColor={colors.textDim}
                />
                
                {errorMessage ? (
                  <Text style={[styles.requirementText, { color: '#FF3B30' }]}>{errorMessage}</Text>
                ) : (
                  <Text style={styles.requirementText}>* Minimum 6 characters</Text>
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveText}>
                  <Text style={styles.saveBtnText}>Update Password</Text>
                </TouchableOpacity>
            </View>
        );
    }
    
    return (
        <View>
            <TextInput 
              style={[styles.input, errorField === 'name' && { borderColor: '#FF3B30' }]} 
              placeholder="Enter Name" 
              value={textInput} 
              onChangeText={(val) => { setTextInput(val); setErrorField(null); setErrorMessage(''); }} 
              autoCapitalize="words" 
              maxLength={50} 
              placeholderTextColor={colors.textDim}
            />
            {errorMessage && <Text style={[styles.requirementText, { color: '#FF3B30' }]}>{errorMessage}</Text>}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveText}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
        </View>
    );
  };

  const renderBottomPickerSheet = () => {
    if (!activeBottomSheet) return null;

    if (activeBottomSheet === 'dob' && Platform.OS === 'android') {
        return <DateTimePicker value={tempDate} mode="date" display="default" onChange={onDateChange} maximumDate={new Date()} />;
    }

    if (Platform.OS === 'android') return null; 

    return (
      <View style={styles.pickerSheet}>
        <View style={styles.pickerToolbar}>
          <TouchableOpacity onPress={handleSaveBottomSheet}>
            <Text style={styles.pickerDoneBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        {activeBottomSheet === 'dob' && (
          <View style={styles.centeredPickerContainer}>
            <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={onDateChange} maximumDate={new Date()} textColor={colors.text} />
          </View>
        )}

        {['weight', 'height', 'volume', 'energy'].includes(activeBottomSheet) && (
          <Picker selectedValue={tempUnit} onValueChange={(val) => setTempUnit(val)} itemStyle={{ color: colors.text }}>
            {UNIT_OPTIONS[activeBottomSheet].map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}
          </Picker>
        )}

        {activeBottomSheet === 'displayMode' && (
          <Picker selectedValue={tempDisplayMode} onValueChange={(val) => setTempDisplayMode(val)} itemStyle={{ color: colors.text }}>
            {DISPLAY_OPTIONS.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}
          </Picker>
        )}

        {activeBottomSheet === 'steps' && (
          <Picker selectedValue={tempStepGoal} onValueChange={(val) => setTempStepGoal(val)} itemStyle={{ color: colors.text }}>
            {STEP_OPTIONS.map(opt => <Picker.Item key={opt.value.toString()} label={`${opt.label} (${opt.value.toLocaleString()} steps)`} value={opt.value.toString()} />)}
          </Picker>
        )}

        {activeBottomSheet === 'hydration' && (
          <Picker selectedValue={tempHydrationGoal} onValueChange={(val) => setTempHydrationGoal(val)} itemStyle={{ color: colors.text }}>
            {WATER_OPTIONS.map(opt => <Picker.Item key={opt.value.toString()} label={`${opt.label} (${converters.displayVolume(opt.value)})`} value={opt.value.toString()} />)}
          </Picker>
        )}
      </View>
    );
  };

  const getModalTitle = () => {
    if (editType === 'displayMode') return 'Select Display Mode';
    if (['weight','height','volume','energy'].includes(editType)) return `Select ${editType}`;
    return `Edit ${editType}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setActiveBottomSheet(null); }}>
        <View style={{flex: 1}}>
          
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={{width: 40}} /> 
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            <SectionHeader title="ACCOUNT" colors={colors} styles={styles} />
            <View style={styles.group}>
              <SettingRow icon="person" color="#007AFF" label="Name" value={name} onPress={() => openEdit('name')} theme={theme} colors={colors} styles={styles} />
              <SettingRow icon="calendar" color="#FF9500" label="Birthday" value={dob || "Set Date"} onPress={() => openEdit('dob')} theme={theme} colors={colors} styles={styles} />
              <SettingRow icon="lock-closed" color="#FF2D55" label="Password" value="••••••" onPress={() => openEdit('password')} isLast theme={theme} colors={colors} styles={styles} />
            </View>

            <SectionHeader title="PREFERENCES" colors={colors} styles={styles} />
            <View style={styles.group}>
              
              {/* iOS: Calendar Sync | Android: Calendar Sync + Health Connect */}
              <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                 <View style={[styles.iconContainer, { backgroundColor: '#34C75915' }]}>
                    <Ionicons name="calendar" size={20} color="#34C759" />
                 </View>
                 <View style={{ flex: 1 }}>
                   <Text style={[styles.rowLabel, { color: colors.text }]}>Calendar Sync</Text>
                   <Text style={styles.rowSubLabel}>Auto-import scheduled events</Text>
                 </View>
                 <Switch value={preferences?.isAutoSyncEnabled} onValueChange={handleDeviceToggle} trackColor={{true: colors.primary}} />
              </View>

              {Platform.OS === 'android' && (
                <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                   <View style={[styles.iconContainer, { backgroundColor: '#FF453A15' }]}>
                      <MaterialCommunityIcons name="heart-pulse" size={20} color="#FF453A" />
                   </View>
                   <View style={{ flex: 1 }}>
                     <Text style={[styles.rowLabel, { color: colors.text }]}>Health Connect</Text>
                     <Text style={styles.rowSubLabel}>Sync Android steps natively</Text>
                   </View>
                   <Switch value={isHealthConnectEnabled} onValueChange={handleHealthConnectToggle} trackColor={{true: '#FF453A'}} />
                </View>
              )}

              <SettingRow 
                icon="moon" 
                color="#5E5CE6" 
                label="Display Mode" 
                value={getDisplayModeLabel(displayMode)} 
                onPress={() => openEdit('displayMode')} 
                isLast 
                theme={theme} colors={colors} styles={styles} 
              />
            </View>

            <SectionHeader title="DAILY GOALS" colors={colors} styles={styles} />
            <View style={styles.group}>
              <SettingRow icon="walk" color="#5856D6" label="Step Goal" value={stats?.stepGoal?.toLocaleString()} onPress={() => openEdit('steps')} theme={theme} colors={colors} styles={styles} />
              <SettingRow icon="water" color="#0A84FF" label="Hydration Goal" value={converters.displayVolume(stats?.hydrationGoal)} onPress={() => openEdit('hydration')} isLast theme={theme} colors={colors} styles={styles} />
            </View>

            <SectionHeader title="UNITS OF MEASUREMENT" colors={colors} styles={styles} />
            <View style={styles.group}>
              <SettingRow icon="scale" color="#AF52DE" label="Weight" value={units.weight.toUpperCase()} onPress={() => openEdit('weight')} theme={theme} colors={colors} styles={styles} />
              <SettingRow icon="resize" color="#FF3B30" label="Height" value={units.height.toUpperCase()} onPress={() => openEdit('height')} theme={theme} colors={colors} styles={styles} />
              <SettingRow icon="flask" color="#00C7BE" label="Liquids" value={units.volume.toUpperCase()} onPress={() => openEdit('volume')} theme={theme} colors={colors} styles={styles} />
              <SettingRow icon="flash" color="#FFCC00" label="Energy" value={units.energy.toUpperCase()} onPress={() => openEdit('energy')} isLast theme={theme} colors={colors} styles={styles} />
            </View>

            <SectionHeader title="DATA & PRIVACY" colors={colors} styles={styles} />
            <View style={styles.group}>
              <TouchableOpacity style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.border }]} onPress={() => Alert.alert("Reset Progress?", "This action cannot be undone.", [{ text: "Cancel", style: 'cancel' }, { text: "Reset", style: 'destructive', onPress: resetProgress }])}>
                 <View style={[styles.iconContainer, { backgroundColor: '#FF3B3015' }]}><Ionicons name="trash-bin" size={20} color="#FF3B30" /></View>
                 <Text style={[styles.rowLabel, { color: '#FF3B30' }]}>Reset All Progress</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.row} onPress={confirmDeleteAccount}>
                 <View style={[styles.iconContainer, { backgroundColor: '#FF3B3015' }]}><Ionicons name="warning" size={20} color="#FF3B30" /></View>
                 <Text style={[styles.rowLabel, { color: '#FF3B30' }]}>Delete Account</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
            
            <Text style={styles.versionText}>v1.0.2 • UFitness</Text>
            <View style={{height: 40}} />

          </ScrollView>
        </View>
      </TouchableWithoutFeedback>

      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => { setModalVisible(false); setErrorField(null); setErrorMessage(''); }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setModalVisible(false); setErrorField(null); setErrorMessage(''); }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{width: '100%'}}>
              <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle} numberOfLines={1} adjustsFontSizeToFit>{getModalTitle()}</Text>
                      <TouchableOpacity onPress={() => { setModalVisible(false); setErrorField(null); setErrorMessage(''); }} style={styles.closeBtn}><Ionicons name="close" size={20} color={colors.textDim} /></TouchableOpacity>
                  </View>
                  {renderModalContent()}
              </View>
            </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {renderBottomPickerSheet()}

    </SafeAreaView>
  );
};

const getStyles = (theme, colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  scrollContent: { padding: 20 },
  sectionHeader: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginLeft: 12, marginTop: 24, letterSpacing: 0.5 },
  group: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.surface },
  iconContainer: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  rowSubLabel: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { fontSize: 15, color: colors.textDim, marginRight: 4 },
  logoutBtn: { marginTop: 30, backgroundColor: colors.surface, paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  logoutText: { color: colors.textDim, fontSize: 16, fontWeight: '700' },
  versionText: { textAlign: 'center', color: colors.textDim, marginTop: 20, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: theme === 'dark' ? '#1C1C1E' : '#FFF', borderRadius: 24, padding: 24, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  closeBtn: { padding: 4, backgroundColor: colors.background, borderRadius: 12 },
  modalSub: { fontSize: 13, color: colors.textDim, marginBottom: 12, textAlign: 'center' },
  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionLabel: { fontSize: 16, fontWeight: '500', color: colors.text },
  optionSubLabel: { fontSize: 12, color: colors.textDim },
  input: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  requirementText: { fontSize: 12, color: colors.textDim, marginTop: 8, marginLeft: 4 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  pickerSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? 30 : 0, zIndex: 999 },
  pickerToolbar: { flexDirection: 'row', justifyContent: 'flex-end', padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
  pickerDoneBtn: { color: '#0A84FF', fontSize: 17, fontWeight: '700' },
  centeredPickerContainer: { width: '100%', alignItems: 'center', justifyContent: 'center' }
});

export default SettingsScreen;