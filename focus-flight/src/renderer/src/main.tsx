import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Overlay from './components/Overlay'
import './styles.css'

const isOverlay = window.location.hash === '#overlay'
document.body.classList.toggle('overlay-body', isOverlay)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <Overlay /> : <App />}</StrictMode>
)
