import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';

export default function MainScreen() {
  const navigation = useNavigation();

  const handleOpenDrawer = () => {
    try {
      if (navigation.dispatch) {
        navigation.dispatch(DrawerActions.openDrawer());
      }
    } catch (e) {
      Alert.alert("Menu", "Drawer navigation coming soon!");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E3192" />

      {/* --- Top App Bar --- */}
      <View style={styles.topBar}>
        <View style={styles.leftSection}>
          <TouchableOpacity style={styles.iconButton} onPress={handleOpenDrawer}>
            <Ionicons name="menu" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>SignBridge+</Text>
        </View>

        <View style={styles.rightSection}>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="search" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* --- Welcome Section --- */}
        <View style={styles.welcomeSection}>
          <Text style={styles.greetingText}>Hello, User!</Text>
          <Text style={styles.subGreeting}>Ready to translate today?</Text>
        </View>

        {/* --- Main Action Card --- */}
        <TouchableOpacity 
          style={styles.mainCard} 
          activeOpacity={0.9}
          onPress={() => Alert.alert("Camera", "Initializing FSL Translator...")}
        >
          <View style={styles.cameraCircle}>
            <Ionicons name="videocam" size={42} color="#2E3192" />
          </View>
          <Text style={styles.cardTitle}>Start Translating</Text>
          <Text style={styles.cardSubText}>Point camera at FSL signs</Text>
          
          {/* Context Badge */}
          <View style={styles.contextBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.contextText}>Context: General</Text>
          </View>
        </TouchableOpacity>

        {/* --- Secondary Actions (Optional Info) --- */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="time-outline" size={20} color="#2E3192" />
            <Text style={styles.statLabel}>Recent Activity</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="book-outline" size={20} color="#2E3192" />
            <Text style={styles.statLabel}>Sign Library</Text>
          </View>
        </View>

        {/* --- FSL Tip of the Day --- */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="bulb" size={20} color="#F1C40F" />
            <Text style={styles.tipTitle}>FSL Tip of the Day</Text>
          </View>
          <Text style={styles.tipDescription}>
            Facial expressions are a crucial part of FSL. They represent the "tone" of your voice!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FE', // Light neutral background
  },
  topBar: {
    height: 64,
    backgroundColor: '#2E3192',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    elevation: 8,
  },
  leftSection: { flexDirection: 'row', alignItems: 'center' },
  rightSection: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 8 },
  pageTitle: { color: 'white', fontSize: 22, fontWeight: 'bold', marginLeft: 8 },
  
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  welcomeSection: {
    marginBottom: 24,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1C3D',
  },
  subGreeting: {
    fontSize: 16,
    color: '#6E7191',
    marginTop: 4,
  },
  mainCard: {
    backgroundColor: '#2E3192',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#2E3192',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    marginBottom: 20,
  },
  cameraCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  cardSubText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 20,
  },
  contextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80', // Green dot
    marginRight: 8,
  },
  contextText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statBox: {
    backgroundColor: 'white',
    width: '48%',
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statLabel: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
  },
  tipCard: {
    backgroundColor: '#FFFBEB', // Light yellow tint
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
  },
  tipDescription: {
    fontSize: 14,
    color: '#B45309',
    lineHeight: 20,
  },
});