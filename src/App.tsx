import React from 'react';
import DemoProgress from './components/DemoProgress';

export default function App() {
  return (
    <div className="page">
      <header className="page-header">
        <div className="container">
          <h1 style={{ fontSize: 28, marginBottom: 6 }}>TableCore – Progress demo</h1>
          <p style={{ color: '#94a3b8', margin: 0 }}>
            Viser aktiviteter fra IndexedDB via ActivityRepo. Redigerbar tabell (MVP).
          </p>
        </div>
      </header>

      <main className="page-main">
        <div className="container">
          <div className="card card--sharp">
            <DemoProgress />
          </div>
        </div>
      </main>

      <footer className="page-footer">
        <div className="container">
          <div className="footer-inner">
            <span>© Manage Systemet • TableCore</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
