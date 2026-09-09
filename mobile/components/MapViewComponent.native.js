import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

export default function MapViewComponent({
  mapRef,
  region,
  onRegionChangeComplete,
  onMapPress,
  userLocation,
  destination,
  comparisonData,
  selectedMode,
  pois,
  showHeatmap,
  heatmapData,
  activeStepCoords,
  isNavigating,
}) {
  const selectedRoute = comparisonData ? comparisonData[selectedMode] : null;

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={region}
      onRegionChangeComplete={onRegionChangeComplete}
      onPress={(e) => onMapPress && onMapPress(e.nativeEvent.coordinate)}
      showsUserLocation={true}
      showsMyLocationButton={false}
      followsUserLocation={isNavigating}
    >
      {/* Destination Marker */}
      {destination && (
        <Marker
          coordinate={destination}
          title="Destination"
          pinColor="#EF4444"
        />
      )}

      {/* User Location Marker */}
      {userLocation && (
        <Marker
          coordinate={userLocation}
          title="Your Live Location"
          pinColor="#2563EB"
        />
      )}

      {/* POI Markers */}
      {!isNavigating && pois && pois.map((p) => {
        let pinColor = '#6B7280';
        if (p.category === 'police') pinColor = '#1E40AF';
        else if (p.category === 'hospital') pinColor = '#DC2626';
        else if (p.category === 'pharmacy') pinColor = '#059669';
        else if (p.category === 'restaurant' || p.category === 'cafe') pinColor = '#D97706';

        return (
          <Marker
            key={`${p.category}-${p.id}`}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.name || p.category}
            pinColor={pinColor}
          />
        );
      })}

      {/* Safety Heatmap Polylines */}
      {showHeatmap && heatmapData?.features?.map((feat, idx) => {
        if (feat.geometry?.type !== 'LineString') return null;
        const coords = feat.geometry.coordinates.map(([lon, lat]) => ({
          latitude: lat,
          longitude: lon,
        }));
        return (
          <Polyline
            key={`heat-${idx}`}
            coordinates={coords}
            strokeColor={feat.properties.color || '#FBBF24'}
            strokeWidth={3}
          />
        );
      })}

      {/* Route Polylines */}
      {comparisonData && (
        <>
          {/* Unselected Alternate Routes */}
          {!isNavigating && ['fastest', 'safest', 'balanced'].map((mKey) => {
            if (mKey === selectedMode) return null;
            const r = comparisonData[mKey];
            if (!r?.geometry?.coordinates) return null;
            const coords = r.geometry.coordinates.map(([lon, lat]) => ({
              latitude: lat,
              longitude: lon,
            }));
            return (
              <Polyline
                key={`alt-${mKey}`}
                coordinates={coords}
                strokeColor="#94A3B8"
                strokeWidth={4}
                lineDashPattern={[5, 5]}
              />
            );
          })}

          {/* Selected Active Route */}
          {selectedRoute?.geometry?.coordinates && (
            <Polyline
              coordinates={selectedRoute.geometry.coordinates.map(([lon, lat]) => ({
                latitude: lat,
                longitude: lon,
              }))}
              strokeColor={selectedMode === 'safest' ? '#10B981' : '#2563EB'}
              strokeWidth={7}
            />
          )}

          {/* Active Navigation Step Highlight */}
          {isNavigating && activeStepCoords && activeStepCoords.length > 1 && (
            <Polyline
              coordinates={activeStepCoords.map(([lon, lat]) => ({
                latitude: lat,
                longitude: lon,
              }))}
              strokeColor="#FBBF24"
              strokeWidth={10}
            />
          )}
        </>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
