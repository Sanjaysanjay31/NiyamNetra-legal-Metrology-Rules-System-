import React, { useEffect } from 'react';
import { View, Text, Platform, useWindowDimensions, StyleSheet } from 'react-native';
import { colors } from '../theme';

/**
 * WebPhoneWrapper
 * 
 * When running on desktop web browsers (width > 500px), constrains the app
 * into a realistic, centered smartphone mockup frame so that tabs, headers,
 * and layouts look and feel like a mobile app instead of stretching 100% wide.
 * 
 * On actual mobile devices / small screens (width <= 500px) or native builds
 * (Android / iOS), renders normally with 100% full screen.
 */
export default function WebPhoneWrapper({ children }) {
  const { width, height } = useWindowDimensions();

  // Inject CSS on web to reset body margin and prevent awkward dual scrollbars
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'niyamnetra-web-phone-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html, body, #root {
            height: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background-color: #06111D !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  // On Native Android/iOS, zero overhead: return children directly
  if (Platform.OS !== 'web') {
    return <View style={styles.nativeFull}>{children}</View>;
  }

  // On Web: if screen is mobile-sized (<= 500px), display full-screen
  const isDesktopWeb = width > 500;
  if (!isDesktopWeb) {
    return <View style={styles.webMobileFull}>{children}</View>;
  }

  // On Desktop Web: display centered phone frame
  const phoneWidth = Math.min(380, width - 32);
  const phoneHeight = Math.min(900, height - 48);

  return (
    <View style={styles.desktopBackdrop}>
      <View
        style={[
          styles.phoneFrame,
          {
            width: phoneWidth,
            height: phoneHeight,
          },
        ]}
      >
        {/* Dynamic Island / Camera Notch */}
        <View style={styles.notchContainer} pointerEvents="none">
          <View style={styles.notchPill}>
            <View style={styles.cameraLens} />
            <View style={styles.speakerSlit} />
          </View>
        </View>

        {/* Screen Content */}
        <View style={styles.phoneScreen}>
          {children}
        </View>

        {/* Bottom Home Indicator Bar */}
        <View style={styles.homeIndicatorContainer} pointerEvents="none">
          <View style={styles.homeIndicatorBar} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeFull: {
    flex: 1,
  },
  webMobileFull: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
  },
  desktopBackdrop: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#06111D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  desktopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 42, 68, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(14, 116, 144, 0.35)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  desktopBadgeText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  desktopBadgeSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginLeft: 4,
  },
  phoneFrame: {
    backgroundColor: colors.background,
    borderRadius: 46,
    borderWidth: 9,
    borderColor: '#1E293B',
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      default: {
        elevation: 10,
      },
    }),
  },
  notchContainer: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  notchPill: {
    width: 116,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  cameraLens: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    marginRight: 10,
  },
  speakerSlit: {
    width: 44,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#1E293B',
  },
  phoneScreen: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  homeIndicatorContainer: {
    position: 'absolute',
    bottom: 5,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  homeIndicatorBar: {
    width: 130,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
});
