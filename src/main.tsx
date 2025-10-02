// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToasterProvider } from './components/ui/Toaster'
import { P2PProvider } from './context/P2PProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToasterProvider>
      <P2PProvider>
        <App />
      </P2PProvider>
    </ToasterProvider>
  </StrictMode>,
)
