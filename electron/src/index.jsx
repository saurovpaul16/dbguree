import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './styles/components.css';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
