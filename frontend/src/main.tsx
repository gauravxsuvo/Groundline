import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Arms the scroll reveal before anything renders. The hidden state in index.css
// is scoped to this class, so if the bundle fails to load the page is plain
// visible content rather than a blank white screen.
document.documentElement.classList.add('reveal-ready')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
