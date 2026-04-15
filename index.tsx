import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Einstiegspunkt der Anwendung: React-Root an das DOM-Element 'root' binden
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// App im StrictMode rendern (aktiviert zusätzliche Warnungen in der Entwicklung)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
