import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { getAudioMetadata } from "@missingcore/audio-metadata";
import { useEffect, useRef, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { getDocumentAsync } from "expo-document-picker";
import { Query, requestPermissionsAsync } from "expo-media-library";
import { StatusBar } from "expo-status-bar";
import { Alert, Animated, Easing, FlatList, Image,  Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const musicDirectory = new Directory(Paths.document, 'candy-music-library');
const libraryFile = new File(musicDirectory, 'library.json');
const favoritesFile = new File(musicDirectory, 'favorites.json');

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

const saveFavorites = (favoriteIds) => {
  try {
    if (!favoritesFile.exists) {
      favoritesFile.create({ intermediates: true });
    }

    favoritesFile.write(JSON.stringify(favoriteIds, null, 2));

    console.log('Favoritos guardados:', favoriteIds.length);
    return true;
  } catch (error) {
    console.log('Error al guardar los favoritos:', error);
    return false;
  }
};

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

const getOriginalFileName = (song) => {
  if (song.originalName) {
    return song.originalName.trim().toLowerCase();
  }

  const uriFileName = song.uri?.split('/').pop();

  if ( uriFileName) {
    let decodedFileName = uriFileName;

    try {
      decodedFileName = decodeURIComponent(uriFileName);
    } catch (error) {
      console.log('No se pudo decodificar el nombre del archivo.');
    }

    return decodedFileName
      .replace(/^\d+-/, '')
      .trim()
      .toLowerCase();
  }

  return String(song.name || '').trim().toLowerCase();
};

export default function App() {
  const player = useAudioPlayer(require("./assets/audio/01 Mestizo.mp3"));
  const status = useAudioPlayerStatus(player);
  const finishHandled = useRef(false);
  const playbackQueue = useRef([]);
  const playbackQueueSource = useRef('all');
  const artworkScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!status.playing) {
      artworkScale.stopAnimation();

      Animated.timing(artworkScale, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      return;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(artworkScale, {
          toValue: 1.04,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),

        Animated.timing(artworkScale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [status.playing, artworkScale]);  

  const pendingAutoPlay = useRef(false);
  const waitingForLoad = useRef(false);
  const waitingForUnload = useRef(false);

  console.log('Estado del reproductor:', status.isLoaded);
  console.log('Error de reproduccion:', status.error);
  console.log('Está reproduciendo?:', status.playing);
  console.log('¿Terminó la canción?:', status.didJustFinish);

  const [sliderPosition, setSliderPosition] = useState(null);
  const [songTitle, setSongTitle] = useState(null);
  const [currentSongId, setCurrentSongId] = useState(null);
  const [songs, setSongs] = useState([]);
  const [favoriteSongIds, setFavoriteSongIds] = useState([]);
  const [selectedLibrary, setSelectedLibrary] = useState('all');
  const [selectedLibraryView, setSelectedLibraryView] = useState('songs'); 
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [albumSource, setAlbumSource] = useState('albums');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState('asc');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const favoriteSongs = songs.filter((song) =>
    favoriteSongIds.includes(song.id)
  );

  const displayedSongs = (
    selectedLibrary === 'favorites' ? favoriteSongs : songs
  )
    .filter((song) =>
      song.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
    .sort((a, b) => {
      const comparison = a.name.localeCompare(
        b.name,
        'es',
        { sensitivity: 'base' }
      );

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const currentSong = songs.find((song) => song.id === currentSongId);
  
  const albums = Object.values(
    songs.reduce((groups, song) => {
      const rawAlbum = String(song.album || '').trim();

      const albumName = 
        !rawAlbum || rawAlbum.toLowerCase() === 'album desconocido'
          ? 'Sin álbum'
          : rawAlbum;
      
      const artistName = 
        String(song.artist || '').trim() || 'Artista desconocido';

      const albumId = 
        `${artistName.toLowerCase()}::${albumName.toLowerCase()}`;

      if (!groups[albumId]) {
        groups[albumId] = {
          id: albumId,
          name: albumName,
          artist: artistName,
          artwork: song.artwork || null,
          songs: [],
        };
      }

      groups[albumId].songs.push(song);

      if (!groups[albumId].artwork && song.artwork) {
        groups[albumId].artwork = song.artwork;
      }

      return groups;
    }, {})
  );

  const displayedAlbums = albums
    .filter((album) => 
      `${album.name} ${album.artist}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )

    .sort((a, b) => {
      const comparison = a.name.localeCompare(
        b.name,
        'es',
        { sensitivity: 'base' }
      );

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const favoriteAlbums = albums
      .map((album) => {
        const favoriteSongsInAlbum = album.songs.filter((song) =>
          favoriteSongIds.includes(song.id)
        );

        return {
          ...album,
          songs: favoriteSongsInAlbum,
        };
      })
      .filter((album) => album.songs.length > 0);

    const displayedFavoriteAlbums = favoriteAlbums
      .filter((album) =>
        `${album.name} ${album.artist} ${album.songs
          .map((song) => song.name)
          .join(' ')}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const comparison = a.name.localeCompare(
          b.name,
          'es',
          { sensitivity: 'base' }
        );

        return sortOrder === 'asc' ? comparison : -comparison;
      });  

  const [importMenuVisible, setImportMenuVisible] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );

    const hideSubscription  = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  
  useEffect(() => {
    player.loop = repeatEnabled;

    console.log('Repetición solicitada:', repeatEnabled);
    console.log('Repetición  del reproductor:', player.loop);
  }, [player, repeatEnabled]);

  useEffect(() => {
    if (!pendingAutoPlay.current) {
      return;
    }

    if (waitingForUnload.current && !status.isLoaded) {
      waitingForUnload.current = false;
      waitingForLoad.current = true;
      return;
    }

    if (waitingForLoad.current && status.isLoaded) {
      pendingAutoPlay.current = false;
      waitingForLoad.current = false;

      player.play();
      console.log('Reproducción automática iniciada');
    }
  }, [status.isLoaded, player]);

  const clearLibrary = () => {
  try {
    const librarySaved = saveLibrary([]);
    const favoritesSaved = saveFavorites([]);

    if (!librarySaved || !favoritesSaved) {
      const libraryRestored = saveLibrary(songs);
      const favoriteRestored = saveFavorites(favoriteSongIds);

      console.log('Biblioteca restaurada:', libraryRestored);
      console.log('Favoritos restaurados:', favoriteRestored);
      
      Alert.alert(
        'Error',
        'No se pudo vaciar la biblioteca. Tus datos originales se han intentado restaurar.'
      );

      return;
    }

    player.pause();

    playbackQueue.current = [];
    playbackQueueSource.current = 'all';

    pendingAutoPlay.current = false;
    waitingForLoad.current = false;
    waitingForUnload.current = false;
    finishHandled.current = false;
    
    setSongs([]);
    setFavoriteSongIds([]);
    setSongTitle(null);
    setCurrentSongId(null);
    setSliderPosition(null);
    setSelectedAlbum(null);

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

        if (favoritesFile.exists) {
          const savedFavoritesContent = await favoritesFile.text();
          const savedFavorites = JSON.parse(savedFavoritesContent);

          if (Array.isArray(savedFavorites)) {
            setFavoriteSongIds(savedFavorites);
            console.log('Favoritos recuperados:', savedFavorites.length);
          }
        }

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
      assets.map(async (asset) => {
        const fileName = await asset.getFilename();

        return {
          id: asset.id,
          name: fileName,
          originalName: fileName,
          uri: await asset.getUri(),
        };
      })
    );

    const existingNames = new Set(
      songs.map((song) => getOriginalFileName(song))
    );

    const newSongs = foundSongs.filter((song) => {
      const normalizedName = song.originalName.trim().toLowerCase();

      if (existingNames.has(normalizedName)) {
        console.log('Canción duplicada, se omite:', song.originalName);
        return false;
      }

      existingNames.add(normalizedName);
      return true;
    });

    const updatedSongs = [...songs, ...newSongs];

    setSongs(updatedSongs);

    const saved = saveLibrary(updatedSongs);

    console.log('Canciones nuevas encontradas:', newSongs.length);
    console.log('Biblioteca actualizada:', updatedSongs.length);
    console.log('Guardado correcto:', saved);
   
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
      console.log('Resultado del selector:',
         result.canceled
        ? 'Importación cancelada'
        : `${result.assets.length} archivo(s) seleccionado(s)`);

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const existingNames = new Set(
      songs.map((song) => getOriginalFileName(song))
    );

    const newSongs = [];

    for(const song of result.assets) {
      const normalizedName = song.name.trim().toLowerCase();

      if (existingNames.has(normalizedName)) {
        console.log('Canción duplicada, se omite:', song.name);
        continue;
      }

      const fileName = `${Date.now()}-${song.name}`;
      const sourceFile = new File(song.uri);
      const destinationFile = new File(musicDirectory, fileName);

      await sourceFile.copy(destinationFile);
      console.log('Archivo copiado:', destinationFile.uri);
      
      const audioData = await getAudioMetadata(destinationFile.uri, [
        'name',
        'artist',
        'album',
        'artwork',
      ]);

      const importedSongs = {
        id: destinationFile.uri,
        name: audioData.metadata.name || song.name,
        originalName: song.name,
        uri: destinationFile.uri,
        artist: audioData.metadata.artist || 'Artista desconocido',
        album: audioData.metadata.album || 'Album desconocido',
        artwork: audioData.metadata.artwork || null,
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
        playbackQueue.current = updatedSongs;
        playbackQueueSource.current = 'all';

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

  const playSong = (
    song, 
    autoPlay = true, 
    queue = songs,
    queueSource = playbackQueueSource.current
  ) => {
    playbackQueue.current = queue.length > 0 ? queue : [song];
    playbackQueueSource.current = queueSource;
    
    console.log('Cancion seleccionada:', song.name, song.uri);
    console.log('Cola de reproducción:', playbackQueue.current.length);
    console.log('Origen de la cola:', playbackQueueSource.current);

    player.replace({ uri: song.uri });
    setSongTitle(song.name);
    setCurrentSongId(song.id);
    setSliderPosition(null);

    if (autoPlay) {
      pendingAutoPlay.current = false;
      waitingForLoad.current = false;
      player.play();
    } else {
      pendingAutoPlay.current = true;
      waitingForUnload.current = true;
      waitingForLoad.current = false;
    }
  };

  const playNextSong = () => {
    const queue = playbackQueue.current;

    if (queue.length === 0) {
      return;
    }

    const currentIndex = queue.findIndex(
      (song) => song.id === currentSongId
    );

    const nextIndex =
      currentIndex === -1 || currentIndex === queue.length - 1
      ? 0
      : currentIndex + 1;

    playSong(
      queue[nextIndex], 
      true, 
      queue,
      playbackQueueSource.current
    );
  };

  const playPreviousSong = () => {
    const queue = playbackQueue.current;

    if (queue.length === 0) {
      return;
    }

    const currentIndex = queue.findIndex(
      (song) => song.id === currentSongId
    );

    const previousIndex =
      currentIndex === -1 || currentIndex === 0
      ? queue.length - 1
      : currentIndex - 1;

    playSong(
      queue[previousIndex],
      true, 
      queue,
      playbackQueueSource.current
    );
  };

  useEffect(() => {
    if (!status.didJustFinish) {
      finishHandled.current = false;
      return;
    }

    if (finishHandled.current) {
      return;
    }

    finishHandled.current = true;

    if (repeatEnabled) {
      return;
    }

    const queue = playbackQueue.current;

    if (queue.length <= 1) {
      return;
    }

    const currentIndex = queue.findIndex(
      (song) => song.id === currentSongId
    );

    if (currentIndex !== -1) {
      const nextIndex =
        currentIndex === queue.length - 1
          ? 0
          : currentIndex + 1;

      playSong(
        queue[nextIndex],
        false,
        queue,
        playbackQueueSource.current
      );
    }
  }, [status.didJustFinish, repeatEnabled, currentSongId]);

  const openImportMenu = () => {
    setImportMenuVisible(true);
  };

  const openAlbum = (album) => {
    setAlbumSource(
      selectedLibrary === 'favorites' ? 'favorites' : 'albums'
    );

    setSelectedAlbum(album);
    setSearchQuery('');
    setSearchVisible(false);
    Keyboard.dismiss();
  };

  const closeAlbum = () => {
    setSelectedAlbum(null);
    setSearchQuery('');
    setSearchVisible(false);
  };

  const toggleFavorite = (songId) => {
    const isFavorite = favoriteSongIds.includes(songId);

    const updatedFavorites = isFavorite
      ? favoriteSongIds.filter((id) => id !== songId)
      : [...favoriteSongIds, songId];

    const saved = saveFavorites(updatedFavorites);

    if (saved) {
      setFavoriteSongIds(updatedFavorites);

      if (isFavorite && albumSource === 'favorites' && selectedAlbum) {
        setSelectedAlbum((currentAlbum) => {
          if (!currentAlbum) {
            return currentAlbum;
          }

          return {
            ...currentAlbum,
            songs: currentAlbum.songs.filter(
              (song) => song.id !== songId
            ),
          };
        });
      }

      if (
        isFavorite &&
        (
          playbackQueueSource.current === 'favorites' ||
          playbackQueueSource.current === 'favoriteAlbum'
        )
      ) {
        playbackQueue.current = playbackQueue.current.filter(
          (song) => song.id !== songId
        );

        console.log(
          'Canción retirada de la cola de Favoritos:',
          songId
        );
      }
    }
  };

  const removeSongFromLibrary = (song) => {
    Alert.alert(
      'Quitar canción',
      `¿Quieres quitar "${song.name}" de tu biblioteca? También se quitará de Favoritos, pero el archivo de audio permanecerá en tu teléfono.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () => {
            const updatedSongs = songs.filter(
              (item) => item.id !== song.id
            );

            const updatedFavorites = favoriteSongIds.filter(
              (id) => id !== song.id
            );

            const librarySaved = saveLibrary(updatedSongs);
            const favoritesSaved = saveFavorites(updatedFavorites);

            if(!librarySaved || !favoritesSaved) {
              const libraryRestored = saveLibrary(songs);
              const favoriteRestored = saveFavorites(favoriteSongIds);

              console.log('Biblioteca restaurada:', libraryRestored);
              console.log('Favoritos restaurados:', favoriteRestored);

              Alert.alert(
                'Error',
                'No se pudo actualizar la biblioteca. Inténtalo nuevamente.'
              );
              return;
            }

            setSongs(updatedSongs);
            setFavoriteSongIds(updatedFavorites);

            if (selectedAlbum) {
              setSelectedAlbum((currentAlbum) => {
                if (!currentAlbum) {
                  return currentAlbum;
                }

                return {
                  ...currentAlbum,
                  songs: currentAlbum.songs.filter(
                    (item) => item.id !== song.id
                  ),
                };
              });
            }

            playbackQueue.current = playbackQueue.current.filter(
              (item) => item.id !== song.id
            );

            if(currentSongId === song.id) {
              player.pause();
              setSongTitle(null);
              setCurrentSongId(null);
              setSliderPosition(null);
            }

            console.log('Canción retirada de la biblioteca:', song.name);
            console.log('Archivo de audio conservado:', song.uri);
          },
        },
      ]
    );
  };

  const removeAlbumFromLibrary = (album) => {
    Alert.alert(
      'Eliminar álbum',
      `¿Quieres eliminar "${album.name}" de tu biblioteca y de tus favoritos? Las canciones originales permanecerán en tu teléfono.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            const albumSongIds = album.songs.map((song) => song.id);
            const albumSongIdsSet = new Set(albumSongIds);

            const updatedSongs = songs.filter(
              (song) => !albumSongIdsSet.has(song.id)
            );

            const updatedFavorites = favoriteSongIds.filter(
              (songId) => !albumSongIdsSet.has(songId)
            );

            const librarySaved = saveLibrary(updatedSongs);
            const favoritesSaved = saveFavorites(updatedFavorites);

            if (!librarySaved || !favoritesSaved) {
              const libraryRestored = saveLibrary(songs);
              const favoriteRestored = saveFavorites(favoriteSongIds);

              console.log('Biblioteca restaurada:', libraryRestored);
              console.log('Favoritos restaurados:', favoriteRestored);

              Alert.alert(
                'Error',
                'No se pudo eliminar el álbum. Tu biblioteca se ha conservado.'
              );
              return;
            }

            setSongs(updatedSongs);
            setFavoriteSongIds(updatedFavorites);

            playbackQueue.current = playbackQueue.current.filter(
              (song) => !albumSongIdsSet.has(song.id)
            );

            if (albumSongIdsSet.has(currentSongId)) {
              player.pause();
              setCurrentSongId(null);
              setSongTitle(null);
              setSliderPosition(null);
            }

            if (selectedAlbum?.id === album.id) {
              setSelectedAlbum(null);
              setAlbumSource('albums');
            }

            console.log(
              `Álbum eliminado: ${album.name}. Archivo de audio conservado.`
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={styles.container}
        edges={['top', 'right', 'bottom', 'left']}
    >

      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >

      <StatusBar style="light" />

      <View style={{ display: keyboardVisible ? 'none' : 'flex' }}>

      <View style={styles.header}>
        <Text style={styles.title}>CANDY MUSIC</Text>
        <Text style={styles.subtitle}>Tu música, a tu manera.</Text>
      </View>

      {(selectedLibraryView === 'albums' || selectedAlbum) && (
        <View style={styles.miniPlayer}>
          <View style={styles.miniPlayerInfo}>
            <Text style={styles.miniPlayerTitle} numberOfLines={1}>
              {currentSong?.name || songTitle || 'Candy Music'}
            </Text>

            <Text style={styles.miniPlayerArtist} numberOfLines={1}>
              {currentSong?.artist || 'Tu música, a tu manera'}
            </Text>
          </View>

          <View style={styles.miniPlayerControls}>
            <Pressable
              style={styles.miniPlayerSkipButton}
              onPress={playPreviousSong} 
              disabled={songs.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Canción anterior"
            >
              <Text style={styles.miniPlayerSkipButtonText}>⏮</Text>
            </Pressable>

            <Pressable
              style={styles.miniPlayerButton}
              onPress={() => {
                if (!currentSong) {
                  return;
                }

                if (status.playing) {
                  player.pause();
                } else {
                  player.play();
                }
              }}
              disabled={!currentSongId}
              accessibilityRole="button"
              accessibilityLabel={
                status.playing ? 'Pausar canción' : 'Reproducir canción'
              }
            >
              <Text style={styles.miniPlayerButtonText}>
                {status.playing ? '⏸' : '▶'}
              </Text>
            </Pressable>

            <Pressable  
              style={styles.miniPlayerSkipButton}
              onPress={playNextSong}   
              disabled={songs.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Canción siguiente"
            >
              <Text style={styles.miniPlayerSkipButtonText}>⏭</Text>
            </Pressable>
          </View>    
        </View>
      )}

      <View 
        style={[
          styles.player,
          (selectedLibraryView === 'albums' || selectedAlbum) && 
            styles.playerHidden,
        ]}
      >
        <View style={styles.artworkContainer}>
          {currentSong?.artwork ? (
            <Animated.Image
              source={{ uri: currentSong.artwork }}
              style={[
                styles.artwork,
              {
                transform: [{ scale: artworkScale }],
              },
              ]}  
              resizeMode="cover"
            />
          ) : (
            <Animated.Text 
              style={[
                styles.note,
                {
                  transform: [{ scale: artworkScale }],
                },
              ]}
            >
              ♫
            </Animated.Text>  
          )}
        </View>

          <Text style={styles.songTitle}>
            {songTitle || 'Elige una canción'}
          </Text>

          {currentSong && (
            <>
              <Text style={styles.songArtist} numberOfLines={1}>
                {currentSong.artist || 'Artista desconocido'}
              </Text>

              <Text style={styles.songAlbum} numberOfLines={1}>
                {currentSong.album || 'Album desconocido'}
              </Text>
            </>
          )}

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

        <View style={styles.playbackControls}>
          <Pressable
            style={[
              styles.repeatButton,
            repeatEnabled && styles.repeatButtonActive
          ]}
            onPress={() => {
              const newRepeatValue = !repeatEnabled;

              console.log('Botón repetición pulsado', newRepeatValue);
              setRepeatEnabled(newRepeatValue);
            }}
          >
            <Text style={styles.repeatButtonText}>🔁</Text>
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={playPreviousSong}
          >
            <Text style={styles.skipButtonText}>⏮</Text>
          </Pressable>

          <Pressable
            style={styles.playButton}
            onPress={() =>{
              if (status.playing) {
                player.pause();
              } else {
                player.play();
              }
            }}
          >
            <Text style={styles.playButtonText}>
              {status.playing ? '⏸' : '▶'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={playNextSong}
          >
              <Text style={styles.skipButtonText}>⏭</Text>
          </Pressable>

          <Pressable
            style={styles.favoritePlayerButton}
            onPress={() => {
              if (currentSongId) {
                toggleFavorite(currentSongId);
              }
            }}
            disabled={!currentSongId}
            accessibilityRole="button"
            accessibilityLabel={
              favoriteSongIds.includes(currentSongId)
              ? 'Quitar canción de favoritos'
              : 'Agregar canción a favoritos'
            }
          >
            <Text
              style={[
                styles.favoritePlayerButtonText,
                favoriteSongIds.includes(currentSongId) &&
                  styles.favoritePlayerButtonActive,
              ]}
            >
              {favoriteSongIds.includes(currentSongId) ? "♥" : "♡"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.secondaryActions}>
          <Pressable style={styles.secondaryButton} onPress={openImportMenu}>
              <Text style={styles.secondaryButtonText}>📂 Importar canciones</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={loadSongs}
            >
            <Text style={styles.secondaryButtonText}>🔎 Buscar canciones</Text>
          </Pressable>
        </View>
        </View>
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
        <View style={styles.libraryTabs}>
          <Pressable
            style={[
              styles.libraryTab,
              selectedLibraryView === 'songs' &&
                selectedLibrary === 'all' &&
                styles.libraryTabActive,
            ]}
            onPress={() => {
              setSelectedAlbum(null);
              setSelectedLibraryView('songs');
              setSelectedLibrary('all');
            }}
          >
            <Text 
              style={[
                styles.libraryTabText,
                selectedLibraryView === 'songs' &&
                  selectedLibrary === 'all' &&
                  styles.libraryTabTextActive,
              ]}
            >      
              ♫ Biblioteca
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.libraryTab,
              selectedLibraryView === 'albums' &&
               styles.libraryTabActive,
            ]}
            onPress={() => {
              setSelectedAlbum(null);
              setSelectedLibraryView('albums');
              setSelectedLibrary('all');
            }}  
          >
            <Text 
              style={[
                styles.libraryTabText,
                selectedLibraryView === 'albums' &&
                  styles.libraryTabTextActive,
              ]}
            >      
              ◉ Álbumes
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.libraryTab,
              selectedLibraryView === 'songs' &&
                selectedLibrary === 'favorites' &&
                styles.libraryTabActive,
            ]}
            onPress={() => {
              setSelectedAlbum(null);
              setSelectedLibraryView('songs');
              setSelectedLibrary('favorites');
            }}
          >
            <Text 
              style={[
                styles.libraryTabText,
                selectedLibraryView === 'songs' &&
                  selectedLibrary === 'favorites' &&
                  styles.libraryTabTextActive,
              ]}
            >
              ♥ Favoritos
            </Text>
          </Pressable>  
        </View>

        <View style={styles.libraryHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.libraryTitle}>
              {selectedLibraryView === 'albums'
              ? 'Álbumes'
              : selectedLibrary === 'favorites'
                  ? 'Mis favoritos'
                  : 'Mi biblioteca'}
            </Text>

            <Text style={styles.libraryCount}>
              {selectedLibraryView === 'albums'
                ? `${albums.length} ${albums.length === 1 ? 'álbum' : 'álbumes'}`
                : selectedLibrary === 'favorites'
                  ? `${favoriteSongs.length} ${favoriteSongs.length === 1 ? 'canción favorita' : 'canciones favoritas'}`
                  : `${songs.length} ${songs.length === 1 ? 'canción' : 'canciones'}`}
            </Text>
          </View>

          <Pressable
            style={styles.sortButton}
            onPress={() => {
              setSortOrder((currentOrder) =>
                currentOrder === 'asc' ? 'desc' : 'asc'
              );
            }}
          >
            <Text style={styles.sortButtonText}>
              {sortOrder === 'asc' ? 'A-Z ↕' : 'Z-A ↕'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.searchToggleButton}
            onPress={() => {
              if (searchVisible) {
                setSearchVisible(false);
                setSearchQuery('');
                Keyboard.dismiss();
              } else {
                setSearchVisible(true);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={
              searchVisible ? 'Cerrar búsqueda' : 'Abrir búsqueda'
            }
          >
            <Text style={styles.searchToggleButtonText}>
              {searchVisible ? 'X' : '⌕'}
            </Text>
          </Pressable>  

          {selectedLibrary === 'all' && (
            <Pressable
              style={styles.clearLibraryButton}
              onPress={clearLibrary}
            >
              <Text style={styles.clearLibraryButtonText}>Limpiar</Text>
            </Pressable>
          )}
        </View>

        {searchVisible && (  
          <TextInput
            style={styles.searchInput}
            placeholder={
              selectedLibraryView === 'albums' ||
              selectedLibrary === 'favorites'
                ? 'Buscar álbum, artista o canción...'
                : 'Buscar una canción...'
            }    
            placeholderTextColor='#85859D'
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />  
        )}
         {selectedAlbum ? (
            <View style={{ flex: 1, width: '100%' }}>
              {/* Boton para regresar */}
              <Pressable
                onPress={closeAlbum}
                style={{
                  paddingVertical: 12,
                  marginBottom: 12,
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  albumSource === 'favorites'
                    ? "Regresar a favoritos"
                    : 'Regresar a los álbumes'
                }    
             >
              <Text 
                style={{ 
                  color: '#A78BFA', 
                  fontSize: 16, 
                  fontWeight: '600' 
                }}
              >
                {albumSource === 'favorites'
                  ? '← Volver a favoritos'
                  : '← Volver a los álbumes'}
              </Text>
             </Pressable>

             {/* Información del álbum */}
             <View style={{ alignItems: 'center', marginBottom: 24 }}>
              {selectedAlbum.artwork ? (
                <Image
                  source={{ uri: selectedAlbum.artwork }}
                  style={{
                    width: 190,
                    height: 190,
                    borderRadius: 12,
                    marginBottom: 18,
                  }}
                  resizeMode="cover"
                />
                ) : (
                  <View 
                    style={{
                      width: 190,
                      height: 190,
                      borderRadius: 12,
                      backgroundColor: '#1C1C2E',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 18,
                    }}
                  >
                    <Text style={{ color: '#A78BFA', fontSize: 64 }}>
                      ♫
                    </Text>
                  </View>     
                )}

                <Text
                  style={{
                    color: '#FFFFFF',
                    fontSize: 22,
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                >
                  {selectedAlbum.name}
                </Text>

                <Text 
                  style={{
                    color: '#A78BFA',
                    fontSize: 15,
                    marginTop: 6,
                    textAlign: 'center',
                  }}
                >
                  {selectedAlbum.artist}
                </Text>

                <Text
                  style={{
                    color: '#85859D',
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  {selectedAlbum.songs.length}{' '}
                  {albumSource === 'favorites'
                    ? selectedAlbum.songs.length === 1 
                      ? 'favorita'
                      : 'favoritas'
                    : selectedAlbum.songs.length === 1
                      ? 'canción' 
                      : 'canciones'}
                </Text>  
              </View>

              {/* Botón para eliminar el álbum completo */}
              {albumSource === 'albums' && (
                <Pressable
                  onPress={() => removeAlbumFromLibrary(selectedAlbum)}
                  style={{
                    backgroundColor: '#302448',
                    borderWidth: 1,
                    borderColor: '#A78BFA',
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar álbum completo"
                >
                  <Text 
                    style={{
                      color: '#E9DFFF',
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                  >
                    🗑 Eliminar álbum completo
                  </Text>  
                </Pressable>  
              )}

              {/* Lista de canciones del album */}
              <FlatList
                data={selectedAlbum.songs}
                keyExtractor={(song) => song.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isCurrentSong = item.id === currentSongId;

                  return (
                    <View style={styles.songRow}>  
                      <Pressable
                        style={[
                          styles.songItem,
                          isCurrentSong && styles.songItemActive,
                          { flex: 1, marginBottom: 8},
                        ]}
                        onPress={() => 
                          playSong(
                            item,
                            true, 
                            selectedAlbum.songs,
                            albumSource === 'favorites' ? 'favoriteAlbum' : 'album'
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.songItemText,
                            isCurrentSong && styles.songItemTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {isCurrentSong ? '♫' : '♪'} {item.name} 
                        </Text>  
                      </Pressable>  

                      <Pressable
                        style={styles.removeSongButton}
                        onPress={() => {
                          if (albumSource === 'favorites') {
                            toggleFavorite(item.id);
                          } else {
                            removeSongFromLibrary(item);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          albumSource === 'favorites'
                            ? 'Quitar canción de favoritos'
                            : 'Quitar canción de la biblioteca'
                        }
                      >
                        <Text style={styles.removeSongButtonText}>X</Text>
                      </Pressable>
                    </View>
                  );
                }}        

                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    Este álbum todavía no tiene canciones.
                  </Text>
                }
              />
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={
                selectedLibraryView === 'albums' && selectedLibrary === 'all'
                  ? displayedAlbums
                  : selectedLibrary === 'favorites'
                    ? displayedFavoriteAlbums
                    : displayedSongs 
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                if (
                  (selectedLibraryView === 'albums' && selectedLibrary === 'all') ||
                  selectedLibrary === 'favorites'
                 ) {
                  return (
                    <Pressable
                      style={styles.albumRow}
                      onPress={() => openAlbum(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir álbum ${item.name}`}
                    >
                      {item.artwork ? (
                        <Image
                          source={{ uri: item.artwork }}
                          style={styles.albumArtwork}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.albumArtworkFallback}>
                          <Text style={styles.albumArtworkNote}>♫</Text>
                        </View>
                      )}  

                        <View style={styles.albumInfo}>
                          <Text style={styles.albumName} numberOfLines={1}>
                            {item.name}
                          </Text>

                          <Text style={styles.albumArtist} numberOfLines={1}>
                            {item.artist}
                          </Text> 

                          <Text style={styles.albumSongCount}>
                            {item.songs.length}{' '}
                            {item.songs.length === 1 
                              ? selectedLibrary === 'favorites'
                                ? 'favorita'
                                : 'canción'
                              : selectedLibrary === 'favorites'
                                ? 'favoritas'
                                : 'canciones '}
                          </Text>
                        </View>    
                    </Pressable>    
                  );
                }

                const isCurrentSong = item.id === currentSongId;

                return (
                  <View style={styles.songRow}>
                    <Pressable
                      style={[
                        styles.songItem,
                        isCurrentSong && styles.songItemActive,
                        { flex: 1 },
                      ]}
                      onPress={() => 
                        playSong(
                          item, 
                          true, 
                          displayedSongs,
                          selectedLibrary === 'favorites' ? 'favorites' : 'all'
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.songItemText,
                          isCurrentSong && styles.songItemTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {isCurrentSong ? '♫' : '♪'} {item.name}
                      </Text>    
                    </Pressable>

                    <Pressable
                      style={styles.removeSongButton}
                      onPress={() => {
                        if (selectedLibrary === 'favorites') {
                          toggleFavorite(item.id);
                        }  else {
                          removeSongFromLibrary(item);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        selectedLibrary === 'favorites'
                        ? 'Quitar de favoritos'
                        : 'Quitar de la biblioteca'
                      }
                    >
                      <Text style={styles.removeSongButtonText}>X</Text>
                    </Pressable>
                  </View>      
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {selectedLibraryView === 'albums' 
                    ? 'Todavía no tienes álbumes para mostrar.'
                    : selectedLibrary === 'favorites'
                      ? 'Todavía no tienes canciones favoritas.'
                      : 'Importa tus canciones para verlas aquí.'}
                </Text>
              }
            />
          )}  
          </View>  

        <Text style={styles.footer}> TU MÚSICA. TU MOMENTO</Text>
      </KeyboardAvoidingView>  
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
  header: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#393653',
  },
  playerHidden: {
    display: 'none',
  },
  miniPlayer: {
    width: '100%',
    minHeight: 66,
    backgroundColor: '#1C1C2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#393653',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniPlayerInfo: {
    flex: 1,
    marginRight: 12,
  },
  miniPlayerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  miniPlayerArtist: {
    color: '#B9B9CC',
    fontSize: 12, 
    marginTop: 4,
  },
  miniPlayerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayerButtonText: {
    color: '#21152F',
    fontSize: 20,
    fontWeight: 'bold',
  },
  miniPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniPlayerSkipButton: {
    width: 34,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#302448',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayerSkipButtonText: {
    color: '#E9DFFF',
    fontSize: 17,
    fontWeight: 'bold',
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
  libraryTabs: {
    flexDirection: 'row',
    backgroundColor: '#10101C',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  libraryTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  libraryTabActive: {
    backgroundColor: '#51436F',
  },
  libraryTabText: {
    color: '#B9B9CC',
    fontSize: 13,
    fontWeight: '600',
  },
  libraryTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sortButton: {
    backgroundColor: '#29243B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#51436F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonText: {
    color: '#E9DFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  searchToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#29243B',
    borderWidth: 1,
    borderColor: '#51436F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchToggleButtonText: {
    color: '#C4B5FD',
    fontSize: 25,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: '#10101C',
    borderWidth: 1,
    borderColor: '#51436F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 10,
  },
  clearLibraryButtonText: {
    color: '#E9DFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  libraryTitle: {
    color: '#A78BFA',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  libraryCount: {
    color: '#85859D',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#302D46',
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#302D46',
  },
  albumArtwork: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#29243B',
  },
  albumArtworkFallback: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#302448',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumArtworkNote: {
    color: '#A78BFA',
    fontSize: 28,
  },
  albumInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  albumName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  albumArtist: {
    color: '#C4B5FD',
    fontSize: 13,
    marginTop: 4,
  },
  albumSongCount: {
    color: '#85859D',
    fontSize: 11,
    marginTop: 4,
  },
  removeSongButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeSongButtonText: {
    color: '#A78BFA',
    fontSize: 18,
    fontWeight: 'bold',
  },
  songItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  songItemActive: {
    backgroundColor: '#302747',
    borderColor: '#A78BFA',
  },
  songItemText: {
    color: '#D8D5E5',
    fontSize: 14,
    fontWeight: '500'
  },
  songItemTextActive: {
    color: '#C4B5FD',
    fontWeight: '700',
  },
  emptyText: {
    color: '#B9B9CC',
    fontSize: 14,
    paddingVertical: 8,
  },
  artworkContainer: {
    width: 115,
    height: 115,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  note: {
    color: '#A78BFA',
    fontSize: 48,
  },
  artwork: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    backgroundColor: '#29243B',
  },
  songTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  songArtist: {
    color: '#C4B5FD',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  songAlbum: {
    color: '#85859D',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  message: {
    color: '#B9B9CC',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  time: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  slider: {
    width: '100%',
    height: 32,
    marginTop: 2,
  },
  button: {
    backgroundColor: '#7C3AED',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginTop: 10,
  },
  clearLibraryButton: {
    backgroundColor: '#29243B',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#51436F',
    marginTop: 0,
    marginBottom: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryActions: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#29243B',
    borderWidth: 1,
    borderColor: '#51436F',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#E9DFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  playbackControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
    marginBottom: 2,
  },
  repeatButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#29243B',
    borderWidth: 1,
    borderColor: '#51436F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatButtonText: {
    fontSize: 20,
    color: '#C4B5FD',
  },
  repeatButtonActive: {
    backgroundColor: '#51436F',
    borderRadius: 12,
    overflow: 'hidden',
  },
  skipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#302448',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    color: '#E9DFFF',
    fontSize: 23,
    fontWeight: 'bold',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: '#21152F',
    fontSize: 27,
    fontWeight: 'bold',
  },
  favoritePlayerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#302448',
    borderWidth: 1,
    borderColor: '#51436F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritePlayerButtonText: {
    color: '#D8D5E5',
    fontSize: 25,
  },
  favoritePlayerButtonActive: {
    color: '#FF4D6D',
  },

  footer: {
    color: '#85859D',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 4,
    textAlign: 'center',
  }
});
