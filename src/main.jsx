import React from 'react';
import { createRoot } from 'react-dom/client';
import ERDiagram from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ERDiagram />
  </React.StrictMode>
);
