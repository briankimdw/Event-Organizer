import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import { AuthProvider } from './auth.jsx'
import { AvatarViewerProvider } from './components/AvatarViewer.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <AvatarViewerProvider>
            <App />
          </AvatarViewerProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
