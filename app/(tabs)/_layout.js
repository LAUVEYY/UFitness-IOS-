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
            // FIX 1: Raised the iOS height back up slightly to find the perfect middle ground
            height: Platform.OS === 'ios' ? 78 : 72 + bottomInset, 
            paddingBottom: Platform.OS === 'ios' ? 20 : bottomInset + 16, 
            paddingTop: Platform.OS === 'ios' ? 5 : 0, 
            backgroundColor: 'transparent', 
          }
        ],
        // Injects a solid Glass Blur View right behind the tabs on ALL platforms
        tabBarBackground: () => (
          <BlurView
            tint={theme === 'dark' ? 'dark' : 'light'}
            // FIX 2: Cranked Android intensity from 45 to 85 so it is much less transparent
            intensity={Platform.OS === 'ios' ? 80 : 85}
            experimentalBlurMethod={Platform.OS === 'android' ? "dimezisBlurView" : 'none'} 
            style={StyleSheet.absoluteFill}
          />
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
        options={{ title: "Compete", tabBarIcon: ({ focused, color, size }) => renderIcon("trophy", focused, color, size) }}
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
