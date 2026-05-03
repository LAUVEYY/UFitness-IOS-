import React from 'react';
import { Platform, StyleSheet, View, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PALETTE } from '../../src/constants/theme';

export default function TabsLayout() {
  const theme = useColorScheme() || 'dark';
  const colors = PALETTE[theme];
  const insets = useSafeAreaInsets();

  // Ensure proper padding for bottom swiping on modern phones (iOS & Android)
  const bottomInset = Math.max(0, insets.bottom - 20);

  // Unified Glowing Icons that fill in when active
  const renderIcon = (name, focused, color, size) => (
    <View style={[
      styles.iconContainer,
      focused && {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 7, 
        elevation: 5 
      }
    ]}>
      {/* Uses the solid icon when focused, and the outline version when inactive */}
      <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        tabBarTransparent: true, // CRITICAL: Tells the router to expect absolute transparency
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 10, 
        },
        tabBarStyle: [
          styles.tabBar,
          {
            height: Platform.OS === 'ios' ? 78 : 72 + bottomInset, 
            paddingBottom: Platform.OS === 'ios' ? 20 : bottomInset + 16, 
            paddingTop: Platform.OS === 'ios' ? 5 : 0, 
            // FIX: Applied 85% opacity to Android for a "little transparency" without washing out
            backgroundColor: Platform.OS === 'android' 
              ? (theme === 'dark' ? 'rgba(28, 28, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)') 
              : 'transparent', 
          }
        ],
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              tint={theme === 'dark' ? 'dark' : 'light'}
              intensity={80}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            // FIX: Applied 85% opacity to the Android background fallback
            <View style={[
              StyleSheet.absoluteFill, 
              { backgroundColor: theme === 'dark' ? 'rgba(28, 28, 30, 0.81)' : 'rgba(255, 255, 255, 0.81)' }
            ]} />
          )
        ),
      }}
    >
      <Tabs.Screen 
        name="profile" 
        options={{ title: "Profile", tabBarIcon: ({ focused, color, size }) => renderIcon("person", focused, color, size) }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen 
        name="workout" 
        options={{ title: "Workout", tabBarIcon: ({ focused, color, size }) => renderIcon("barbell", focused, color, size) }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen 
        name="index" 
        options={{ title: "Summary", tabBarIcon: ({ focused, color, size }) => renderIcon("grid", focused, color, size) }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen 
        name="compete" 
        options={{ title: "Compete", tabBarIcon: ({ focused, color, size }) => renderIcon("walk", focused, color, size) }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen 
        name="daily" 
        options={{ title: "Daily", tabBarIcon: ({ focused, color, size }) => renderIcon("calendar", focused, color, size) }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    // Absolute positioning forces the tab bar to hover, ensuring content flows beneath it
    position: 'absolute', 
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 0, 
    borderTopWidth: 0, 
    borderTopColor: 'transparent',
    overflow: 'hidden', 
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  }
});