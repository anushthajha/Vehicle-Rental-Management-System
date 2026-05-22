import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Phase 1 scaffold</p>
        <h1>Zoomcar Clone</h1>
        <p>
          Docker, FastAPI, MySQL, MongoDB, Redis, Celery, Nginx, and React are ready for the next build phase.
        </p>
        <a href="/api/docs">Open API Docs</a>
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
