import { createAudioPlayer } from "expo-audio";

let audioPlayer = null;

export function getAudioPlayer(audioSource) {
  if (audioPlayer === null) {
    audioPlayer = createAudioPlayer(audioSource);
  }

  return audioPlayer;
}

export function releaseAudioPlayer() {
  if (audioPlayer !== null) {
    audioPlayer.remove();
    audioPlayer = null;
  }
}
