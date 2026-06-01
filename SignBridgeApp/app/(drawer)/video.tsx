import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

export default function VideoScreen() {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');

  const startZoomCall = () => {
    // Placeholder: In a real app, integrate Zoom SDK
    const zoomUrl = 'zoomus://'; // Deep link to Zoom app
    Linking.canOpenURL(zoomUrl).then(supported => {
      if (supported) {
        Linking.openURL(zoomUrl);
      } else {
        // Fallback to web
        Linking.openURL('https://zoom.us/join');
      }
    });
  };

  const startGoogleMeet = () => {
    // Open Google Meet in browser or app
    Linking.openURL('https://meet.google.com');
  };

  const joinZoomMeeting = () => {
    if (!meetingId) {
      Alert.alert('Error', 'Please enter a Meeting ID');
      return;
    }
    const url = `zoomus://zoom.us/join?confno=${meetingId}${meetingPassword ? `&pwd=${meetingPassword}` : ''}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Zoom App Not Found', 'Please install the Zoom app or use the web version.');
        Linking.openURL(`https://zoom.us/j/${meetingId}${meetingPassword ? `?pwd=${meetingPassword}` : ''}`);
      }
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/') }>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Video</Text>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Video Conferencing</Text>
        <Text style={styles.subtitle}>Connect with FSL translation</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Start</Text>
        <TouchableOpacity style={styles.callButton} onPress={startZoomCall}>
          <Ionicons name="videocam" size={24} color="#fff" />
          <Text style={styles.callButtonText}>Start Zoom Meeting</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.callButton} onPress={startGoogleMeet}>
          <Ionicons name="videocam" size={24} color="#fff" />
          <Text style={styles.callButtonText}>Start Google Meet</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join Meeting</Text>
        <TextInput
          style={styles.input}
          placeholder="Meeting ID"
          value={meetingId}
          onChangeText={setMeetingId}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (optional)"
          value={meetingPassword}
          onChangeText={setMeetingPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.joinButton} onPress={joinZoomMeeting}>
          <Text style={styles.joinButtonText}>Join Zoom Meeting</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>FSL Translation in Calls</Text>
        <Text style={styles.infoText}>
          During video calls, you can use the Translate tab to overlay FSL translation on your screen.
          Position the camera to capture signs, and the translation will appear in real-time.
        </Text>
        <TouchableOpacity style={styles.infoButton} onPress={() => Alert.alert('How to Use', '1. Start your video call\n2. Switch to Translate tab\n3. Point camera at signs\n4. Translation appears as overlay')}>
          <Text style={styles.infoButtonText}>How to Use</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integration Notes</Text>
        <Text style={styles.noteText}>
          • Full Zoom SDK integration coming in future updates{'\n'}
          • Google Meet integration via web{'\n'}
          • FSL translation overlay works with any video app
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  topBar: {
    backgroundColor: '#2E3192',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  header: {
    backgroundColor: '#2E3192',
    padding: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    marginTop: 5,
  },
  section: {
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 10,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00e5ff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  joinButton: {
    backgroundColor: '#2E3192',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 15,
  },
  infoButton: {
    backgroundColor: '#00e5ff',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  infoButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  noteText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});