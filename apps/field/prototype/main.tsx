// The prototype's page (ADR-561 (7); task 3.1.4): the app's look and its own panel's.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './prototype.css';
import { Prototype } from './prototype.tsx';

const place = document.getElementById('app');
if (place === null) throw new Error('index.html has no element for the prototype.');

createRoot(place).render(
  <StrictMode>
    <Prototype />
  </StrictMode>,
);
