import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@neon_music/library_v1';
const MUSIC_DIR_NAME = 'music';

const initialPlayerSource = null;

const fileExtension = (name = '') => {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

const isAudioFile = (asset) => {
  const mime = (asset.mimeType || '').toLowerCase();
  const ext = fileExtension(asset.name || asset.uri);
  return (
    mime.startsWith('audio/') ||
    ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', '3gp', 'amr'].includes(ext)
  );
};

const formatTime = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const cleanName = (name = 'Canción') =>
  name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Canción';

const makeSafeFilename = (name, suffix) => {
  const ext = fileExtension(name) || 'mp3';
  const base = cleanName(name)
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ .()]/g, '_')
    .slice(0, 70)
    .trim() || 'cancion';
  return `${base}_${suffix}.${ext}`;
};

const makeId = (asset, index) =>
  `${Date.now()}_${index}_${asset.name || 'audio'}_${asset.size || 0}`;

function PrimaryButton({ label, icon, onPress, disabled = false, compact = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.compactButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.buttonIcon}>{icon}</Text>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function RoundButton({ label, onPress, active = false, disabled = false, size = 50 }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundButton,
        { width: size, height: size, borderRadius: size / 2 },
        active && styles.roundButtonActive,
        disabled && styles.roundButtonDisabled,
        pressed && !disabled && styles.roundPressed,
      ]}
    >
      <Text style={size >= 64 ? styles.roundIconLarge : styles.roundIcon}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [statusText, setStatusText] = useState('Selecciona música para comenzar');
  const replaceLock = useRef(false);

  const currentTrack = tracks[currentIndex] || null;
  const player = useAudioPlayer(initialPlayerSource, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  const currentTime = status?.currentTime || 0;
  const duration = status?.duration || 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const musicDirectory = useMemo(
    () => new Directory(Paths.document, MUSIC_DIR_NAME),
    []
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });

        if (!musicDirectory.exists) {
          musicDirectory.create({ intermediates: true, idempotent: true });
        }

        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved || !mounted) return;

        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return;

        const valid = parsed.filter((track) => {
          try {
            return track?.uri && new File(track.uri).exists;
          } catch {
            return false;
          }
        });

        setTracks(valid);
        if (valid.length) {
          setStatusText(`${valid.length} canción${valid.length === 1 ? '' : 'es'} disponibles`);
        }
      } catch (error) {
        console.warn('No se pudo inicializar el audio:', error);
        setStatusText('La app está lista. Importa una canción.');
      }
    })();

    return () => {
      mounted = false;
      try {
        player.clearLockScreenControls();
      } catch {}
    };
  }, [musicDirectory, player]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracks)).catch(() => {});
  }, [tracks]);

  const activateLockScreen = useCallback(async (track) => {
    if (!track) return;
    try {
      if (Platform.OS === 'android') {
        try {
          await requestNotificationPermissionsAsync();
        } catch {}
      }

      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist || 'Biblioteca local',
        albumTitle: track.album || 'Neon Music',
      }, {
        showSeekBackward: true,
        showSeekForward: true,
      });
    } catch (error) {
      console.warn('No se pudieron activar los controles de pantalla bloqueada:', error);
    }
  }, [player]);

  const loadTrack = useCallback(async (index, autoPlay = true) => {
    if (!tracks.length || index < 0 || index >= tracks.length) return;
    const track = tracks[index];
    replaceLock.current = true;
    setCurrentIndex(index);
    setStatusText('Cargando…');

    try {
      player.replace(track.uri);
      player.loop = false;
      player.volume = 1;
      await activateLockScreen(track);
      if (autoPlay) player.play();
      setStatusText(autoPlay ? 'Reproduciendo' : 'En pausa');
    } catch (error) {
      console.warn(error);
      Alert.alert('No se pudo reproducir', `No fue posible abrir “${track.title}”.`);
      setStatusText('Error de reproducción');
    } finally {
      setTimeout(() => {
        replaceLock.current = false;
      }, 250);
    }
  }, [activateLockScreen, player, tracks]);

  const nextTrack = useCallback((fromIndex = currentIndex) => {
    if (!tracks.length) return;

    if (shuffle && tracks.length > 1) {
      const candidates = tracks.map((_, i) => i).filter((i) => i !== fromIndex);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      loadTrack(next, true);
      return;
    }

    const next = (fromIndex + 1) % tracks.length;
    loadTrack(next, true);
  }, [currentIndex, loadTrack, shuffle, tracks]);

  const previousTrack = useCallback(() => {
    if (!tracks.length) return;

    if (currentTime > 5) {
      player.seekTo(0);
      return;
    }

    const previous = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
    loadTrack(previous, true);
  }, [currentIndex, currentTime, loadTrack, player, tracks]);

  useEffect(() => {
    if (status?.didJustFinish && !replaceLock.current && currentTrack) {
      nextTrack(currentIndex);
    }
  }, [currentIndex, currentTrack, nextTrack, status?.didJustFinish]);

  const togglePlayPause = () => {
    if (!currentTrack) {
      if (tracks.length) loadTrack(0, true);
      else importSongs();
      return;
    }

    if (status?.playing) {
      player.pause();
      setStatusText('En pausa');
    } else {
      activateLockScreen(currentTrack);
      player.play();
      setStatusText('Reproduciendo');
    }
  };

  const importSongs = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const assets = (result.assets || []).filter(isAudioFile);
      if (!assets.length) {
        Alert.alert('Sin archivos de audio', 'Selecciona canciones en formato MP3, M4A, AAC, WAV, FLAC u otro formato compatible con Android/iOS.');
        return;
      }

      if (!musicDirectory.exists) {
        musicDirectory.create({ intermediates: true, idempotent: true });
      }

      const imported = [];
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        const suffix = `${Date.now()}_${i}`;
        const name = makeSafeFilename(asset.name || 'cancion.mp3', suffix);
        const destination = new File(musicDirectory, name);
        const source = new File(asset.uri);
        source.copy(destination);

        imported.push({
          id: makeId(asset, i),
          title: cleanName(asset.name || name),
          artist: 'Biblioteca local',
          album: 'Neon Music',
          uri: destination.uri,
          originalName: asset.name || name,
          size: asset.size || 0,
        });
      }

      setTracks((old) => {
        const seen = new Set(old.map((track) => `${track.originalName}:${track.size}`));
        return [...old, ...imported.filter((track) => !seen.has(`${track.originalName}:${track.size}`))];
      });

      if (currentIndex === -1) setCurrentIndex(0);
      setStatusText(`${imported.length} canción${imported.length === 1 ? '' : 'es'} importada${imported.length === 1 ? '' : 's'}`);
      Alert.alert('Música importada', `Se agregaron ${imported.length} archivo${imported.length === 1 ? '' : 's'} a tu biblioteca.`);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No fue posible importar las canciones.');
    }
  };

  const removeTrack = (track) => {
    Alert.alert(
      'Quitar canción',
      `¿Deseas quitar “${track.title}” de la biblioteca?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () => {
            const removedIndex = tracks.findIndex((item) => item.id === track.id);
            const next = tracks.filter((item) => item.id !== track.id);
            setTracks(next);

            try {
              new File(track.uri).delete();
            } catch {}

            if (removedIndex === currentIndex) {
              player.pause();
              player.clearLockScreenControls();
              setCurrentIndex(next.length ? Math.min(removedIndex, next.length - 1) : -1);
              setStatusText(next.length ? 'Selecciona otra canción' : 'Biblioteca vacía');
            } else if (removedIndex < currentIndex) {
              setCurrentIndex((value) => value - 1);
            }
          },
        },
      ]
    );
  };

  const seek = async (fraction) => {
    if (!duration) return;
    const target = Math.max(0, Math.min(duration, duration * fraction));
    try {
      await player.seekTo(target);
    } catch {}
  };

  const renderTrack = ({ item, index }) => {
    const selected = index === currentIndex;
    return (
      <Pressable
        onPress={() => loadTrack(index, true)}
        onLongPress={() => removeTrack(item)}
        style={({ pressed }) => [styles.trackRow, selected && styles.trackRowSelected, pressed && styles.pressed]}
      >
        <View style={[styles.trackBadge, selected && styles.trackBadgeActive]}>
          <Text style={styles.trackBadgeText}>♫</Text>
        </View>
        <View style={styles.trackMain}>
          <Text numberOfLines={1} style={[styles.trackTitle, selected && styles.trackTitleActive]}>{item.title}</Text>
          <Text numberOfLines={1} style={styles.trackArtist}>{item.artist}</Text>
        </View>
        <Text style={styles.trackMore}>⋯</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>NEON <Text style={styles.brandAccent}>MUSIC</Text></Text>
            <Text style={styles.subtitle}>REPRODUCTOR LOCAL</Text>
          </View>
          <Pressable onPress={importSongs} style={({ pressed }) => [styles.headerImport, pressed && styles.pressed]}>
            <Text style={styles.headerImportIcon}>＋</Text>
            <Text style={styles.headerImportText}>IMPORTAR</Text>
          </Pressable>
        </View>

        <View style={styles.nowPlayingCard}>
          <View style={styles.albumArt}>
            <View style={styles.albumGlowOne} />
            <View style={styles.albumGlowTwo} />
            <Text style={styles.albumNote}>♫</Text>
          </View>
          <View style={styles.nowPlayingText}>
            <Text style={styles.nowLabel}>AHORA SUENA</Text>
            <Text numberOfLines={1} style={styles.nowTitle}>{currentTrack?.title || 'Ninguna canción seleccionada'}</Text>
            <Text numberOfLines={1} style={styles.nowArtist}>{currentTrack?.artist || 'Importa música desde una carpeta del teléfono'}</Text>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <Pressable onPress={(event) => {
            const width = event.nativeEvent.locationX;
            // The bar width is approximated from the screen-independent container.
            // The press handler is kept intentionally simple for portability.
            const fraction = Math.max(0, Math.min(1, width / 320));
            seek(fraction);
          }} style={styles.progressHitBox}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
            </View>
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <RoundButton label={shuffle ? '🔀' : '⤨'} onPress={() => setShuffle((value) => !value)} active={shuffle} />
          <RoundButton label="◀|" onPress={previousTrack} disabled={!tracks.length} />
          <RoundButton label={status?.playing ? 'Ⅱ' : '▶'} onPress={togglePlayPause} size={72} disabled={!tracks.length && statusText !== 'Selecciona música para comenzar'} />
          <RoundButton label="|▶" onPress={() => nextTrack(currentIndex)} disabled={!tracks.length} />
          <RoundButton label="↻" onPress={() => currentTrack && player.seekTo(0)} disabled={!currentTrack} />
        </View>

        <View style={styles.libraryHeader}>
          <View>
            <Text style={styles.libraryTitle}>TU BIBLIOTECA</Text>
            <Text style={styles.libraryCount}>{tracks.length} canción{tracks.length === 1 ? '' : 'es'}</Text>
          </View>
          <Text style={styles.shuffleHint}>{shuffle ? 'ALEATORIO ACTIVO' : 'ORDEN NORMAL'}</Text>
        </View>

        {tracks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>♫</Text>
            <Text style={styles.emptyTitle}>Tu biblioteca está vacía</Text>
            <Text style={styles.emptyBody}>Pulsa “IMPORTAR” y elige una o varias canciones desde el almacenamiento del teléfono.</Text>
            <PrimaryButton label="IMPORTAR CANCIONES" icon="＋" onPress={importSongs} />
          </View>
        ) : (
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            renderItem={renderTrack}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>● AUDIO EN SEGUNDO PLANO · CONTROLES DE PANTALLA BLOQUEADA ACTIVOS</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070810' },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { color: '#fff', fontSize: 25, fontWeight: '900', letterSpacing: 1.8 },
  brandAccent: { color: '#7dffea' },
  subtitle: { color: '#697184', fontSize: 9, fontWeight: '800', letterSpacing: 2.6, marginTop: 1 },
  headerImport: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#205f60', backgroundColor: '#0c1b1d', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  headerImportIcon: { color: '#7dffea', fontSize: 20, fontWeight: '300', marginRight: 5, marginTop: -2 },
  headerImportText: { color: '#b9fff6', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  nowPlayingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#101321', borderRadius: 20, borderWidth: 1, borderColor: '#252b41', padding: 14, shadowColor: '#00ffe1', shadowOpacity: 0.08, shadowRadius: 18, elevation: 3 },
  albumArt: { width: 112, height: 112, borderRadius: 18, backgroundColor: '#101f2f', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2b6971' },
  albumGlowOne: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: '#173e6c', opacity: 0.75, left: -25, top: 35 },
  albumGlowTwo: { position: 'absolute', width: 95, height: 95, borderRadius: 48, backgroundColor: '#076d5e', opacity: 0.8, right: -30, top: -18 },
  albumNote: { color: '#e0fffb', fontSize: 55, fontWeight: '900', textShadowColor: '#6ffff0', textShadowRadius: 18 },
  nowPlayingText: { flex: 1, paddingLeft: 15 },
  nowLabel: { color: '#6f7a8e', fontSize: 9, fontWeight: '900', letterSpacing: 2.1, marginBottom: 5 },
  nowTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  nowArtist: { color: '#9ba4b8', fontSize: 12, marginTop: 6 },
  statusText: { color: '#71ffe9', fontSize: 10, fontWeight: '800', marginTop: 13 },
  progressSection: { marginTop: 18 },
  progressHitBox: { height: 18, justifyContent: 'center' },
  progressTrack: { height: 5, backgroundColor: '#242a3d', borderRadius: 5, position: 'relative', overflow: 'visible' },
  progressFill: { height: 5, backgroundColor: '#77ffe6', borderRadius: 5 },
  progressThumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#d8fff8', top: -3.5, marginLeft: -6 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  timeText: { color: '#7e8798', fontSize: 10, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: 2 },
  roundButton: { backgroundColor: '#111626', borderWidth: 1, borderColor: '#283049', alignItems: 'center', justifyContent: 'center' },
  roundButtonActive: { backgroundColor: '#12343a', borderColor: '#61ffe9' },
  roundButtonDisabled: { opacity: 0.35 },
  roundIcon: { color: '#d7ddea', fontSize: 17, fontWeight: '900' },
  roundIconLarge: { color: '#ecfffb', fontSize: 29, fontWeight: '900' },
  roundPressed: { transform: [{ scale: 0.94 }], backgroundColor: '#172036' },
  libraryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16, marginBottom: 8 },
  libraryTitle: { color: '#dfe7f2', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  libraryCount: { color: '#626c80', fontSize: 10, marginTop: 3 },
  shuffleHint: { color: '#6eeedb', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  listContent: { paddingBottom: 10 },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8, borderRadius: 14, marginBottom: 3 },
  trackRowSelected: { backgroundColor: '#0f1e24', borderWidth: 1, borderColor: '#18494a' },
  trackBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#181d2c', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#283147' },
  trackBadgeActive: { backgroundColor: '#123e3b', borderColor: '#48f9dd' },
  trackBadgeText: { color: '#bbc4d6', fontSize: 22 },
  trackMain: { flex: 1, paddingHorizontal: 11 },
  trackTitle: { color: '#d8deea', fontSize: 13, fontWeight: '700' },
  trackTitleActive: { color: '#7dffea' },
  trackArtist: { color: '#687287', fontSize: 10, marginTop: 3 },
  trackMore: { color: '#586173', fontSize: 24, paddingHorizontal: 6, marginTop: -5 },
  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 30, paddingBottom: 25 },
  emptyIcon: { color: '#7dffea', fontSize: 54, marginBottom: 8, textShadowColor: '#47f9de', textShadowRadius: 20 },
  emptyTitle: { color: '#edf2fa', fontSize: 18, fontWeight: '900' },
  emptyBody: { color: '#7e8799', textAlign: 'center', lineHeight: 20, fontSize: 12, marginTop: 8, marginBottom: 18 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#143d3f', borderWidth: 1, borderColor: '#5effe7', borderRadius: 13, paddingVertical: 13, paddingHorizontal: 18 },
  compactButton: { paddingVertical: 9 },
  disabledButton: { opacity: 0.4 },
  buttonIcon: { color: '#8affed', fontSize: 18, marginRight: 7 },
  primaryButtonText: { color: '#ddfff9', fontWeight: '900', fontSize: 11, letterSpacing: 1.1 },
  footerNote: { paddingTop: 8, paddingBottom: 7, alignItems: 'center' },
  footerText: { color: '#3d7b76', fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
