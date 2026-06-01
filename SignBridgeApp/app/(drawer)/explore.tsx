import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const signs = [
  { id: '1', name: 'Hello', description: 'Wave hand', icon: '👋' },
  { id: '2', name: 'Thank You', description: 'Touch chin and move forward', icon: '🙏' },
  { id: '3', name: 'Please', description: 'Rub palm on chest', icon: '🤲' },
  { id: '4', name: 'Sorry', description: 'Fist to chest', icon: '😔' },
  { id: '5', name: 'Good', description: 'Thumbs up', icon: '👍' },
  // Add more signs as needed
];

export default function LearnScreen() {
  const [selectedSign, setSelectedSign] = useState(null);

  const renderSign = ({ item }) => (
    <TouchableOpacity
      style={styles.signCard}
      onPress={() => setSelectedSign(item)}
    >
      <Text style={styles.signIcon}>{item.icon}</Text>
      <Text style={styles.signName}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Learn FSL Signs</Text>
        <Text style={styles.subtitle}>Master Filipino Sign Language</Text>
      </View>

      <FlatList
        data={signs}
        renderItem={renderSign}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.signsContainer}
      />

      {selectedSign && (
        <View style={styles.detailModal}>
          <View style={styles.detailContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedSign(null)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.detailIcon}>{selectedSign.icon}</Text>
            <Text style={styles.detailName}>{selectedSign.name}</Text>
            <Text style={styles.detailDesc}>{selectedSign.description}</Text>
            <TouchableOpacity style={styles.practiceButton}>
              <Text style={styles.practiceText}>Practice</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2E3192',
    padding: 20,
    paddingTop: 50,
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
  signsContainer: {
    padding: 10,
  },
  signCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    margin: 5,
    alignItems: 'center',
    flex: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  signIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  signName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  detailModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '80%',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  detailIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  detailName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  detailDesc: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  practiceButton: {
    backgroundColor: '#00e5ff',
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 25,
  },
  practiceText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
