import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import HomeScreen from './HomeScreen';
import NewInspectionScreen from './NewInspectionScreen';
import InspectionSessionScreen from './InspectionSessionScreen';
import FindingsScreen from './FindingsScreen';
import InspectionSummaryScreen from './InspectionSummaryScreen';
import ReviewQueueScreen from './ReviewQueueScreen';
import ReviewDetailScreen from './ReviewDetailScreen';
import { colors } from '../../theme';

export default function InspectorFlow({ navigation }) {
  // Navigation mode within inspector workflow:
  // 'home' | 'new_inspection' | 'session' | 'findings' | 'summary' | 'review_queue' | 'review_detail'
  const [mode, setMode] = useState('home');

  // Active store inspection session state
  const [activeSession, setActiveSession] = useState(null);

  // Selected package for findings drill-down
  const [selectedScan, setSelectedScan] = useState(null);

  // Selected inspection for review & adjudication
  const [reviewInspectionId, setReviewInspectionId] = useState(null);

  // --- Handlers ---
  const handleStartInspection = () => {
    setMode('new_inspection');
  };

  const handleResumeInspection = () => {
    if (activeSession) setMode('session');
    else setMode('new_inspection');
  };

  const handleOpenReviewQueue = () => {
    setMode('review_queue');
  };

  const handleSelectReviewInspection = (inspectionId) => {
    setReviewInspectionId(inspectionId);
    setMode('review_detail');
  };

  const handleBackFromReviewQueue = () => {
    setMode('home');
  };

  const handleBackFromReviewDetail = () => {
    setMode('review_queue');
  };

  const handleInspectionSessionStarted = (sessionData) => {
    setActiveSession({
      ...sessionData,
      scans: [],
    });
    setMode('session');
  };

  const handlePackageAssessed = (newScan, updatedScans) => {
    setActiveSession((prev) => ({
      ...prev,
      scans: updatedScans,
    }));
    setSelectedScan(newScan);
    setMode('findings');
  };

  const handleViewFindings = (scan) => {
    setSelectedScan(scan);
    setMode('findings');
  };

  const handleSaveFindings = (updatedFindings) => {
    if (!selectedScan || !activeSession) return;
    const failCount = updatedFindings.filter((f) => f.effective_verdict === 'fail' || f.effective_verdict === 'violation').length;
    const notAssessed = updatedFindings.filter((f) => f.effective_verdict === 'not_assessed').length;
    const rollup = failCount > 0 ? 'violation' : (notAssessed === 0 ? 'compliant' : 'not_assessed');
    const updatedScans = (activeSession.scans || []).map((s) =>
      s.id === selectedScan.id
        ? {
            ...s,
            findings: updatedFindings,
            overall_result: rollup,
          }
        : s
    );
    setActiveSession((prev) => ({
      ...prev,
      scans: updatedScans,
    }));
  };

  const handleCompleteInspection = (sessionSummary) => {
    setActiveSession(sessionSummary);
    setMode('summary');
  };

  const handleInspectionFinalized = () => {
    setActiveSession(null);
    setSelectedScan(null);
    setMode('home');
  };

  const handleCancelNew = () => {
    setMode('home');
  };

  const handleBackToSession = () => {
    setMode('session');
  };

  return (
    <View style={styles.container}>
      {mode === 'home' && (
        <HomeScreen
          navigation={navigation}
          activeInspection={activeSession}
          onStartInspection={handleStartInspection}
          onResumeInspection={handleResumeInspection}
          onOpenReviewQueue={handleOpenReviewQueue}
        />
      )}

      {mode === 'new_inspection' && (
        <NewInspectionScreen
          navigation={navigation}
          onStartInspectionSession={handleInspectionSessionStarted}
          onCancel={handleCancelNew}
        />
      )}

      {mode === 'session' && (
        <InspectionSessionScreen
          inspectionSession={activeSession}
          onPackageAssessed={handlePackageAssessed}
          onViewFindings={handleViewFindings}
          onCompleteInspection={handleCompleteInspection}
          onCancel={handleCancelNew}
        />
      )}

      {mode === 'findings' && (
        <FindingsScreen
          scan={selectedScan}
          onBack={handleBackToSession}
          onSaveFindings={handleSaveFindings}
        />
      )}

      {mode === 'summary' && (
        <InspectionSummaryScreen
          inspectionSession={activeSession}
          onInspectionFinalized={handleInspectionFinalized}
          onBackToSession={handleBackToSession}
        />
      )}

      {mode === 'review_queue' && (
        <ReviewQueueScreen
          onSelectInspection={handleSelectReviewInspection}
          onBack={handleBackFromReviewQueue}
        />
      )}

      {mode === 'review_detail' && (
        <ReviewDetailScreen
          inspectionId={reviewInspectionId}
          onBack={handleBackFromReviewDetail}
          onAdjudicated={() => {}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
