import { createAudioPlayer } from "expo-audio";

let audioPlayer = null;

export function getAudioPlayer() {
  if (audioPlayer === null) {
    audioPlayer = createAudioPlayer(null);
  }

  return audioPlayer;
}

export function releaseAudioPlayer() {
  if (audioPlayer !== null) {
    audioPlayer.remove();
    audioPlayer = null;
  }
}
