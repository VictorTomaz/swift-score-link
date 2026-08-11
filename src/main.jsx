import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Respect system dark/light preference; default to dark on Android
const isAndroid = /android/i.test(navigator.userAgent);
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (isAndroid || prefersDark) {
  document.documentElement.classList.add('dark');
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)