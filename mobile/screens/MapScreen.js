import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Location from 'expo-location';

import apiService from '../services/api';
import voiceService from '../services/voice';
import MapViewComponent from '../components/MapViewComponent';
import POIFilterBar from '../components/POIFilterBar';
import RouteComparisonCard from '../components/RouteComparisonCard';
import NavigationOverlay from '../components/NavigationOverlay';
import EmergencyModal from '../components/EmergencyModal';
import ReportModal from '../components/ReportModal';
import AuthModal from './AuthModal';

// Starting hubs in Nashik for easy testing/simulation
const NASHIK_HUBS = [
  { name: '📍 Live GPS Location', isGps: true },
  { name: '🚉 Nashik Road Station', lat: 19.953, lon: 73.834 },
  { name: '🏫 College Road (BYK)', lat: 20.005, lon: 73.765 },
  { name: '🛕 Panchavati (Ramkund)', lat: 20.008, lon: 73.793 },
];

// Popular destinations in Nashik
const POPULAR_DESTINATIONS = [
  { name: 'College Road (BYK / KTHM)', lat: 20.005, lon: 73.765, tag: 'Student & Cafe Hub' },
  { name: 'Nashik Road Railway Station', lat: 19.953, lon: 73.834, tag: 'Major Transit Hub' },
  { name: 'City Centre Mall, Untwadi', lat: 19.972, lon: 73.763, tag: 'Commercial & Shopping' },
  { name: 'Panchavati / Ramkund', lat: 20.008, lon: 73.793, tag: 'Heritage Corridor' },
  { name: 'Gangapur Road (Anandwalli)', lat: 20.021, lon: 73.742, tag: 'Residential & Cafes' },
  { name: 'Indira Nagar Jogging Track', lat: 19.962, lon: 73.785, tag: 'Active Residential' },
  { name: 'Sula Vineyards, Govardhan', lat: 20.006, lon: 73.687, tag: 'Tourist Corridor' },
];

