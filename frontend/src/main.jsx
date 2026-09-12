import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './lib/store'
// Leaflet draws the review map. Its stylesheet has to be present before the
// library is loaded, and the library itself is imported lazily so a reviewer
// who never opens a record never downloads it.
import 'leaflet/dist/leaflet.css'
import './styles/app.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
)
