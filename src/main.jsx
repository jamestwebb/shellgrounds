// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Main React entrypoint for The Gauntlet

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
