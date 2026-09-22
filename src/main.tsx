import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './assets/fonts.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root no encontrado');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
