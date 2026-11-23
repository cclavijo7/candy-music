import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { getAudioMetadata } from "@missingcore/audio-metadata";
import { useEffect, useRef, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { getDocumentAsync } from "expo-document-picker";
import { AssetField, MediaType, Query, requestPermissionsAsync } from "expo-media-library";
import { StatusBar } from "expo-status-bar";
import { Alert, Animated, Easing, FlatList, Image,  Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

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

const shuffleWithCurrentFirst = (queue, currentSongId) => {
  const currentSong = queue.find(
    (song) => song.id === currentSongId
  );

  const remainingSongs = queue.filter(
    (song) => song.id !== currentSongId
  );

  //Mezclar las canciones restantes.
  for (let i = remainingSongs.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [remainingSongs[i], remainingSongs[randomIndex]] = [
      remainingSongs[randomIndex],
      remainingSongs[i],
    ];
  }

  return currentSong
    ? [currentSong, ...remainingSongs]
    : remainingSongs;
};

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
  const originalQueue = useRef([]);

  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  const artworkScale = useRef(new Animated.Value(1)).current;
  const vinylRotation = useRef(new Animated.Value(0)).current;
  const lastVinylSongId = useRef(null);

  const vinylRotate = vinylRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Animaciones del botón de importación.
  const importButtonScale = useRef(new Animated.Value(1)).current;
  const importButtonGlow = useRef(new Animated.Value(0)).current;

   // Animaciones del botón de reproducir álbum.
  const albumPlayScale = useRef(new Animated.Value(1)).current;
  const albumPlayGrow = useRef(new Animated.Value(0)).current;

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
  
  //Pantalla actica de Candy Music
  const [activeScreen, setActiveScreen] = useState('player');
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
  
  useEffect(() => {
    if (!status.playing || currentSong?.artwork || !currentSongId) {
      vinylRotation.stopAnimation();
      
      if (currentSong?.artwork || !currentSongId) {
        lastVinylSongId.current = null;
      }

      return;
    }
    
    // Reiniciar la rotación únicamente cuando cambia la canción.
    if (lastVinylSongId.current !== currentSongId) {
      vinylRotation.stopAnimation();
      vinylRotation.setValue(0);
      lastVinylSongId.current = currentSongId;
    }

    const rotationAnimation = Animated.loop(
      Animated.timing(vinylRotation, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    rotationAnimation.start();

    return () => {
      rotationAnimation.stop();
    };
  }, [
    status.playing,
    currentSong?.artwork,
    currentSongId,
    vinylRotation,
  ]);

  // Calcular el progresp de reproducción.
  const progressDuration = status.duration || 0;
  
  const progressValue = 
    sliderPosition ?? status.currentTime ?? 0;

  const progressPercent =
    currentSongId && progressDuration > 0
      ? Math.min(
        100,
        Math.max(0, (progressValue / progressDuration) * 100)
      )
    : 0;

  const showMiniPlayer = activeScreen !== 'player';

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
  const [libraryOptionsVisible, setLibraryOptionsVisible] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  
  const toggleShuffle = () => {
    if (shuffleEnabled) {
      //Recuperar el orden original.
      if(originalQueue.current.length > 0) {
        playbackQueue.current = [...originalQueue.current];
      }

      setShuffleEnabled(false);
      console.log('Reproducción aleatoria desactivada');
      return;
    }

    // Guardar el orden normal antes de mezclar.
    originalQueue.current = [...playbackQueue.current];

    // Mezclar sin cambiar la canción actual.
    playbackQueue.current = shuffleWithCurrentFirst(
      playbackQueue.current,
      currentSongId
    );
    
    setShuffleEnabled(true);

    console.log('Reproducción aleatoria activada');
    console.log(
      'Canciones en la cola aleatoria:',
      playbackQueue.current.length
    );
  };

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
    originalQueue.current = [];
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

const confirmClearLibrary = () => {
  Alert.alert(
    'Limpiar biblioteca',
    '¿Quieres quitar todas las canciones y favoritos de Candy Music? Los archivos de audio permaneceran en tu teléfono.',
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Limpiar',
        style: 'destructive',
        onPress: () => {
          setLibraryOptionsVisible(false);
          clearLibrary();
        },
      },
    ]
  );
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
    console.log("🔎 [ESCANEO] Se ejecutó loadSongs");
    console.log("🔎 [ESCANEO]  Solicitando permisos...");
    try{
    const permission = await requestPermissionsAsync(false, ['audio']);
    console.log("🔎 [ESCANEO] Resultado de permisos:", permission);
    
    console.log("🔎 [ESCANEO] ¿Permiso concedido?:", permission.granted);  
    if (!permission.granted) {
      return;
    }

    const assets = await new Query()
      .eq(AssetField.MEDIA_TYPE, MediaType.AUDIO) 
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

      console.log(
         'Resultado del selector:',
        result.canceled
          ? 'Importación cancelada'
          : `${result.assets.length} archivo(s) seleccionado(s)`
      );

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const existingNames = new Set(
      songs.map((song) => getOriginalFileName(song))
    );

    const newSongs = [];

    for(const [index, song] of result.assets.entries()) {
      const originalName = String(song.name || 'Audio sin nombre');
      const normalizedName = originalName.trim().toLowerCase();

      if (existingNames.has(normalizedName)) {
        console.log('Canción duplicada, se omite:', originalName);
        continue;
      }

      try {
        const fileName = `${Date.now()}-${index}-${originalName}`;
        const sourceFile = new File(song.uri);
        const destinationFile = new File(musicDirectory, fileName);

        await sourceFile.copy(destinationFile);

        console.log('Archivo copiado:', destinationFile.uri);
       
        let metadata ={};
        
        try {
          const audioData = await getAudioMetadata(
            destinationFile.uri, 
            ['name', 'artist', 'album', 'artwork',]
          );

          metadata = audioData?.metadata || {};

        } catch (metadataError) {
          console.log(
            'No se pudieron leer los metadatos:',
            originalName,
            metadataError
          );
        }

          const importedSongs = {
            id: destinationFile.uri,
            name: metadata.name || originalName,
            originalName,
            uri: destinationFile.uri,
            artist: metadata.artist || 'Artista desconocido',
            album: metadata.album || 'Album desconocido',
            artwork: metadata.artwork || null,
          };

          newSongs.push(importedSongs);
          existingNames.add(normalizedName);

          console.log('Canción importada correctamente:', originalName);
        
        } catch (songError) {
          console.log(
            'No se pudo importar esta canción:',
            originalName,
            songError
          );
        }
      }  

      const updatedSongs = [...songs, ...newSongs];

      const saved = saveLibrary(updatedSongs);

      if (!saved) {
        console.log('Error: no se pudo guardar la biblioteca.');

        Alert.alert(
          'Error al guardar',
          'Los archivos se copiaron, pero no se pudo guardar la biblioteca. Intentalo nuevamente.'
        );

        return;
      }

      setSongs(updatedSongs);

      console.log('Canciones nuevas importadas:', newSongs.length);
      console.log('Total de canciones en biblioteca:', updatedSongs.length);
      console.log('Guardado correcto:', saved);


    } catch (error) {
      console.log('Error al importar canciones:', error);
    }
  };

  const playSong = (
    song, 
    autoPlay = true, 
    queue = songs,
    queueSource = playbackQueueSource.current,
    preserveQueue = false
  ) => {
    let nextQueue = queue;

    if (!preserveQueue) {
      // Guardar el orden original de la lista seleccionada.
      originalQueue.current =[...queue];

      // Si Shuffle esta activo, mezclar dejando la cancion elegida primero.
      if (shuffleEnabled) {
        nextQueue = shuffleWithCurrentFirst(queue, song.id); 
      }
    }

    playbackQueue.current = nextQueue.length > 0 ? nextQueue : [song];
    playbackQueueSource.current = queueSource;
    
    console.log('Cancion seleccionada:', song.name, song.uri);
    console.log('Cola de reproducción:', playbackQueue.current.length);
    console.log('Origen de la cola:', playbackQueueSource.current);
    console.log('Shuffle activo:', shuffleEnabled);

    player.replace({ uri: song.uri });
    setSongTitle(song.name);
    setCurrentSongId(song.id);
    setSliderPosition(null);

    if (autoPlay) {
      pendingAutoPlay.current = false;
      waitingForLoad.current = false;
      waitingForUnload.current = false;
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
      playbackQueueSource.current,
      true
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
      playbackQueueSource.current,
      true
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
        playbackQueueSource.current,
        true
      );
    }
  }, [status.didJustFinish, repeatEnabled, currentSongId]);

  const openImportMenu = () => {
    setImportMenuVisible(true);
  };

  const animateImportButtonIn = () => {
    Animated.parallel([
      Animated.spring(importButtonScale, {
        toValue: 0.96,
        useNativeDriver: true,
      }),

      Animated.timing(importButtonGlow, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateImportButtonOut = () => {
    Animated.parallel([
      Animated.spring(importButtonScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),

      Animated.timing(importButtonGlow, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateAlbumPlayButtonIn = () => {
    Animated.parallel([
      Animated.spring(albumPlayScale, {
        toValue: 0.96,
        useNativeDriver: true,
      }),

      Animated.timing(albumPlayGrow, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateAlbumPlayButtonOut = () => {
    Animated.parallel([
      Animated.spring(albumPlayScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),

      Animated.timing(albumPlayGrow, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
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

  const navigateTo = (screen) => {
    Keyboard.dismiss();

    setActiveScreen(screen);
    setLibraryOptionsVisible(false);
    setSelectedAlbum(null);
    setSearchQuery('');
    setSearchVisible(false);

    if (screen === 'library') {
      setSelectedLibrary('all');
      setSelectedLibraryView('songs');
    }

    if (screen === 'albums') {
      setSelectedLibrary('all');
      setSelectedLibraryView('albums');
    }

    if (screen === 'favorites') {
      setSelectedLibrary('favorites');
      setSelectedLibraryView('songs');
    }
  };

  const toggleFavorite = (songId) => {
    const isFavorite = favoriteSongIds.includes(songId);

    const updatedFavorites = isFavorite
      ? favoriteSongIds.filter((id) => id !== songId)
      : [...favoriteSongIds, songId];

    const saved = saveFavorites(updatedFavorites);

    if (!saved) {
      return;
    }

    setFavoriteSongIds(updatedFavorites);

    if (isFavorite && albumSource === 'favorites' && selectedAlbum) {
      setSelectedAlbum((currentAlbum) => {
        if (!currentAlbum) {
          return null;
        }

      const updatedAlbumSongs = currentAlbum.songs.filter(
        (song) => song.id !== songId
      );

      if (updatedAlbumSongs.length === 0) {
        return null;  
      }

      return {
        ...currentAlbum,
        songs: updatedAlbumSongs,
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
        
    originalQueue.current = originalQueue.current.filter(
      (song) => song.id !== songId
    );

    console.log(
      'Canción retirada de la cola de Favoritos:',
       songId
    );
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

            // Actualizar el álbum abierto.
            setSelectedAlbum((currentAlbum) => {
              if (!currentAlbum) {
                return null;
              }

              const remainingSongs = currentAlbum.songs.filter(
                (item) => item.id !== song.id
              );

              if (remainingSongs.length === 0) {
                return null;
              }

              return {
                ...currentAlbum,
                songs: remainingSongs,
              };
            });

            // Actualizar las colas de reproducción.
            playbackQueue.current = playbackQueue.current.filter(
              (item) => item.id !== song.id
            );

            originalQueue.current = originalQueue.current.filter(
              (item) => item.id !== song.id
            );

            // Detener la reproducción si quitamos la canción actual.
            if(currentSongId === song.id) {
              player.pause();

              pendingAutoPlay.current = false;
              waitingForLoad.current = false;
              waitingForUnload.current = false;

              finishHandled.current =  true;

              setSongTitle(null);
              setCurrentSongId(null);
              setSliderPosition(null);

              console.log('Reproducción  pendiente cancelada');
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

              // Retirar las canciones del álbum de las colas.
              playbackQueue.current = playbackQueue.current.filter(
                (song) => !albumSongIdsSet.has(song.id)
              );

              originalQueue.current = originalQueue.current.filter(
                (song) => !albumSongIdsSet.has(song.id)
              );

              // Detener la reproducción si la canción actual pertenece al álbum.
              if (albumSongIdsSet.has(currentSongId)) {
                player.pause();

                pendingAutoPlay.current = false;
                waitingForLoad.current = false;
                waitingForUnload.current = false;

                finishHandled.current = true;

                setCurrentSongId(null);
                setSongTitle(null);
                setSliderPosition(null);

                console.log('Reproducción pendiente cancelada.');
              }

              // Cerrar el detalle si corresponde al álbum eliminado.
              setSelectedAlbum((currentAlbum) => {
                if (currentAlbum?.id === album.id) {
                  return null;
                }

                return currentAlbum;
              });  

              if (selectedAlbum?.id === album.id) {
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

        <View style={{
          display: keyboardVisible ? 'none' : 'flex',
          flex: activeScreen === 'player' ? 1 : 0,
          }}
        >

        <View style={styles.header}>
          <Text style={styles.title}>CANDY MUSIC</Text>
          <Text style={styles.subtitle}>Tu música, a tu manera.</Text>
        </View>

        {showMiniPlayer && (
          <View style={styles.miniPlayer}>
            {currentSong?.artwork ? (
              <Image
                source={{ uri: currentSong.artwork }}
                style={styles.miniPlayerArtwork}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.miniPlayerArtworkPlaceholder}>
                <Animated.View 
                  style={[
                    styles.miniVinylDisc,
                    {
                      transform: [{ rotate: vinylRotate }],
                    },
                  ]}
                >    
                  <View style={styles.miniVinylGrooveOuter} />
                  <View style={styles.miniVinylGrooveMiddle} />
                  <View style={styles.miniVinylLabel}>
                    <Ionicons
                      name="musical-notes"
                      size={10}
                      color="#21152F"
                    />  
                  </View>
                </Animated.View>
              </View> 
            )}

            <Pressable
              style={styles.miniPlayerInfo}
              onPress={() => setActiveScreen('player')}
              accessibilityRole="button"
              accessibilityLabel="Abrir reproductor completo"
            >  
              <Text style={styles.miniPlayerTitle} numberOfLines={1}>
                {currentSong?.name || songTitle || 'Candy Music'}
              </Text>

              <Text style={styles.miniPlayerArtist} numberOfLines={1}>
                {currentSong?.artist || 'Tu música, a tu manera'}
              </Text>
            </Pressable>

            <View style={styles.miniPlayerControls}>
              <Pressable
                style={styles.miniPlayerSkipButton}
                onPress={playPreviousSong} 
                disabled={playbackQueue.current.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Canción anterior"
              >
                <Ionicons
                  name="play-skip-back"
                  size={18}
                  color="#E9DFFF"
                />  
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
                <Ionicons
                  name={status.playing ? 'pause' : 'play'}
                  size={21}
                  color="#21152F"
                />
              </Pressable>

              <Pressable  
                style={styles.miniPlayerSkipButton}
                onPress={playNextSong}   
                disabled={playbackQueue.current.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Canción siguiente"
              >
                <Ionicons
                  name="play-skip-forward"
                  size={18}
                  color="#E9DFFF"
                />  
              </Pressable>
            </View>    
          </View>
        )}

        {activeScreen === 'player' && (
        <View style={styles.player}>
          
          {/* ZONA 1: PORTADA E INFORMACIÓN */}
          <View style={styles.playerInfoRow}>
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
                <Animated.View
                  style={[
                    styles.artworkFallback,
                    {
                      transform: [{ scale: artworkScale }],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={['#55358A', '#30204F', '#19172B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.artworkFallbackGradient}
                  >
                    <Animated.View
                      style={[
                        styles.vinylDisc,
                        {
                          transform: [{ rotate: vinylRotate }],
                        },
                      ]}
                    >
                      <View style={styles.vinylGrooveOuter} />
                      <View style={styles.vinylGrooveMiddle} />
                      <View style={styles.vinylGrooveInner} />

                      <LinearGradient
                        colors={['#A78BFA', '#7046B8', '#493078']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.vinylLabel}
                      >
                        <Ionicons
                          name="musical-notes"
                          size={42}
                          color="#F0E7FF"
                        />
                      </LinearGradient>
                    </Animated.View>        
                  </LinearGradient>  
                </Animated.View>  
              )}
            </View>

            <View style={styles.playerSongInfo}>  
              <View style={styles.playerTrackDetails}>
                <Text style={styles.songTitle} numberOfLines={1}>
                  {songTitle || 'Elige una canción'}
                </Text>

                <Text style={styles.songArtist} numberOfLines={1}>
                  {currentSong?.artist || 'Artista desconocido'}
                </Text>

                {currentSong?.album ? (
                    <Text style={styles.songAlbum} numberOfLines={1}>
                      {currentSong.album}
                    </Text>
                ) : null}
              </View>

              <Pressable
                style={styles.favoritePlayerButton}
                onPress={() =>{
                  if (currentSongId) toggleFavorite(currentSongId);
                }}
                disabled={!currentSongId}
                accessibilityRole="button"
                accessibilityLabel={
                  favoriteSongIds.includes(currentSongId)
                    ? 'Quitar canción de favoritos'
                    : 'Agregar canción a favoritos'
                }
              >
                <Ionicons
                  name={
                    favoriteSongIds.includes(currentSongId)
                      ? 'heart'
                      : 'heart-outline'
                  }
                  size={25}
                  color={
                    favoriteSongIds.includes(currentSongId)
                      ? '#FF4D6D'
                      : '#D8D5E5'
                  }
                />  
              </Pressable>  
            </View>  
          </View>

          {/* ZONA 2: BARRA DE PROGRESO */}    
          <View style={styles.playerProgress}>  
            <View style={styles.progressTime}>  
              <Text style={styles.progressTimeText}>
                {currentSongId ? formatTime(status.currentTime) : '0:00'}
              </Text>  

              <Text style={styles.progressTimeText}>
                {currentSongId ? formatTime(status.duration) : '0:00'}
              </Text>  
            </View>

            <View style={styles.progressTrack}>
              <LinearGradient
                colors={['#7C3AED', '#A78BFA', '#C4B5FD']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.progressFill,
                  { width: `${progressPercent}%`},
                ]}
              />

            <View
              style={[
                styles.progressThumb,
                { left: `${progressPercent}%` },
              ]}
            />      

            <Slider
              style={styles.progressSlider}
              minimumValue={0}
              maximumValue={progressDuration > 0 ? progressDuration : 1}
              value={progressValue}
              minimumTrackTintColor="transparent"
              maximumTrackTintColor="transparent"
              thumbTintColor="transparent"
              onValueChange={(value) => setSliderPosition(value)}
              onSlidingComplete={async (value) => {
                if (!currentSongId) return;

                await player.seekTo(value);
                setSliderPosition(null);
              }}
            />
          </View>  
        </View>

          {/* ZONA 3: CONTROLES */}
          <View style={styles.playbackControls}>

            {/* SHUFFLE */}
            <Pressable
              style={[
                styles.repeatButton,
                shuffleEnabled && styles.repeatButtonActive,
              ]}
              onPress={toggleShuffle}
              accessibilityRole="button"
              accessibilityLabel={
                shuffleEnabled
                  ? 'Desactivar reproducción aleatoria'
                  : 'Activar reproducción aleatoria'
              }
            >
              <Ionicons
                name="shuffle"
                size={22}
                color={shuffleEnabled ? '#FFFFFF' : '#B9A9D5'}
              />  
            </Pressable>

            {/* CANCIÓN ANTERIOR*/ }
            <Pressable
              style={styles.skipButton}
              onPress={playPreviousSong}
              accessibilityRole="button"
              accessibilityLabel="Canción anterior"
            >
              <Ionicons
                name="play-skip-back"
                size={23}
                color="#FFFFFF"
              />  
            </Pressable>

            {/* REPRODUCIR / PAUSAR */}
            <Pressable
              style={styles.playButton}
              onPress={() =>{
                if (!currentSongId) {
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
              <Ionicons
                name={status.playing ? 'pause' : 'play'}
                size={29}
                color="#FFFFFF"
              />
            </Pressable>

            {/* CANCIÓN SIGUIENTE */}
            <Pressable
              style={styles.skipButton}
              onPress={playNextSong}
              accessibilityRole="button"
              accessibilityLabel="Canción siguiente"
            >
                <Ionicons
                  name="play-skip-forward"
                  size={23}
                  color="#FFFFFF"
                />  
            </Pressable>

            {/* REPETIR */}  
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
              accessibilityRole="button"
              accessibilityLabel={
                repeatEnabled ? 'Desactivar repetición' : 'Activar repetición'
              }
            >
              <Ionicons
                name="repeat"
                size={22}
                color={repeatEnabled ? '#FFFFFF' : '#B9A9D5'}
              />  
            </Pressable>

          </View>
        </View>
        )}
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

        {activeScreen !== 'player' && (
        <View style={styles.library}>

          {selectedLibrary === 'favorites' && !selectedAlbum && (
            <View style={styles.favoriteTabs}>
              <Pressable
                style={[
                  styles.favoriteTab,
                  selectedLibraryView === 'songs' &&
                    styles.favoriteTabActive,
                ]}
                onPress={() => setSelectedLibraryView('songs')}
              >
                <Text
                  style={[
                    styles.favoriteTabText,
                    selectedLibraryView === 'songs' &&
                      styles.favoriteTabTextActive,
                  ]}
                >
                  ♫ Canciones
                </Text>  
              </Pressable>

              <Pressable
                style={[
                  styles.favoriteTab,
                  selectedLibraryView === 'albums' &&
                    styles.favoriteTabActive,
                ]}
                  onPress={() => setSelectedLibraryView('albums')}
              >
                <Text
                  style={[
                    styles.favoriteTabText,
                    selectedLibraryView === 'albums' &&
                      styles.favoriteTabTextActive,
                  ]}
                >
                  ◉ Álbumes
                </Text>  
              </Pressable> 
            </View>       
          )}

          <View style={styles.libraryHeader}>
            <View style={styles.libraryHeading}>
              <Text style={styles.libraryTitle}>
                {selectedLibrary === 'favorites'
                  ? selectedLibraryView === 'albums'
                    ? 'Álbumes favoritos'
                    : 'Mis canciones favoritas'
                  : selectedLibraryView === 'albums'
                    ? 'Álbumes'
                    : 'Mi biblioteca'}
              </Text>

              <Text style={styles.libraryCount}>
                {selectedLibrary === 'favorites'
                  ? selectedLibraryView === 'albums'
                    ? `${favoriteAlbums.length} ${favoriteAlbums.length === 1 ? 'álbum favorito' : 'álbumes favoritos'}`
                    : `${favoriteSongs.length} ${favoriteSongs.length === 1 ? 'canción favorita' : 'canciones favoritas'}`
                  : selectedLibraryView === 'albums'
                      ? `${albums.length} ${albums.length === 1 ? 'álbum' : 'álbumes'}`
                      : `${songs.length} ${songs.length === 1 ? 'canción' : 'canciones'}`}
              </Text>
            </View>

            <View style={styles.libraryHeaderActions}>      
              <Pressable
                style={styles.headerIconButton}
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
                <Text style={styles.headerIconText}>
                  {searchVisible ? 'x' : '⌕'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.headerIconButton}
                onPress={() => {
                  setSortOrder((currentOrder) =>
                    currentOrder === 'asc' ? 'desc' : 'asc'
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  sortOrder === 'asc'
                    ? 'Ordenar de Z a A'
                    : 'Ordenar de A a Z'
                }
              >
                <Text style={styles.headerSortText}>
                  {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                </Text>
              </Pressable>  

              {activeScreen === 'library' && (
                <Pressable
                  style={[
                    styles.headerIconButton,
                    libraryOptionsVisible && styles.headerIconButtonActive,
                  ]}  
                  onPress={() =>
                    setLibraryOptionsVisible((visible) => !visible)
                  }  
                  accessibilityRole="button"
                  accessibilityLabel="Más opciones de biblioteca"
                >
                  <Text style={styles.headerIconText}>...</Text>
                </Pressable>  
              )}
            </View>
          </View>

          {activeScreen === 'library' && (
            <View style={styles.libraryPrimaryActions}>
              <Animated.View            
                style={[
                  styles.importButtonContainer,
                  {
                    transform: [{ scale: importButtonScale }],
                  },
                ]}  
              >
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.importButtonGlow,
                    {
                      opacity: importButtonGlow,
                      transform: [
                        {
                          scale: importButtonGlow.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.96, 1.08],
                          }),
                        },
                      ],
                    },
                  ]}
                />

                <Pressable
                  style={styles.importPrimaryButton}
                  onPress={openImportMenu}
                  onPressIn={animateImportButtonIn}
                  onPressOut={animateImportButtonOut}
                  accessibilityRole="button"
                  accessibilityLabel="Importar música"
                >
                  <Ionicons
                    name="musical-notes"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text style={styles.importPrimaryButtonText}>
                    Importar música
                  </Text>  
                </Pressable>
              </Animated.View>
            </View>       
          )}
          
          {activeScreen === 'library' && 
            libraryOptionsVisible && 
            selectedLibrary === 'all' && 
            selectedLibraryView === 'songs' &&
            (songs.length > 0 || favoriteSongIds.length > 0) && (
            <View style={styles.libraryOptionsMenu}>
                  <Pressable
                    style={styles.libraryOption}
                    onPress={confirmClearLibrary}
                    accessibilityRole="button"
                    accessibilityLabel="Limpiar biblioteca"
                    accessibilityHint="Quitar las canciones y favoritos de Candy Music, sin borrar los archivos del teléfono" 
                  >
                    <View style={styles.libraryOptionIcon}>
                      <Ionicons
                        name="trash-outline"
                        size={19}
                        color="#FF9AAB"
                      />  
                    </View>

                    <View style={styles.libraryOptionInfo}>
                      <Text style={styles.libraryOptionDanger}>
                        Limpiar biblioteca
                      </Text>

                      <Text style={styles.libraryOptionDescription}>
                        Quitar todas las canciones y favoritos
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#85859D" 
                    />   
                  </Pressable>  
            </View>        
          )}
              
          {searchVisible && (  
            <TextInput
              style={styles.searchInput}
              placeholder={
                selectedLibraryView === 'albums'
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
              <View style={styles.albumDetailContainer}>

                {/* BOTÓN PARA REGRESAR */}
                <Pressable
                  onPress={closeAlbum}
                  style={styles.albumBackButton}
                  accessibilityRole="button"
                  accessibilityLabel={
                    albumSource === 'favorites'
                      ? "Regresar a favoritos"
                      : 'Regresar a los álbumes'
                  }    
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color="#C4B5FD"
                  />

                  <Text style={styles.albumBackText}>
                    {albumSource === 'favorites'
                      ? 'Volver a favoritos'
                      : 'Volver a los álbumes'}
                  </Text>
                </Pressable>

              {/* INFORMACIÓN Y ACCIONES DEL ÁLBUM */}
              <View style={styles.albumDetailHeader}>

                {/* PORTADA */}      
                {selectedAlbum.artwork ? (
                  <Image
                    source={{ uri: selectedAlbum.artwork }}
                    style={styles.albumDetailArtwork}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.albumDetailArtworkFallback}>
                    <LinearGradient
                      colors={['#55358A', '#30204F', '#19172B']}
                      style={styles.albumDetailArtworkGradient}
                    >
                      <Ionicons
                        name="musical-notes"
                        size={30}
                        color="#C4B5FD"
                      />  
                    </LinearGradient>
                  </View>        
                )}

                {/* INFOMACION */}
                <View style={styles.albumDetailInfo}>     
                  <Text
                    style={styles.albumDetailName}
                    numberOfLines={2}
                  >
                    {selectedAlbum.name}
                  </Text>

                  <Text
                    style={styles.albumDetailArtist}
                    numberOfLines={1}
                  >
                    {selectedAlbum.artist}
                  </Text>

                  <Text style={styles.albumDetailCount}>             
                    {selectedAlbum.songs.length}{' '}
                    {albumSource === 'favorites'
                      ? selectedAlbum.songs.length === 1 
                        ? 'canción favorita'
                        : 'canciones favoritas'
                      : selectedAlbum.songs.length === 1
                        ? 'canción' 
                        : 'canciones'}
                  </Text>  
                </View>   
                
                {/* BOTON A LA DERECHA */}
                <View style={styles.albumDetailActions}>

                <Animated.View
                      style={[
                        styles.albumPlayButtonContainer,
                        {
                          transform: [{ scale: albumPlayScale }],
                        },
                      ]}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.albumPlayButtonGlow,
                      {
                        opacity: albumPlayGrow,
                        transform: [
                          {
                            scale: albumPlayGrow.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.96, 1.08],
                            }),
                          },
                        ],
                      },
                    ]}
                  />

                  <Pressable
                    style={[
                      styles.albumPlayButton,
                      selectedAlbum.songs.length === 0 &&
                        styles.albumPlayButtonDisabled,
                    ]}
                    disabled={selectedAlbum.songs.length === 0}
                    onPressIn={animateAlbumPlayButtonIn}
                    onPressOut={animateAlbumPlayButtonOut}
                    onPress={() => {
                      const firstSong = selectedAlbum.songs[0];

                      if (!firstSong) {
                        return;
                      }

                      playSong(
                        firstSong,
                        true,
                        selectedAlbum.songs,
                        albumSource === 'favorites'
                          ? 'favoriteAlbum'
                          : 'album'
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Reproducir álbum completo"
                  >
                    <Ionicons
                      name="play"
                      size={20}
                      color="#FFFFFF"
                    />  
                  </Pressable>    
                </Animated.View>

                {albumSource === 'albums' && (
                  <Pressable
                    onPress={() => removeAlbumFromLibrary(selectedAlbum)}
                    style={styles.albumDeleteButton}
                    accessibilityRole="button"
                    accessibilityLabel="Eliminar álbum completo"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color="#FF9AAB"
                    />  
                  </Pressable>  
                )}

              </View>
            </View>    

                {/* ENCABEZADO DE LA LISTA */}
                <View style={styles.albumSongsHeader}>
                  <Text style={styles.albumSongsTitle}>
                    Canciones
                  </Text>

                  <Text style={styles.albumSongsCount}>
                    {selectedAlbum.songs.length}
                  </Text>
                </View>  

                {/* LISTA DE CANCIONES */}
                <FlatList
                  style={styles.albumSongsList}
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
                            styles.albumSongItem,
                            isCurrentSong && styles.songItemActive,
                            { flex: 1 },
                          ]}
                          onPress={() => 
                            playSong(
                              item,
                              true, 
                              selectedAlbum.songs,
                              albumSource === 'favorites' 
                                ? 'favoriteAlbum' 
                                : 'album'
                            )
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Reproducir ${item.name}`}
                        >  
                          {item.artwork ? (
                            <Image
                              source={{ uri: item.artwork }}
                              style={styles.albumSongArtwork}
                              resizeMode="cover"
                            />  
                          ) : (
                            <View style={styles.albumSongArtworkFallback}>
                              <View style={styles.songVinylDisc}>
                                <View style={styles.songVinylGroove} />
                                <View style={styles.songVinylLabel}>
                                  <Ionicons
                                    name="musical-notes"
                                    size={10}
                                    color="#21152F"
                                  />  
                                </View>
                              </View>
                            </View>
                          )}

                          <View style={styles.songItemInfo}>
                            <Text
                              style={[
                                styles.albumSongName,
                                isCurrentSong && styles.songItemTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>

                            <Text
                              style={styles.albumSongArtist}
                              numberOfLines={1}
                            >
                              {item.artist || 'Artista desconocido'}
                            </Text>    
                          </View>
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
                          <Ionicons
                            name={
                              albumSource === 'favorites'
                                ? "heart-dislike-outline"
                                : "trash-outline"
                            }    
                            size={19}
                            color="#A78BFA"
                          />  
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
                key={selectedLibraryView === 'albums' ? 'albums-grid' : 'songs-list'}
                style={{ flex: 1 }}
                numColumns={selectedLibraryView === 'albums' ? 2 : 1}
                columnWrapperStyle={
                  selectedLibraryView === 'albums'
                    ? styles.albumGridRow
                    : undefined
                }
                data={
                  selectedLibrary === 'favorites' 
                    ? selectedLibraryView === 'albums'
                      ? displayedFavoriteAlbums
                      : displayedSongs
                    : selectedLibraryView === 'albums'
                      ? displayedAlbums
                      : displayedSongs 
                }
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  if (selectedLibraryView === 'albums') {
                    return (
                      <Pressable
                        style={styles.albumCard}
                        onPress={() => openAlbum(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Abrir álbum ${item.name}`}
                      >
                        {item.artwork ? (
                          <Image
                            source={{ uri: item.artwork }}
                            style={styles.albumCardArtwork}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.albumCardArtworkFallback}>
                            <Text style={styles.albumArtworkNote}>♫</Text>
                          </View>
                        )}  

                          <View style={styles.albumCardInfo}>
                            <Text 
                              style={styles.albumcardName} 
                              numberOfLines={2}
                            >
                              {item.name}
                            </Text>

                            <Text 
                              style={styles.albumCardArtist} 
                              numberOfLines={1}
                            >
                              {item.artist}
                            </Text> 

                            <Text style={styles.albumCardCount}>
                              {item.songs.length}{' '}
                              {item.songs.length === 1 
                                ? selectedLibrary === 'favorites'
                                  ? 'favorita'
                                  : 'canción'
                                : selectedLibrary === 'favorites'
                                  ? 'favoritas'
                                  : 'canciones'}
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
                        {item.artwork ? (
                          <Image
                            source={{ uri: item.artwork }}
                            style={styles.songArtwork}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.songArtworkFallback}>
                            <View style={styles.songVinylDisc}>
                              <View style={styles.songVinylGroove} />
                              <View style={styles.songVinylLabel}>
                                <Ionicons
                                  name="musical-notes"
                                  size={10}
                                  color="#21152F"
                                />  
                              </View>
                            </View>
                          </View>
                        )}

                        <View style={styles.songItemInfo}>
                          <Text
                            style={[
                              styles.songItemText,
                              isCurrentSong && styles.songItemTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>

                          <Text style={styles.sonItemArtist} numberOfLines={1}>
                            {item.artist || 'Artista desconocido'}
                          </Text>  
                        </View>  
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
                        <Ionicons
                          name={
                            selectedLibrary === 'favorites'
                              ? 'heart-dislike-outline'
                              : 'trash-outline'
                          }
                          size={20}
                          color="#A78BFA"
                        />
                      </Pressable>
                    </View>      
                  );
                }}

                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    {selectedLibrary === 'favorites'
                      ? selectedLibraryView === 'albums' 
                        ? 'Todavía no tienes álbumes favoritos.'
                        : 'Todavía no tienes canciones favoritas.'
                      : selectedLibraryView === 'albums'
                          ? 'Todavía no tienes álbumes para mostrar.'
                          : 'Importa tus canciones para verlas aquí.'}
                  </Text>
                }
              />
            )}  
            </View>
            )}  

            <View style={styles.bottomNavigation}>
              <Pressable
                style={[
                  styles.bottomNavigationItem,
                  activeScreen === 'player' && styles.bottomNavigationItemActive,
                ]}
                onPress={() => navigateTo('player')}
                accessibilityRole="button"
                accessibilityLabel="Ir al reproductor"
              >
                <Text style={styles.bottomNavigationIcon}>♫</Text>
                <Text style={styles.bottomNavigationText}>Reproductor</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.bottomNavigationItem,
                  activeScreen === 'library' && styles.bottomNavigationItemActive,
                ]}
                onPress={() => navigateTo('library')}
                accessibilityRole="button"
                accessibilityLabel="Ir a la biblioteca"
              >
                <Text style={styles.bottomNavigationIcon}>▤</Text>
                <Text style={styles.bottomNavigationText}>Biblioteca</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.bottomNavigationItem,
                  activeScreen === 'albums' && styles.bottomNavigationItemActive,
                ]}
                onPress={() => navigateTo('albums')}
                accessibilityRole="button"
                accessibilityLabel="Ir a álbumes"
              >
                <Text style={styles.bottomNavigationIcon}>▣</Text>
                <Text style={styles.bottomNavigationText}>Álbumes</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.bottomNavigationItem,
                  activeScreen === 'favorites' && styles.bottomNavigationItemActive,
                ]}
                onPress={() => navigateTo('favorites')}
                accessibilityRole="button"
                accessibilityLabel="Ir a favoritos"
              >
                <Text style={styles.bottomNavigationIcon}>♥</Text>
                <Text style={styles.bottomNavigationText}>Favoritos</Text>
              </Pressable>
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
      flex: 1,
      width: '100%',
      backgroundColor: '#211B32',
      borderRadius: 26,
      paddingHorizontal: 16,
      paddingVertical: 18,
      borderWidth: 1,
      borderColor: '#494064',
      shadowColor: '#8B5CF6',
      shadowOffset: {
        width: 0,
        height: 0,
      },
      shadowOpacity: 0.16,
      shadowRadius: 18,
      elevation: 8,
    },
    playerInfoRow: {
      flex: 1,
      width: '100%',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 8,
      gap: 22,
    },
    playerSongInfo: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      gap: 12,
      transform: [{ translateY: 6 }],
    },
    playerTrackDetails: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    playerHidden: {
      display: 'none',
    },
    miniPlayer: {
      width: '100%',
      minHeight: 82,
      backgroundColor: '#1C1C2E',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#393653',
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    miniPlayerArtwork: {
      width: 54,
      height: 54,
      borderRadius: 12,
      backgroundColor: '#29243B',
    },
    miniPlayerArtworkPlaceholder: {
      width: 54,
      height: 54,
      borderRadius: 12,
      backgroundColor: '#302448',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniVinylDisc: {
      width: 42,
      height: 42,
      borderRadius: 21, 
      backgroundColor: '#11101A',
      borderWidth: 1, 
      borderColor: '#51466B',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    miniVinylGrooveOuter: {
      position: 'absolute',
      width: '84%',
      height: '84%',
      borderRadius: 999,
      borderWidth: 1, 
      borderColor: 'rgba(220, 200, 255, 0.25)',
    },
    miniVinylGrooveMiddle: {
      position: 'absolute',
      width: '62%',
      height: '62%',
      borderRadius: 999,
      borderWidth: 1, 
      borderColor: 'rgba(220, 200, 255, 0.20)',
    },
    miniVinylLabel: {
      width: '34%',
      height: '34%',
      borderRadius: 999,
      backgroundColor: '#A78BFA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniPlayerArtworkIcon: {
      color: '#A78BFA',
      fontSize: 30,
    },
    miniPlayerInfo: {
      flex: 1,
      minWidth: 0,
      marginRight: 2,
    },
    miniPlayerTitle: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: 'bold',
    },
    miniPlayerArtist: {
      color: '#B9B9CC',
      fontSize: 11, 
      marginTop: 4,
    },
    miniPlayerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#A78BFA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniPlayerButtonText: {
      color: '#21152F',
      fontSize: 19,
      fontWeight: 'bold',
    },
    miniPlayerControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    miniPlayerSkipButton: {
      width: 30,
      height: 36,
      borderRadius: 10,
      backgroundColor: '#302448',
      alignItems: 'center',
      justifyContent: 'center',
    },
    miniPlayerSkipButtonText: {
      color: '#E9DFFF',
      fontSize: 15,
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
    bottomNavigation: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: '#1C1C2E',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#393653',
      paddingVertical: 8,
      marginTop: 4,
      marginBottom: 4,
    },
    bottomNavigationItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      gap: 4,
      borderRadius: 12,
    },
    bottomNavigationItemActive: {
      backgroundColor: '#302448',
    },
    bottomNavigationIcon: {
      color: '#A78BFA',
      fontSize: 20,
    },
    bottomNavigationText: {
      color: '#B9B9CC',
      fontSize: 10,
      fontWeight: '600',
    },
    favoriteTabs: {
      flexDirection: 'row',
      backgroundColor: '#10101C',
      borderRadius: 12,
      padding: 3,
      marginTop: -4,
      marginBottom: 14,
    },
    favoriteTab: {
      flex: 1,
      paddingVertical: 9,
      alignItems: 'center',
      borderRadius: 9,
    },
    favoriteTabActive: {
      backgroundColor: '#51436F',
    },
    favoriteTabText: {
      color: '#B9B9CC',
      fontSize: 12,
      fontWeight: '600',
    },
    favoriteTabTextActive: {
      color: '#FFFFFF',
      fontWeight: 'bold',
    },
    libraryHeader: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 8,
    },
    libraryHeading: {
      flex: 1,
      minWidth: 0,
    },
    libraryHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    headerIconButton: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: '#29243B',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIconButtonActive: {
      backgroundColor: '#51436F',
      borderColor: '#A78BFA',
    },
    headerIconText: {
      color: '#C4B5FD',
      fontSize: 25,
      fontWeight: '600',
    },
    headerSortText: {
      color: '#E9DFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    libraryPrimaryActions: {
      width: '100%',
      marginBottom: 12,
    },
    importButtonContainer: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    importButtonGlow: {
      position: 'absolute',
      width: '66%',
      height: 52,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: '#A78BFA',
      shadowColor: '#A78BFA',
      shadowOpacity: 0.9,
      shadowRadius: 14,
      elevation: 8,
    },
    importPrimaryButton: {
      width: '62%',
      backgroundColor: '#7C3AED',
      borderRadius: 15,
      paddingVertical: 11,
      paddingHorizontal: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: '#A78BFA',
      shadowColor: '#7C3AED',
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.35,
      shadowRadius: 9,
      elevation: 5,
    },
    importPrimaryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    libraryOptionsMenu: {
      width: '100%',
      backgroundColor: '#29243B',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: '#51436F',
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginBottom: 12,
    },
    libraryOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 10,
    },
    libraryOptionIcon: {
      width: 38,
      height: 38,
      borderRadius: 12, 
      backgroundColor: '#3A263B',
      borderWidth: 1,
      borderColor: '#704052',
      alignItems: 'center',
      justifyContent: 'center',
    },
    libraryOptionInfo: {
      flex: 1,
      minWidth: 0,
    },
     libraryOptionDanger: {
      color: '#FF9AAB',
      fontSize: 13, 
      fontWeight: '700',
    },
    libraryOptionDescription: {
      color: '#B9B9CC',
      fontSize: 11, 
      marginTop: 4,
    },
    libraryOptionText: {
      color: '#E9DFFF',
      fontSize: 13,
      fontWeight: '600',
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
    scanDeviceButton: {
      backgroundColor: '#29243B',
      borderWidth: 1,
      borderColor: '#51436F',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    scanDeviceButtonText: {
      color: '#E9DFFF',
      fontSize: 13,
      fontWeight: '600',
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
    albumDetailContainer: {
      flex: 1,
      width: '100%',
    },
    albumBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingVertical: 10,
      paddingRight: 14,
      marginBottom: 8,
      gap: 5,
    },
    albumBackText: {
      color: '#C4B5FD',
      fontSize: 14,
      fontWeight: '600',
    },
    albumDetailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 2,
      paddingBottom: 16,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#39304F',
    },
    albumDetailArtwork: {
      width: 78,
      height: 78,
      borderRadius: 14,
      borderWidth: 1, 
      borderColor: '#756096',
      backgroundColor: '#302448'
    },
    albumDetailArtworkFallback: {
      width: 78,
      height: 78,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1, 
      borderColor: '#756096',
    },
    albumDetailArtworkGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    albumDetailInfo: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    albumDetailName: {
      color: '#FFFFFF',
      fontSize: 16, 
      fontWeight: '700',
      textAlign: 'left',
      lineHeight: 20,
    },
    albumDetailArtist: {
      color: '#C4B5FD',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
    albumDetailCount: {
      color: '#85859D',
      fontSize: 11,
      marginTop: 3,
    },
    albumDetailActions: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    albumActionsRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    albumPlayButtonContainer: {
      width: 42,
      height: 42,
      position: 'relative'
    },
    albumPlayButtonGlow: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      borderRadius: 12,
      borderWidth: 1, 
      borderColor: '#A78BFA',
      shadowColor: '#A78BFA',
      shadowOpacity: 0.6,
      shadowRadius: 8,
      elevation: 5,
    },
    albumPlayButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#7C3AED',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#A78BFA',
    },
    albumPlayButtonDisabled: {
      opacity: 0.45,
    },
    albumPlayButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    albumDeleteButton: {
      width: 42,
      height:42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#302448',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#704052',
    },
    albumSongsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      paddingHorizontal: 3, 
    },
    albumSongsTitle: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    albumSongsCount: {
      color: '#C4B5FD',
      fontSize: 12,
      fontWeight: '600',
      backgroundColor: '#302448',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      overflow: 'hidden',
    },
    albumSongsList: {
      flex: 1,
      minHeight: 0,
    },
    albumSongItem: {
      paddingVertical: 12,
      paddingHorizontal: 10,
      gap: 13, 
      marginBottom: 10,
      backgroundColor: '#211D32',
      borderWidth: 1, 
      borderColor: '#39304F',
    },
    albumSongArtwork: {
      width: 62,
      height: 62,
      borderRadius: 11,
      backgroundColor: '#302448',
    },
    albumSongArtworkFallback: {
      width: 62,
      height: 62,
      borderRadius: 11, 
      backgroundColor: '#302448',
      borderWidth: 1, 
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    albumSongName: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
    albumSongArtist: {
      color: '#B9A9D5',
      fontSize: 12, 
      marginTop: 5,
    },
    albumDeleteButtonText: {
      color: '#FF9AAB',
      fontSize: 13,
      fontWeight: '600',
    },
    albumGridRow: {
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    albumCard: {
      width: '48.5%',
      backgroundColor: '#252039',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#51436F',
      padding: 8,
      marginBottom: 2,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.22,
      shadowRadius: 8,
      elevation: 4,
    },
    albumCardArtwork: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 13,
      backgroundColor: '#302448',
      borderWidth: 1,
      borderColor: '#51436F',
    },
    albumCardArtworkFallback: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 13,
      backgroundColor: '#302448',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    albumCardInfo: {
      paddingTop: 11,
      paddingHorizontal: 3,
      paddingBottom: 5,
      minHeight: 104,
    },
    albumcardName: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
      minHeight: 36,
    },
    albumCardArtist: {
      color: '#C4B5FD',
      fontSize: 12,
      lineHeight: 16,
      marginTop: 4,
    },
    albumCardCount: {
      color: '#D8C9F5',
      fontSize: 10,
      fontWeight: '600',
      marginTop: 8,
      backgroundColor: '#3A3150',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 8,
      alignSelf: 'flex-start',
      overflow: 'hidden',
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
    songArtwork: {
      width: 54,
      height: 54,
      borderRadius: 10,
      backgroundColor: '#302448',
    },
    songArtworkFallback: {
      width: 54,
      height: 54,
      borderRadius: 9,
      backgroundColor: '#302448',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    songVinylDisc: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: '#11101A',
      borderWidth: 1,
      borderColor: '#756096',
      alignItems: 'center',
      justifyContent: 'center',
    },
    songVinylGroove: {
      position: 'absolute',
      width: '75%',
      height: '75%',
      borderRadius: 999,
      borderWidth: 1, 
      borderColor: 'rgba(220, 200, 255, 0.25)',
    },
    songVinylLabel: {
      width: 12, 
      height: 12,
      borderRadius: 6, 
      backgroundColor: '#A78BFA',
      alignItems: 'center',
      justifyContent: 'center',
    },
    songItemInfo: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    sonItemArtist: {
      color: '#A99BBF',
      fontSize: 11,
      marginTop: 4, 
    },
    songItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: 11,
    },
    songItemActive: {
      backgroundColor: '#302747',
      borderWidth: 1,
      borderColor: '#51436F',
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
      width: '100%',
      maxWidth: 350,
      aspectRatio: 1,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: '#494064',
      overflow: 'hidden',
    },
    artwork: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
    },
    artworkFallback: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
      overflow: 'hidden',
    },
    artworkFallbackGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    vinylDisc: {
      width: '72%',
      aspectRatio: 1,
      borderRadius: 999,
      backgroundColor: '#11101A',
      borderWidth: 2,
      borderColor: '#51466B',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      elevation: 12,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
    },
    vinylGrooveOuter: {
      position: 'absolute',
      width: '88%',
      height: '88%',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(220, 200, 255, 0.22)',
    },
    vinylGrooveMiddle: {
      position: 'absolute',
      width: '72%',
      height: '72%',
      borderRadius: 999,
      borderWidth: 1, 
      borderColor: 'rgba(220, 200, 255, 0.18)',
    },
    vinylGrooveInner: {
      position: 'absolute',
      width: '56%',
      height: '56%',
      borderRadius: 999,
      borderWidth: 1, 
      borderColor: 'rgba(220, 200, 255, 0.14)',
    },
    vinylLabel: {
      width: '34%',
      aspectRatio: 1, 
      borderRadius: 999,
      borderWidth: 2, 
      borderColor: '#C5A9FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    note: {
      color: '#A78BFA',
      fontSize: 76,
      textAlign: 'center',
    },
    songTitle: {
      width: '100%',
      color: '#FFFFFF',
      fontSize: 19,
      fontWeight: 'bold',
      textAlign: 'left',
    },
    songArtist: {
      color: '#C4B5FD',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'left',
      marginTop: 5,
    },
    songAlbum: {
      width: '100%',
      color: '#85859D',
      fontSize: 12,
      textAlign: 'left',
      marginTop: 4,
    },
    playerProgress: {
      width: '100%',
      marginTop: 0,
      paddingHorizontal: 4,
      transform: [{ translateY: -15 }],
    },
    progressTime: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    progressTimeText: {
      color: '#A5A0B8',
      fontSize: 11,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    progressTrack: {
      width: '100%',
      height: 8,
      backgroundColor: '#393653',
      borderRadius: 10,
      position: 'relative',
      justifyContent: 'center',
      marginTop: 5,
      overflow: 'visible',
    },
    progressFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      height: 8,
      borderRadius: 10,
    },
    progressThumb: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: 8,
      top: -4,
      marginLeft: -8,
      backgroundColor: '#FFFFFF',
      borderWidth: 3,
      borderColor: '#A78BFA',
      elevation: 4,
    },
    progressSlider: {
      position: 'absolute',
      left: 0,
      top: -16,
      width: '100%',
      height: 40,
      opacity: 1,
      zIndex: 2,
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
    playbackControls: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 0,
      gap: 12,
      marginTop: 14,
      marginBottom: 4,
    },
    repeatButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#29243B',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    repeatButtonText: {
      fontSize: 25,
      color: '#C4B5FD',
      fontWeight: '600',
    },
    shuffleButtonText: {
      fontSize: 25,
      lineHeight: 29,
      color: '#C4B5FD',
      fontWeight: '600',
      textAlign: 'center',
      includeFontPadding: false,
      transform: [{ translateY: 2 }],
    },
    repeatButtonActive: {
      backgroundColor: '#51436F',
      borderColor: '#A78BFA'
    },
    skipButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: '#302448',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipButtonText: {
      color: '#E9DFFF',
      fontSize: 18,
      fontWeight: '700',
    },
    playButton: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: '#A78BFA',
      borderWidth: 3,
      borderColor: '#C4B5FD',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#A78BFA',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.38,
      shadowRadius: 10,
      elevation: 7,
    },
    playButtonText: {
      color: '#21152F',
      fontSize: 29,
      fontWeight: 'bold',
    },
    progressFavoriteRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginBottom: 10,
    },
    favoritePlayerButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: '#302448',
      borderWidth: 1,
      borderColor: '#51436F',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -8,
    },
    favoritePlayerButtonText: {
      color: '#D8D5E5',
      fontSize: 25,
    },
    favoritePlayerButtonActive: {
      color: '#FF4D6D',
    },
    message: {
      color: '#85859D',
      fontSize: 12,
      marginTop: 10,
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