export default function MapScreen() {
  // Real GPS & Origin state
  const [realGpsLocation, setRealGpsLocation] = useState(null);
  const [userLocation, setUserLocation] = useState({
    latitude: 19.953,
    longitude: 73.834, // Default to Nashik Road Station hub
  });
  const [originName, setOriginName] = useState('Your Current Location');
  const [locLoading, setLocLoading] = useState(true);

  // Destination & search
  const [destination, setDestination] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDestList, setShowDestList] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);


  // Region
  const [region, setRegion] = useState({
    latitude: 19.985,
    longitude: 73.795,
    latitudeDelta: 0.09,
    longitudeDelta: 0.09,
  });

  // Routing
  const [comparisonData, setComparisonData] = useState(null);
  const [selectedMode, setSelectedMode] = useState('safest');
  const [calculatingRoutes, setCalculatingRoutes] = useState(false);

  // Turn-by-Turn Navigation state
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);

  // POIs & Heatmap
  const [pois, setPois] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);

  // Modals
  const [emergencyVisible, setEmergencyVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const mapRef = useRef(null);
  const simIntervalRef = useRef(null);

  useEffect(() => {
    fetchInitialUserLocation();
    loadPOIs();

    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  // Live Nashik Place Geocoding & Search Debounce
  useEffect(() => {
    const q = searchQuery ? searchQuery.trim() : '';
    if (!q || q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const data = await apiService.searchPlaces(q, 8);
        setSearchResults(data || []);
      } catch (e) {
        console.log('Nashik place search warning:', e);
      } finally {
        setSearchLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);


  const fetchInitialUserLocation = async () => {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setRealGpsLocation(coords);

        // Check if user is in or near Nashik (lat 19.5 - 20.5, lon 73.0 - 74.5)
        const inNashik =
          coords.latitude >= 19.5 && coords.latitude <= 20.5 &&
          coords.longitude >= 73.0 && coords.longitude <= 74.5;

        if (inNashik) {
          setUserLocation(coords);
          setOriginName('📍 Your Current GPS Location');
          setRegion({ ...coords, latitudeDelta: 0.05, longitudeDelta: 0.05 });
        } else {
          // If testing outside Nashik, use default Nashik origin but keep real GPS in state
          setOriginName('📍 Nashik Road Station (Demo Origin)');
        }
      }
    } catch (e) {
      console.log('Location fetch note:', e);
    } finally {
      setLocLoading(false);
    }
  };

  const handleSelectOriginHub = (hub) => {
    if (hub.isGps && realGpsLocation) {
      setUserLocation(realGpsLocation);
      setOriginName('📍 Live GPS Location');
    } else if (hub.lat && hub.lon) {
      setUserLocation({ latitude: hub.lat, longitude: hub.lon });
      setOriginName(hub.name);
    }
    if (destination) {
      calculateRoutes({ latitude: hub.lat || realGpsLocation.latitude, longitude: hub.lon || realGpsLocation.longitude }, destination);
    }
  };

  const loadPOIs = async (category = null) => {
    try {
      const data = await apiService.getPOIs(
        category === 'all' ? null : category,
        userLocation.latitude,
        userLocation.longitude,
        6000
      );
      setPois(data);
    } catch (e) {
      console.warn('POIs fetch warning:', e);
    }
  };

  const handleSelectCategory = (cat) => {
    setSelectedCategory(cat);
    loadPOIs(cat);
  };

  const handleToggleHeatmap = async () => {
    const next = !showHeatmap;
    setShowHeatmap(next);
    if (next && !heatmapData) {
      try {
        const data = await apiService.getHeatmap();
        setHeatmapData(data);
      } catch (e) {
        console.warn('Heatmap load warning:', e);
      }
    }
  };

  const handleSelectDestination = (dest) => {
    const targetCoords = {
      latitude: dest.latitude !== undefined ? dest.latitude : dest.lat,
      longitude: dest.longitude !== undefined ? dest.longitude : dest.lon,
    };
    setDestination(targetCoords);
    setSearchQuery(dest.name);
    setShowDestList(false);
    calculateRoutes(userLocation, targetCoords);
  };

  const handleDirectSearch = async (queryText) => {
    const q = (queryText || searchQuery || '').trim();
    if (!q) return;

    try {
      setSearchLoading(true);
      const data = await apiService.searchPlaces(q, 5);
      if (data && data.length > 0) {
        handleSelectDestination(data[0]);
      } else {
        Alert.alert(
          'Location in Nashik',
          `Could not find a place named "${q}". Try a nearby area, chowk, colony, or tap directly on the map.`
        );
      }
    } catch (e) {
      Alert.alert('Search Error', 'Unable to reach the search service.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleMapPress = (coords) => {
    if (!isNavigating) {
      setDestination(coords);
      setSearchQuery(`Pinned Location (${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)})`);
      calculateRoutes(userLocation, coords);
    }
  };


  const calculateRoutes = async (originCoords, destCoords) => {
    try {
      setCalculatingRoutes(true);
      const res = await apiService.compareRoutes(
        originCoords.latitude,
        originCoords.longitude,
        destCoords.latitude,
        destCoords.longitude
      );
      setComparisonData(res);
      setSelectedMode('safest');
      setCurrentStepIndex(0);

      // Announce route options
      const safest = res.safest;
      if (safest) {
        voiceService.speak(
          `Safest route found to destination. Estimated travel time ${safest.estimated_time_minutes} minutes, safety score ${safest.safety_score} out of 100.`
        );
      }
    } catch (e) {
      Alert.alert('Route Error', 'Could not calculate routes. Please verify destination.');
    } finally {
      setCalculatingRoutes(false);
    }
  };

  // Turn-by-Turn Navigation Controls
  const handleStartNavigation = (activeRoute) => {
    setIsNavigating(true);
    setCurrentStepIndex(0);
    const steps = activeRoute?.steps || [];
    if (steps.length > 0) {
      voiceService.speak(`Navigation started. ${steps[0].instruction}. Follow the green safety-verified corridor.`);
    }
  };

  const handleExitNavigation = () => {
    setIsNavigating(false);
    setIsSimulating(false);
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    voiceService.stop();
  };

  const handleNextStep = () => {
    const activeRoute = comparisonData?.[selectedMode] || comparisonData?.safest;
    const steps = activeRoute?.steps || [];
    if (currentStepIndex < steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);

      // Move user marker to next step start
      const stepCoords = steps[nextIdx]?.coordinates;
      if (stepCoords && stepCoords.length > 0) {
        setUserLocation({
          latitude: stepCoords[0][1],
          longitude: stepCoords[0][0],
        });
      }
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      const activeRoute = comparisonData?.[selectedMode] || comparisonData?.safest;
      const stepCoords = activeRoute?.steps?.[prevIdx]?.coordinates;
      if (stepCoords && stepCoords.length > 0) {
        setUserLocation({
          latitude: stepCoords[0][1],
          longitude: stepCoords[0][0],
        });
      }
    }
  };

  const handleToggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    } else {
      setIsSimulating(true);
      const activeRoute = comparisonData?.[selectedMode] || comparisonData?.safest;
      const steps = activeRoute?.steps || [];
      if (steps.length === 0) return;

      let idx = currentStepIndex;
      simIntervalRef.current = setInterval(() => {
        idx += 1;
        if (idx < steps.length) {
          setCurrentStepIndex(idx);
          const stepCoords = steps[idx]?.coordinates;
          if (stepCoords && stepCoords.length > 0) {
            setUserLocation({
              latitude: stepCoords[0][1],
              longitude: stepCoords[0][0],
            });
          }
        } else {
          clearInterval(simIntervalRef.current);
          setIsSimulating(false);
          voiceService.speak('You have reached your destination. Navigation completed.');
        }
      }, 5000); // advance step every 5 seconds in simulation
    }
  };

  const recenter = () => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 600);
    }
  };

  const activeRoute = comparisonData ? comparisonData[selectedMode] : null;
  const currentStep = activeRoute?.steps?.[currentStepIndex];
  const activeStepCoords = currentStep?.coordinates || [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Map Component */}
      <MapViewComponent
        mapRef={mapRef}
        region={region}
        onRegionChangeComplete={setRegion}
        onMapPress={handleMapPress}
        userLocation={userLocation}
        destination={destination}
        comparisonData={comparisonData}
        selectedMode={selectedMode}
        pois={selectedCategory !== 'all' ? pois : pois.slice(0, 40)}
        showHeatmap={showHeatmap}
        heatmapData={heatmapData}
        activeStepCoords={activeStepCoords}
        isNavigating={isNavigating}
      />

      {/* When in Full Navigation Mode: Google Maps Turn-by-Turn HUD */}
      {isNavigating && activeRoute ? (
        <NavigationOverlay
          route={activeRoute}
          currentStepIndex={currentStepIndex}
          onNextStep={handleNextStep}
          onPrevStep={handlePrevStep}
          onExitNavigation={handleExitNavigation}
          isSimulating={isSimulating}
          onToggleSimulation={handleToggleSimulation}
          totalDistanceKm={activeRoute.distance_km}
          totalMinutes={activeRoute.estimated_time_minutes}
        />
      ) : (
        /* Regular Exploration & Route Selection Header */
        <>
          <View style={styles.topContainer}>
            {/* Origin & Current Location Banner */}
            <View style={styles.originPill}>
              <Text style={styles.originPillText}>
                {locLoading ? '📡 Locating GPS...' : `🟢 ${originName}`}
              </Text>
            </View>

            {/* Destination Search Bar */}
            <View style={styles.searchBarWrapper}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Where to in Nashik? (e.g. Tidke Colony, Muktidham)"
                placeholderTextColor="#6B7280"
                value={searchQuery}
                returnKeyType="search"
                onSubmitEditing={() => handleDirectSearch(searchQuery)}
                onFocus={() => setShowDestList(true)}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  setShowDestList(true);
                }}
              />
              {searchLoading ? (
                <ActivityIndicator size="small" color="#10B981" style={{ marginRight: 6 }} />
              ) : null}
              {searchQuery ? (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setDestination(null); setComparisonData(null); setSearchResults([]); }}>
                  <Text style={styles.clearSearchIcon}>✕</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.profileBtn} onPress={() => setAuthVisible(true)}>
                <Text style={styles.profileIcon}>{currentUser ? '👤' : '🔑'}</Text>
              </TouchableOpacity>
            </View>

            {/* Hub origin selector chips (useful for switching origin quickly) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hubBar}>
              {NASHIK_HUBS.map((h, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.hubChip, originName.includes(h.name.replace(/[^a-zA-Z]/g, '')) && styles.hubChipActive]}
                  onPress={() => handleSelectOriginHub(h)}
                >
                  <Text style={styles.hubChipText}>{h.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Suggested Destinations Dropdown */}
            {showDestList && (
              <View style={styles.destDropdown}>
                {/* Instant direct search option */}
                {searchQuery.trim().length > 0 && (
                  <TouchableOpacity
                    style={styles.directSearchRow}
                    onPress={() => handleDirectSearch(searchQuery)}
                  >
                    <Text style={styles.directSearchIcon}>🎯</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.directSearchTitle}>
                        Route to "{searchQuery.trim()}"
                      </Text>
                      <Text style={styles.directSearchSubtitle}>
                        Find in Nashik & calculate safest route
                      </Text>
                    </View>
                    <Text style={styles.directSearchAction}>Go ➔</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.destDropdownHeader}>
                  {searchResults.length > 0
                    ? `Matching Nashik Locations (${searchResults.length})`
                    : 'Popular Destinations in Nashik'}
                </Text>

                <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled">
                  {searchResults.length > 0 ? (
                    searchResults.map((d, i) => (
                      <TouchableOpacity
                        key={`res-${i}`}
                        style={styles.destItem}
                        onPress={() => handleSelectDestination(d)}
                      >
                        <Text style={styles.destItemIcon}>📍</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.destItemName} numberOfLines={1}>{d.name}</Text>
                          <Text style={styles.destItemTag}>{d.tag}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    POPULAR_DESTINATIONS.filter((d) =>
                      !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map((d, i) => (
                      <TouchableOpacity
                        key={`pop-${i}`}
                        style={styles.destItem}
                        onPress={() => handleSelectDestination(d)}
                      >
                        <Text style={styles.destItemIcon}>📍</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.destItemName}>{d.name}</Text>
                          <Text style={styles.destItemTag}>{d.tag}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}


            {/* POI Filter Chips & Safety Map Layer */}
            <POIFilterBar
              selectedCategory={selectedCategory}
              onSelectCategory={handleSelectCategory}
              showHeatmap={showHeatmap}
              onToggleHeatmap={handleToggleHeatmap}
            />
          </View>

          {/* Floating Action Buttons */}
          <View style={styles.fabColumn}>
            {/* SOS / Emergency */}
            <TouchableOpacity
              style={[styles.fabBtn, styles.sosFab]}
              onPress={() => setEmergencyVisible(true)}
            >
              <Text style={styles.fabEmoji}>🚨</Text>
              <Text style={styles.sosFabLabel}>SOS</Text>
            </TouchableOpacity>

            {/* Report Safety Hazard */}
            <TouchableOpacity
              style={[styles.fabBtn, styles.reportFab]}
              onPress={() => setReportVisible(true)}
            >
              <Text style={styles.fabEmoji}>⚠️</Text>
            </TouchableOpacity>

            {/* Recenter */}
            <TouchableOpacity style={[styles.fabBtn, styles.recenterFab]} onPress={recenter}>
              <Text style={styles.fabEmoji}>🎯</Text>
            </TouchableOpacity>
          </View>

          {/* Calculating Loading Banner */}
          {calculatingRoutes && (
            <View style={styles.loadingBanner}>
              <ActivityIndicator color="#10B981" size="small" />
              <Text style={styles.loadingText}>Evaluating road safety factors & computing routes...</Text>
            </View>
          )}

          {/* Bottom Route Comparison Card */}
          {comparisonData && (
            <View style={styles.bottomDrawer}>
              <RouteComparisonCard
                comparisonData={comparisonData}
                selectedMode={selectedMode}
                onSelectMode={setSelectedMode}
                onStartNavigation={handleStartNavigation}
                onClose={() => {
                  setComparisonData(null);
                  setDestination(null);
                  setSearchQuery('');
                }}
              />
            </View>
          )}
        </>
      )}

      {/* Modals */}
      <EmergencyModal
        visible={emergencyVisible}
        onClose={() => setEmergencyVisible(false)}
        userCoords={userLocation}
        onNavigateTo={(facility) => {
          handleSelectDestination({
            name: facility.name,
            lat: facility.latitude,
            lon: facility.longitude,
          });
        }}
      />

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        userCoords={userLocation}
      />

      <AuthModal
        visible={authVisible}
        onClose={() => setAuthVisible(false)}
        onAuthSuccess={(u) => setCurrentUser(u)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  topContainer: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    zIndex: 20,
  },
  originPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 6,
  },
  originPillText: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '700',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  clearSearchIcon: {
    fontSize: 16,
    color: '#9CA3AF',
    paddingHorizontal: 6,
  },
  profileBtn: {
    marginLeft: 6,
    padding: 4,
  },
  profileIcon: {
    fontSize: 20,
  },
  hubBar: {
    marginTop: 6,
    flexDirection: 'row',
  },
  hubChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hubChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  hubChipText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '600',
  },
  destDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 6,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  directSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  directSearchIcon: {
    fontSize: 20,
  },
  directSearchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  directSearchSubtitle: {
    fontSize: 11,
    color: '#047857',
  },
  directSearchAction: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
  },
  destDropdownHeader: {

    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  destItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  destItemIcon: {
    fontSize: 16,
  },
  destItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  destItemTag: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  fabColumn: {
    position: 'absolute',
    right: 16,
    top: 170,
    gap: 12,
    zIndex: 10,
  },
  fabBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabEmoji: {
    fontSize: 20,
  },
  sosFab: {
    backgroundColor: '#DC2626',
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  sosFabLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  reportFab: {
    backgroundColor: '#F59E0B',
  },
  recenterFab: {
    backgroundColor: '#FFFFFF',
  },
  loadingBanner: {
    position: 'absolute',
    top: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    zIndex: 15,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomDrawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
});
