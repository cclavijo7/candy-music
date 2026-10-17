import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.title}>CANDY MUSIC</Text>
      <Text style={styles.subtitle}>Tu música, a tu manera.</Text>

      <View style={styles.player}>
        <Text style={styles.note}>♫</Text>
        <Text style={styles.songTitle}>Tu música te espera</Text>
        <Text style={styles.message}>Pronto podrás escuchar tus canciones favoritas aquí.</Text>
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
  footer: {
    color: '#85859D',
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 36,
  }
});
