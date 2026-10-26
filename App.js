import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { getDocumentAsync } from "expo-document-picker";
import { Query, requestPermissionsAsync } from "expo-media-library";
import { StatusBar } from "expo-status-bar";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const musicDirectory = new Directory(Paths.document, 'candy-music-library');
const libraryFile = new File(musicDirectory, 'library.json');
const saveLibrary = (songsToSave) => {
  try {
    if (!libraryFile.exists) { 
      libraryFile.create({ intermediates: true });
    }

    libraryFile.write(JSON.stringify(songsToSave, null, 2));

    console.log('Biblioteca guardada:', songsToSave.length, 'canciones');
    return true;
  } catch (error) {
    console.log('Error al guardar la biblioteca:', error);
    return false;
  }
};

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function App() {
  const player = useAudioPlayer(require("./assets/audio/01 Mestizo.mp3"));
  const status = useAudioPlayerStatus(player);
  console.log('Estado del reproductor:', status.isLoaded);
  console.log('Error de reproduccion:', status.error);

  const [sliderPosition, setSliderPosition] = useState(null);
  const [songTitle, setSongTitle] = useState(null);
  const [currentSongId, setCurrentSongId] = useState(null);
  const [songs, setSongs] = useState([]);
  const [importMenuVisible, setImportMenuVisible] = useState(false);

  const clearLibrary = () => {
  try {
    const saved = saveLibrary([]);
  
    if (!saved) {
      console.log('No se pudo vaciar la biblioteca guardada.');
      return;
    }

    player.pause();
    setSongs([]);
    setSongTitle(null);
    setCurrentSongId(null);
    setSliderPosition(null);

    console.log('Biblioteca vaciada correctamente.');
    console.log('Archivos de audio conservados.');
  } catch (error) {
    console.log('Error al vaciar la biblioteca:', error);
  }
};

  useEffect(() => {
    const loadSavedLibrary = async () => {
      try {
        musicDirectory.create({
          idempotent: true,
          intermediates: true,
        });

        console.log(
          'Carpeta de música preparada:',
          musicDirectory.uri
        );

        if (!libraryFile.exists) {
          console.log('Todavía no hay una biblioteca guardada:');
          return;
        }

        const savedContent = await libraryFile.text();
        const savedSongs = JSON.parse(savedContent);

        if (Array.isArray(savedSongs)) {
          setSongs(savedSongs);

          console.log(
            'Biblioteca recuperada:',
            savedSongs.length,
            'canciones'
          );
        }
      } catch (error) {
        console.error(
          'Error al recuperar la biblioteca:',
          error
        );
      }
    };

    loadSavedLibrary();
  }, []);

  const loadSongs = async () => {
    try{
    const permission = await requestPermissionsAsync(false, ['audio']);

    if (!permission.granted) {
      return;
    }

    const assets = await new Query()
      .eq('mediaType', 'audio')
      .limit(100)
      .exe();

    console.log('Canciones encontradas:', assets.length);

    if (assets.length === 0) {
        console.log('No se encontraron canciones nuevas; conservamos la lista actual.');
      return;
    }

    const foundSongs = await Promise.all(
      assets.map(async (asset) => ({
        id: asset.id,
        name: await asset.getFilename(),
        uri: await asset.getUri(),
      }))
    );

    const existingNames = new Set(
      songs.map((song) => song.name.trim().toLowerCase())
    );

    const newSongs = foundSongs.filter((song) => {
      const normalizedName = song.name.trim().toLowerCase();

      if (existingNames.has(normalizedName)) {
        return false;
      }

      existingNames.add(normalizedName);
      return true;
    });

    const updatedSongs = [...songs, ...newSongs];

    setSongs(updatedSongs);
    await saveLibrary(updatedSongs);

    console.log('Biblioteca actualizada:', updatedSongs.length, 'canciones');
   } catch (error) {
    console.log('Error al buscar canciones:', error);
   }
  };

  const pickSong = async () => {
    try {
      const result = await getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      console.log('Resultado del selector:', result.canceled
        ? 'Importación cancelada'
        : `${result.assets.length} archivo(s) seleccionado(s)`);

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const existingNames = new Set(
      songs.map((song) => song.name.trim().toLowerCase())
    );

    const newSongs = [];

    for(const song of result.assets) {
      const normalizedName = song.name.trim().toLowerCase();

      if (existingNames.has(normalizedName)) {
        continue;
      }

      const fileName = `${Date.now()}-${song.name}`;
      const sourceFile = new File(song.uri);
      const destinationFile = new File(musicDirectory, fileName);

      await sourceFile.copy(destinationFile);
      console.log('Archivo copiado:', destinationFile.uri);

      const importedSongs = {
        id: destinationFile.uri,
        name: song.name,
        uri: destinationFile.uri,
      };

      newSongs.push(importedSongs);
      existingNames.add(normalizedName);
    }

    const updatedSongs = [...songs, ...newSongs];

    setSongs(updatedSongs);
    
    const saved = saveLibrary(updatedSongs);

    console.log('Canciones nuevas importadas:', newSongs.length);
    console.log('Total de canciones en biblioteca:', updatedSongs.length);
    console.log('Guardado correcto:', saved);

    const firstSong = newSongs[0];

    if (firstSong) {
        player.replace({ uri: firstSong.uri });
        setSongTitle(firstSong.name);
        setCurrentSongId(firstSong.id);
        setSliderPosition(null);
        player.play();
      }
    } catch (error) {
      console.log('Error al importar canciones:', error);
    }
  };

  const playSong = (song) => {
    console.log('Cancion seleccionada:', song.name, song.uri);
    player.replace({ uri: song.uri });
    setSongTitle(song.name);
    setCurrentSongId(song.id);
    setSliderPosition(null);
    player.play();
  };

  const playNextSong = () => {
    if (songs.length === 0) {
      return;
    }

    const currentIndex = songs.findIndex(
      (song) => song.id === currentSongId
    );

    const nextIndex = 
      currentIndex === -1 || currentIndex === songs.length - 1
      ? 0
      : currentIndex + 1;

    playSong(songs[nextIndex]);  
  };

  const playPreviousSong = () => {
    if (songs.length === 0) {
      return;
    }

    const currentIndex = songs.findIndex(
      (song) => song.id === currentSongId
    );

    const previousIndex =
      currentIndex <= 0
      ? songs.length - 1
      : currentIndex - 1;
    
    playSong(songs[previousIndex]);  
  };

  const openImportMenu = () => {
    setImportMenuVisible(true);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.container}
        edges={['top', 'right', 'bottom', 'left']}
      >

      <StatusBar style="light" />

      <Text style={styles.title}>CANDY MUSIC</Text>
      <Text style={styles.subtitle}>Tu música, a tu manera.</Text>

      <View style={styles.player}>
        <Text style={styles.note}>♫</Text>
        <Text style={styles.songTitle}>
          {songTitle || 'Elige una canción'}
        </Text>
        <Text style={styles.message}>
          Tu música, siempre contigo.
        </Text>

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
          onPress={playPreviousSong}
          >
            <Text style={styles.buttonText}>
              ⏮ Anterior
            </Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={playNextSong}
          >
            <Text style={styles.buttonText}>
              Siguiente ⏭
            </Text>
        </Pressable>

        <Pressable style={styles.button} onPress={openImportMenu}>
            <Text style={styles.buttonText}>📂 Importar canciones</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={loadSongs}
          >
           <Text style={styles.buttonText}>🔎 Buscar canciones</Text>
        </Pressable>
      </View>

      {importMenuVisible && (
        <View style={styles.importMenu}>
          <Text style={styles.libraryTitle}>
            De dónde quieres importar tu música?
          </Text>

          <Pressable
            style={styles.button}
            onPress={() => {
              setImportMenuVisible(false);
              pickSong();
            }}
          >
            <Text style={styles.buttonText}>📂 Archivos</Text>
          </Pressable>

          <Pressable
            style={styles.button}
            onPress={() => setImportMenuVisible(false)}
          >
            <Text style={styles.buttonText}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.library}>
        <Text style={styles.libraryTitle}>Mi biblioteca</Text>

        <Pressable
          style={styles.button}
          onPress={clearLibrary}
        >
          <Text style={styles.buttonText}>
            🧹 Limpiar biblioteca
          </Text>
        </Pressable>  

        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.songItem}
              onPress={() => playSong(item)}
              >
                <Text style={styles.songItemText} numberOfLines={1}>
                  ♫ {item.name}
                </Text>
              </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Importa tus canciones para verlas aquí.
            </Text>
          }
          />
      </View>

      <Text style={styles.footer}> TU MÚSICA. TU MOMENTO</Text>
    </SafeAreaView>
  </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#10101C',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  title: {
    color: '#A78BFA',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  subtitle: {
    color: '#D1D1E0',
    fontSize: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  player: {
    width: '100%',
    backgroundColor: '#1C1C2E',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#393653',
  },
  importMenu: {
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#1C1C2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A78BFA',
    padding: 16,
    marginTop: 12,
    alignItems: 'stretch',
  },
  library: {
    flex: 1,
    minHeight: 100,
    width: '100%',
    backgroundColor: '#1C1C2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#393653',
    padding: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  libraryTitle: {
    color: '#A78BFA',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  songItem: {
    backgroundColor: '#292940',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  songItemText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  emptyText: {
    color: '#B9B9CC',
    fontSize: 14,
    paddingVertical: 8,
  },
  note: {
    color: '#A78BFA',
    fontSize: 44,
    marginBottom: 4,
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
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginTop: 10,
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
    marginTop: 4,
    textAlign: 'center',
  }
});
