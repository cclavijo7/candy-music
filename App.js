import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useState } from "react";
import { getDocumentAsync } from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function App() {
  const player = useAudioPlayer(require("./assets/audio/01 Mestizo.mp3"));
  const status = useAudioPlayerStatus(player);
  const [sliderPosition, setSliderPosition] = useState(null);
  const [songTitle, setSongTitle] = useState(null);
  const pickSong = async () => {
    const result = await getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      const song = result.assets[0];

      player.replace({ uri: song.uri });
      setSongTitle(song.name);
      setSliderPosition(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.title}>CANDY MUSIC</Text>
      <Text style={styles.subtitle}>Tu música, a tu manera.</Text>

      <View style={styles.player}>
        <Text style={styles.note}>♫</Text>
        <Text style={styles.songTitle}>{songTitle}</Text>
        <Text style={styles.message}>Tu música, siempre contigo.</Text>

        <Text style={styles.time}>
          {formatTime(status.currentTime)} / {formatTime(status.duration)}
        </Text>

        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={status.duration || 1}
          value={sliderPosition ?? status.currentTime}
          minimumTrackTintColor="#A78BFA"
          maximumTrackTintColor="#393653"
          thumbTintColor="#A78BFA"
          onValueChange={(value) => {
            setSliderPosition(value);
          }}
          onSlidingComplete={async(value) => {
            await player.seekTo(value);
            setSliderPosition(null);
          }}
        />  

        <Pressable 
          style={styles.button}
          onPress={() => { 
            if (status.playing) {
              player.pause();
            } else {
              player.play();
            }
          }}
        >
          <Text style={styles.buttonText}>
            {status.playing ? "⏸ Pausar" : "▶ Reproducir"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={pickSong}
          >
            <Text style={styles.buttonText}>
              🎵 Elegir canción
            </Text>
          </Pressable>
      </View>

      <Text style={styles.footer}> TU MÚSICA. TU MOMENTO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#10101C',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#A78BFA',
    fontSize: 30,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  subtitle: {
    color: '#D1D1E0',
    fontSize: 16,
    marginTop: 10,
    marginBottom: 40,
  },
  player: {
    width: '100%',
    backgroundColor: '#1C1C2E',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#393653',
  },
  note: {
    color: '#A78BFA',
    fontSize: 64,
    marginBottom: 12,
  },
  songTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center', 
  },
  message: {
    color: '#B9B9CC',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 21,
  },
  time: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
  },
  slider: {
    width: '100%',
    height: 40,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    marginTop: 24,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footer: {
    color: '#85859D',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 36,
  }
});
