import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { PALETTE } from '../constants/theme';
import { getGif } from '../services/workoutService';
import { Image } from 'expo-image';

const WorkoutCard = ({ item, onPress }) => {
  const theme = useColorScheme() || 'light';
  const colors = PALETTE[theme];
  const styles = getStyles(theme, colors);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      
      <View style={styles.imageContainer}>
        <Image
  source={getGif(item.gifKey) || { uri: item.image }}
  // Same fallback pattern — local GIF first, URL if missing
  style={styles.image}
  resizeMode="cover"
/>
        
       
        <View style={styles.overlay} />

        
        <View style={styles.playButton}>
          <Ionicons name="play" size={24} color="#FFF" style={{ marginLeft: 2 }} />
        </View>

       
        <View style={styles.timeBadge}>
          <Ionicons name="time-outline" size={12} color="#FFF" />
          <Text style={styles.timeText}>{item.duration} min</Text>
        </View>
      </View>

    
      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        
        
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="fire" size={14} color={colors.primary} />
          <Text style={styles.metaText}>{item.calories} cal</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.metaText}>{item.type}</Text>
        </View>

        <View style={styles.tagsRow}>
          {item.tags.map((tag, index) => (
            <View key={index} style={[styles.tag, { backgroundColor: tag.color + '20' }]}>
              <Text style={[styles.tagText, { color: tag.color }]}>{tag.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const getStyles = (theme, colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme === 'dark' ? '#333' : '#E5E5EA',
  },
  imageContainer: {
    height: 180,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF3B30', 
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  timeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  timeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaText: {
    color: colors.textDim,
    fontSize: 14,
    marginLeft: 4,
  },
  dot: {
    color: colors.textDim,
    marginHorizontal: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export default WorkoutCard;