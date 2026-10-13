import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Never let link fragments (which contain decryption keys) end up in error reports:
// strip the fragment from any URL that appears in an uncaught error message.
window.addEventListener('error', (e) => {
  if (typeof e.message === 'string' && /#[rqaw]=/.test(e.message)) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
