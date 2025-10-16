import React from 'react';
import DemoProgress from './components/DemoProgress';

export default function App() {
  return (
    <div className="container">
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>TableCore – Progress demo</h1>
      <p style={{ color: '#94a3b8', marginBottom: 20 }}>
        Viser aktiviteter fra IndexedDB via ActivityRepo. Tabell er foreløpig lesemodus (MVP).
      </p>
      <div className="card" style={{ padding: 16 }}>
        <DemoProgress />
      </div>
    </div>
  );
}
