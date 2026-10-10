// App entry. Order matters: the shims give shared web code (frontend/src) the
// browser globals it expects (env, localStorage, crypto...) before any of it loads.
import './src/shims/install'
import 'expo-router/entry'
