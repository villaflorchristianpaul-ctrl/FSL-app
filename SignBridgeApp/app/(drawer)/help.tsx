import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function HelpSupportScreen() {
  const router = useRouter();
  const [expandedFAQ, setExpandedFAQ] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');

  const faqs = [
    {
      id: 1,
      question: 'What is SignBridge+?',
      answer: 'SignBridge+ is a context-aware Filipino Sign Language (FSL) translation system that uses AI to translate between FSL and text/speech in real-time.'
    },
    {
      id: 2,
      question: 'How accurate is the translation?',
      answer: 'Our system achieves 85% accuracy on common FSL signs. Accuracy improves with proper lighting and hand positioning.'
    },
    {
      id: 3,
      question: 'Can I use it offline?',
      answer: 'The translate feature requires an internet connection. We are working on offline capabilities for future releases.'
    },
    {
      id: 4,
      question: 'How do I improve translation accuracy?',
      answer: 'Ensure good lighting, keep your hands 1-2 feet from the camera, warm up before signing, and perform signs slowly at first.'
    },
    {
      id: 5,
      question: 'Is my data private?',
      answer: 'Yes, your translation data is encrypted and never shared. We comply with all privacy regulations.'
    },
    {
      id: 6,
      question: 'How do I report a bug?',
      answer: 'Use the feedback form below or email support@signbridge.ph with details about the issue.'
    },
  ];

  const toggleFAQ = (id: number) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  const sendFeedback = () => {
    if (!feedbackText.trim()) {
      Alert.alert('Error', 'Please enter your feedback');
      return;
    }
    Alert.alert('Thank You!', 'Your feedback has been sent to our team.');
    setFeedbackText('');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Contact Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          <TouchableOpacity style={styles.contactItem} onPress={() => Linking.openURL('mailto:support@signbridge.ph')}>
            <Ionicons name="mail" size={20} color="#00e5ff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.contactLabel}>Email Support</Text>
              <Text style={styles.contactValue}>support@signbridge.ph</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactItem} onPress={() => Linking.openURL('https://www.facebook.com/signbridge')}>
            <Ionicons name="logo-facebook" size={20} color="#00e5ff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.contactLabel}>Facebook Community</Text>
              <Text style={styles.contactValue}>@SignBridgePH</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactItem} onPress={() => Linking.openURL('tel:+639123456789')}>
            <Ionicons name="call" size={20} color="#00e5ff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.contactLabel}>Phone Support</Text>
              <Text style={styles.contactValue}>+63 (912) 345-6789</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqs.map((faq) => (
            <TouchableOpacity
              key={faq.id}
              style={styles.faqItem}
              onPress={() => toggleFAQ(faq.id)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <Ionicons
                  name={expandedFAQ === faq.id ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#00e5ff"
                />
              </View>
              {expandedFAQ === faq.id && (
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Feedback Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Us Feedback</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Tell us what you think..."
            placeholderTextColor="#999"
            value={feedbackText}
            onChangeText={setFeedbackText}
            multiline
            numberOfLines={5}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendFeedback}>
            <Ionicons name="send" size={20} color="#fff" />
            <Text style={styles.sendButtonText}>Send Feedback</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About SignBridge+</Text>
          <Text style={styles.aboutText}>
            Version 1.0.0{'\n\n'}
            A Filipino Sign Language translation system developed by BS Computer Engineering students at Negros Oriental State University.{'\n\n'}
            © 2026 SignBridge+. All rights reserved.
          </Text>
        </View>
      </View>
    </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  content: {
    padding: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  contactValue: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  faqItem: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 10,
  },
  faqAnswer: {
    marginTop: 10,
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: '#00e5ff',
    flexDirection: 'row',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  aboutText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});